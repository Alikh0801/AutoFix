-- AutoFix — QA pass fixes.
--
-- Covers the non-placeholder findings from the full-app QA. The test-mode auth
-- (phone-derived password) and the fake wallet/commission settlement are
-- deliberately left alone: both disappear with the OTP + online-payment
-- integration.

-- ---------------------------------------------------------------------------
-- 1) Role-scoped ratings
--
-- rating_avg was computed from EVERY rating a user ever received. Because one
-- account is both a customer and a provider, the stars someone earned as a
-- stranded driver were averaged into their usta rating (and vice versa). A
-- rating belongs to whichever side of ITS OWN request the ratee was on.
-- ---------------------------------------------------------------------------
create or replace function provider_rating_of(p_uid uuid)
returns table (rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = public as $$
  select coalesce(round(avg(rt.stars)::numeric, 1), 0), count(*)::int
  from ratings rt
  join requests rq on rq.id = rt.request_id
  where rt.ratee_id = p_uid and rq.provider_id = p_uid;
$$;

create or replace function customer_rating_of(p_uid uuid)
returns table (rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = public as $$
  select coalesce(round(avg(rt.stars)::numeric, 1), 0), count(*)::int
  from ratings rt
  join requests rq on rq.id = rt.request_id
  where rt.ratee_id = p_uid and rq.customer_id = p_uid;
$$;

create or replace function submit_rating(p_request_id uuid, p_stars int, p_comment text default null)
returns ratings language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  v_req    requests;
  v_ratee  uuid;
  v_rating ratings;
begin
  if p_stars < 1 or p_stars > 5 then raise exception 'Stars must be between 1 and 5'; end if;

  select * into v_req from requests where id = p_request_id;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_req.status <> 'completed' then raise exception 'Request is not completed'; end if;

  if v_uid = v_req.customer_id then
    v_ratee := v_req.provider_id;
  elsif v_uid = v_req.provider_id then
    v_ratee := v_req.customer_id;
  else
    raise exception 'Not a participant of this request';
  end if;
  if v_ratee is null then raise exception 'No counterpart to rate'; end if;

  insert into ratings (request_id, rater_id, ratee_id, stars, comment)
  values (p_request_id, v_uid, v_ratee, p_stars, nullif(p_comment, ''))
  on conflict (request_id, rater_id)
  do update set stars = excluded.stars, comment = excluded.comment
  returning * into v_rating;

  -- Only the ratee's PROVIDER-side stars belong in provider_profiles.
  update provider_profiles p
     set rating_avg = r.rating_avg,
         rating_count = r.rating_count
    from provider_rating_of(v_ratee) r
   where p.id = v_ratee;

  return v_rating;
end;
$$;

-- Repair the aggregates the old mixed-in formula already wrote. Reset first,
-- so a provider whose stars were ALL customer-side ones drops back to zero
-- instead of keeping a stale average no rating backs any more.
update provider_profiles set rating_avg = 0, rating_count = 0;

update provider_profiles p
   set rating_avg = r.avg_stars,
       rating_count = r.cnt
  from (
    select rt.ratee_id,
           round(avg(rt.stars)::numeric, 1) as avg_stars,
           count(*)::int                    as cnt
    from ratings rt
    join requests rq on rq.id = rt.request_id
    where rq.provider_id = rt.ratee_id
    group by rt.ratee_id
  ) r
 where r.ratee_id = p.id;

-- ---------------------------------------------------------------------------
-- 2) A job stuck in 'in_progress' trapped both parties forever
--
-- 0020 let either side cancel an accepted job, but stopped at 'arrived'. Once
-- the provider tapped "Təmirə başladım" and then vanished, nothing could close
-- the request: my_active_request() kept returning it, so create_request()
-- refused every new request the customer made — permanently.
-- ---------------------------------------------------------------------------
create or replace function cancel_active_job(p_request_id uuid)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
begin
  select * into v_req from requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_uid <> v_req.customer_id and v_uid <> v_req.provider_id then
    raise exception 'Not a participant of this request';
  end if;
  if v_req.status not in ('accepted', 'en_route', 'arrived', 'in_progress') then
    raise exception 'This job can no longer be cancelled';
  end if;

  update requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Stale 'searching' requests never expired
--
-- provider_feed only shows requests from the last 15 minutes, but nothing ever
-- moved an unanswered request out of 'searching'. It stayed invisible to every
-- provider while still counting as the customer's one active request, so they
-- waited on the Searching screen forever and could not start a new one. The
-- 'expired' status existed in the enum and in the UI copy but was never set.
--
-- A request that already has live offers gets a longer grace period: the
-- customer can still accept one of those after it has left the feeds.
-- ---------------------------------------------------------------------------
create or replace function expire_stale_requests()
returns void language sql volatile security definer set search_path = public as $$
  update requests r
     set status = 'expired'
   where r.status = 'searching'
     and (
       (r.created_at < now() - interval '15 minutes'
         and not exists (select 1 from offers o
                         where o.request_id = r.id and o.status = 'pending'))
       or r.created_at < now() - interval '60 minutes'
     );
$$;

create or replace function my_active_request()
returns table (id uuid, status request_status, category_id text)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform expire_stale_requests();
  return query
    select r.id, r.status, r.category_id
    from requests r
    where r.customer_id = auth.uid()
      and r.status in ('searching', 'accepted', 'en_route', 'arrived', 'in_progress')
    order by r.created_at desc
    limit 1;
end;
$$;

-- Also clear stale requests out of the way before refusing a new one.
create or replace function create_request(
  p_category        text,
  p_lat             double precision,
  p_lng             double precision,
  p_address         text default null,
  p_note            text default null,
  p_payment_method  payment_method default 'cash',
  p_city            text default null
)
returns uuid language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  perform expire_stale_requests();

  perform 1 from requests
   where customer_id = v_uid
     and status in ('searching', 'accepted', 'en_route', 'arrived', 'in_progress');
  if found then raise exception 'You already have an active request'; end if;

  perform 1 from service_categories where id = p_category and is_active;
  if not found then raise exception 'Invalid category'; end if;

  insert into requests (
    customer_id, category_id, status, payment_method,
    pickup_location, address_text, note, city
  ) values (
    v_uid, p_category, 'searching', p_payment_method,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, nullif(p_note, ''), p_city
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Direct UPDATE on requests was unrestricted
--
-- RLS gates rows but not columns, and the update policies carried no WITH
-- CHECK, so either participant could rewrite ANY column of their own request
-- straight from the client — including agreed_price, or status = 'completed',
-- which skips complete_request() and with it the entire commission path.
--
-- Every legitimate write already goes through a SECURITY DEFINER function, so
-- the client keeps no direct UPDATE at all. cancel_request() replaces the one
-- table write the app still made.
-- ---------------------------------------------------------------------------
create or replace function cancel_request(p_request_id uuid)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
begin
  select * into v_req from requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_req.customer_id <> v_uid then raise exception 'Not your request'; end if;
  if v_req.status <> 'searching' then raise exception 'Request is no longer open'; end if;

  update requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_request_id;

  update offers set status = 'closed'
   where request_id = p_request_id and status = 'pending';
end;
$$;

drop policy if exists "customer updates own requests" on requests;
drop policy if exists "assigned provider updates the request" on requests;

-- ---------------------------------------------------------------------------
-- 5) Every phone number was readable by every signed-in user
--
-- "profiles readable by authenticated users" USING (true) exposed the full
-- name and phone of the entire user base to anyone with an account. Each
-- screen that legitimately needs a counterpart's name or number already reads
-- it through a SECURITY DEFINER function scoped to one request
-- (provider_feed, request_detail, my_active_job, request_offers_detail), so
-- nothing depends on the blanket policy.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles readable by authenticated users" on profiles;
drop policy if exists "users read their own profile" on profiles;
create policy "users read their own profile"
  on profiles for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6) The customer could not call the assigned usta
--
-- The tracking screen's call button fired `tel:` with no number, because
-- request_detail never returned one — while the provider side has had the
-- customer's number since 0019. Symmetry restored.
-- ---------------------------------------------------------------------------
drop function if exists request_detail(uuid);
create or replace function request_detail(p_request_id uuid)
returns table (
  id                   uuid,
  status               request_status,
  category_id          text,
  agreed_price         numeric,
  payment_method       payment_method,
  pickup_lat           double precision,
  pickup_lng           double precision,
  provider_id          uuid,
  provider_name        text,
  provider_phone       text,
  provider_rating      numeric,
  provider_rating_cnt  integer,
  provider_lat         double precision,
  provider_lng         double precision
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.category_id, r.agreed_price, r.payment_method,
         ST_Y(r.pickup_location::geometry), ST_X(r.pickup_location::geometry),
         r.provider_id, pn.full_name, pn.phone,
         pr.rating_avg, pr.rating_count,
         ST_Y(pp.current_location::geometry), ST_X(pp.current_location::geometry)
  from requests r
  left join provider_profiles pp on pp.id = r.provider_id
  left join profiles pn on pn.id = r.provider_id
  left join lateral (select * from provider_rating_of(r.provider_id)) pr on true
  where r.id = p_request_id
    and (r.customer_id = auth.uid() or r.provider_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 7) advance_job accepted backwards transitions
--
-- Any of the three in-between statuses was reachable from any other, so a
-- misplaced tap could move a job from 'in_progress' back to 'en_route'.
-- ---------------------------------------------------------------------------
create or replace function advance_job(p_request_id uuid, p_status text)
returns request_status language plpgsql security definer as $$
declare
  v_uid   uuid := auth.uid();
  v_req   requests;
  v_order constant text[] := array['accepted', 'en_route', 'arrived', 'in_progress'];
begin
  if p_status not in ('en_route', 'arrived', 'in_progress') then
    raise exception 'Invalid status transition';
  end if;

  select * into v_req from requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_req.provider_id <> v_uid then raise exception 'Not your job'; end if;
  if v_req.status not in ('accepted', 'en_route', 'arrived', 'in_progress') then
    raise exception 'Job is not active';
  end if;

  if array_position(v_order, p_status) <= array_position(v_order, v_req.status::text) then
    raise exception 'Job cannot move backwards';
  end if;

  update requests set status = p_status::request_status where id = p_request_id;
  return p_status::request_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Deleting a provider wiped the customer's order history
--
-- 0014 made requests.provider_id cascade, so removing one provider deleted
-- every request they ever worked — including completed jobs that belong to
-- other people's history. The request should outlive the provider record.
-- ---------------------------------------------------------------------------
alter table requests drop constraint if exists requests_provider_id_fkey;
alter table requests add constraint requests_provider_id_fkey
  foreign key (provider_id) references provider_profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 9) Customer-facing ratings were mixed the same way as provider ones
-- ---------------------------------------------------------------------------
drop function if exists provider_feed(double precision, double precision, integer);
create or replace function provider_feed(
  lat       double precision,
  lng       double precision,
  radius_m  integer default 8000
)
returns table (
  id                     uuid,
  category_id            text,
  address_text           text,
  note                   text,
  payment_method         payment_method,
  distance_m             double precision,
  created_at             timestamptz,
  pickup_lat             double precision,
  pickup_lng             double precision,
  my_offer_price         numeric,
  my_offer_note          text,
  customer_name          text,
  customer_rating        numeric,
  customer_rating_count  integer,
  vehicle_make           text,
  vehicle_model          text,
  vehicle_plate          text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.category_id, r.address_text, r.note, r.payment_method,
         ST_Distance(r.pickup_location, ST_MakePoint(lng, lat)::geography) as distance_m,
         r.created_at,
         ST_Y(r.pickup_location::geometry), ST_X(r.pickup_location::geometry),
         mo.price as my_offer_price, mo.note as my_offer_note,
         c.full_name,
         cr.rating_avg, cr.rating_count,
         v.make, v.model, v.plate
  from requests r
  join profiles c on c.id = r.customer_id
  left join offers mo on mo.request_id = r.id and mo.provider_id = auth.uid()
  left join lateral (select * from customer_rating_of(r.customer_id)) cr on true
  left join lateral (
    select veh.make, veh.model, veh.plate
    from vehicles veh
    where veh.owner_id = r.customer_id
    order by veh.is_default desc, veh.created_at asc
    limit 1
  ) v on true
  where r.status = 'searching'
    and r.created_at > now() - interval '15 minutes'
    and r.customer_id <> auth.uid()
    and ST_DWithin(r.pickup_location, ST_MakePoint(lng, lat)::geography, radius_m)
    and (
      r.category_id = 'other'
      or exists (
        select 1 from provider_skills s
        where s.provider_id = auth.uid() and s.category_id = r.category_id
      )
    )
    and exists (
      select 1 from provider_wallets w where w.id = auth.uid() and not w.is_blocked
    )
  order by distance_m
$$;

drop function if exists my_active_job();
create or replace function my_active_job()
returns table (
  id                     uuid,
  status                 request_status,
  category_id            text,
  agreed_price           numeric,
  payment_method         payment_method,
  address_text           text,
  note                   text,
  pickup_lat             double precision,
  pickup_lng             double precision,
  customer_name          text,
  customer_phone         text,
  customer_rating        numeric,
  customer_rating_count  integer,
  vehicle_make           text,
  vehicle_model          text,
  vehicle_plate          text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.category_id, r.agreed_price, r.payment_method,
         r.address_text, r.note,
         ST_Y(r.pickup_location::geometry), ST_X(r.pickup_location::geometry),
         c.full_name, c.phone,
         cr.rating_avg, cr.rating_count,
         v.make, v.model, v.plate
  from requests r
  join profiles c on c.id = r.customer_id
  left join lateral (select * from customer_rating_of(r.customer_id)) cr on true
  left join lateral (
    select veh.make, veh.model, veh.plate
    from vehicles veh
    where veh.owner_id = r.customer_id
    order by veh.is_default desc, veh.created_at asc
    limit 1
  ) v on true
  where r.provider_id = auth.uid()
    and r.status in ('accepted', 'en_route', 'arrived', 'in_progress')
  order by r.accepted_at desc nulls last
  limit 1;
$$;

create or replace function request_offers_detail(p_request_id uuid)
returns table (
  offer_id               uuid,
  provider_id            uuid,
  price                  numeric,
  note                   text,
  status                 offer_status,
  provider_name          text,
  provider_phone         text,
  provider_rating        numeric,
  provider_rating_count  integer,
  vehicle_make           text,
  vehicle_model          text,
  vehicle_plate          text
)
language sql stable security definer set search_path = public as $$
  select o.id, o.provider_id, o.price, o.note, o.status,
         p.full_name, p.phone,
         pr.rating_avg, pr.rating_count,
         v.make, v.model, v.plate
  from offers o
  join profiles p on p.id = o.provider_id
  left join lateral (select * from provider_rating_of(o.provider_id)) pr on true
  left join lateral (
    select veh.make, veh.model, veh.plate
    from vehicles veh
    where veh.owner_id = o.provider_id
    order by veh.is_default desc, veh.created_at asc
    limit 1
  ) v on true
  where o.request_id = p_request_id
    and exists (
      select 1 from requests r where r.id = o.request_id and r.customer_id = auth.uid()
    )
  order by o.price asc;
$$;

-- ---------------------------------------------------------------------------
-- 10) The provider had no way to learn they were blocked
--
-- A blocked provider's feed simply comes back empty ("Yaxınlıqda uyğun sorğu
-- yoxdur") with no hint that unpaid commission is the reason — and the debt
-- banner lives on a tab they may never open. Expose the flag so the dashboard
-- can say so outright.
-- ---------------------------------------------------------------------------
create or replace function my_provider_state()
returns table (is_blocked boolean, commission_balance numeric)
language sql stable security definer set search_path = public as $$
  select w.is_blocked, w.commission_balance
  from provider_wallets w
  where w.id = auth.uid();
$$;
