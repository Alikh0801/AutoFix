-- Jolt — block self-dealing so ratings can't be farmed.
--
-- Without this, one account could open a request as a customer, switch to
-- provider mode, bid on and complete its OWN request, then leave itself a
-- 5-star review. These changes make a user unable to be both sides of a job,
-- and route ratings through a validated function.

-- 1) A provider cannot bid on their own request.
create or replace function submit_offer(p_request_id uuid, p_price numeric)
returns offers language plpgsql security definer as $$
declare
  v_provider uuid := auth.uid();
  v_min      numeric;
  v_status   request_status;
  v_customer uuid;
  v_blocked  boolean;
  v_offer    offers;
begin
  select is_blocked into v_blocked from provider_wallets where id = v_provider;
  if v_blocked is null then raise exception 'Not a provider'; end if;
  if v_blocked then raise exception 'Provider is blocked (unpaid commission)'; end if;

  select r.status, r.customer_id, c.min_price into v_status, v_customer, v_min
  from requests r
  join service_categories c on c.id = r.category_id
  where r.id = p_request_id;

  if v_status is null then raise exception 'Request not found'; end if;
  if v_customer = v_provider then raise exception 'Cannot bid on your own request'; end if;
  if v_status <> 'searching' then raise exception 'Request is not open'; end if;
  if p_price < v_min then raise exception 'Price below minimum of % AZN', v_min; end if;

  insert into offers (request_id, provider_id, price)
  values (p_request_id, v_provider, p_price)
  on conflict (request_id, provider_id)
  do update set price = excluded.price, status = 'pending', updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;

-- 2) Backstop: never let a customer accept an offer from themselves.
create or replace function accept_offer(p_offer_id uuid)
returns requests language plpgsql security definer as $$
declare
  v_customer uuid := auth.uid();
  v_offer    offers;
  v_req      requests;
begin
  select * into v_offer from offers where id = p_offer_id;
  if v_offer is null then raise exception 'Offer not found'; end if;

  select * into v_req from requests where id = v_offer.request_id for update;
  if v_req.customer_id <> v_customer then raise exception 'Not your request'; end if;
  if v_offer.provider_id = v_req.customer_id then raise exception 'Cannot accept your own offer'; end if;
  if v_req.status <> 'searching' then raise exception 'Request no longer open'; end if;

  update requests
     set provider_id = v_offer.provider_id,
         agreed_price = v_offer.price,
         status = 'accepted',
         accepted_at = now()
   where id = v_req.id
  returning * into v_req;

  update offers set status = 'accepted' where id = v_offer.id;
  update offers set status = 'closed'
   where request_id = v_req.id and id <> v_offer.id and status = 'pending';

  return v_req;
end;
$$;

-- 3) Hide the caller's own requests from their own provider feed.
create or replace function nearby_open_requests(
  lat double precision,
  lng double precision,
  radius_m integer default 8000
)
returns setof requests language sql stable as $$
  select *
  from requests
  where status = 'searching'
    and customer_id <> auth.uid()
    and ST_DWithin(pickup_location, ST_MakePoint(lng, lat)::geography, radius_m)
  order by ST_Distance(pickup_location, ST_MakePoint(lng, lat)::geography)
$$;

-- 4) Ratings integrity: the two parties must differ, and ratings can only be
--    written through a validated function (not by direct insert).
alter table ratings drop constraint if exists ratings_distinct_parties;
alter table ratings add constraint ratings_distinct_parties check (rater_id <> ratee_id);

drop policy if exists "user writes own rating" on ratings;

-- Rate the OTHER party of a completed request; refresh their provider average.
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

  -- Refresh the ratee's provider aggregate (no-op if they aren't a provider).
  update provider_profiles p
     set rating_count = (select count(*) from ratings where ratee_id = p.id),
         rating_avg = coalesce((select round(avg(stars)::numeric, 1) from ratings where ratee_id = p.id), 0)
   where p.id = v_ratee;

  return v_rating;
end;
$$;
