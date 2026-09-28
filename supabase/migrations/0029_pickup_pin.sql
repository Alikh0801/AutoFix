-- AutoFix — proof that the usta and the customer are actually together.
--
-- Nothing could tell a real arrival from a claimed one: the usta could tap
-- "Məkana çatdım" from home and the customer had no way to contradict it. A
-- four-digit code the customer reads out, and the usta types in, is the
-- cheapest proof of presence there is — the job cannot move to 'arrived'
-- without the usta having spoken to someone standing at the pickup.
--
-- Scope is just this. No geofence, no no-show handling, no reliability score.
--
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- The code lives in its own table, not on requests
--
-- Row level security gates rows, not columns. A pin column on requests would
-- be readable by the assigned usta straight from PostgREST
-- (select=pickup_pin), and requests is in the realtime publication with FULL
-- replica identity, so it would also ride along in every change payload the
-- Panel subscribes to. Either one hands the usta the code and makes the whole
-- mechanism theatre. A separate table with no policy for the provider cannot
-- leak either way.
-- ---------------------------------------------------------------------------
create table if not exists request_pins (
  request_id  uuid primary key references requests(id) on delete cascade,
  pin         text not null,
  created_at  timestamptz not null default now()
);

alter table request_pins enable row level security;

-- Only the customer of that request, and only for reading. Every write goes
-- through a SECURITY DEFINER function, so there is no write policy at all.
drop policy if exists "customer reads own pickup pin" on request_pins;
create policy "customer reads own pickup pin"
  on request_pins for select to authenticated
  using (
    exists (
      select 1 from requests r
      where r.id = request_pins.request_id and r.customer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Issued when the job is accepted
-- ---------------------------------------------------------------------------
create or replace function issue_pickup_pin(p_request_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pin text := lpad((floor(random() * 10000))::int::text, 4, '0');
begin
  insert into request_pins (request_id, pin)
  values (p_request_id, v_pin)
  on conflict (request_id) do nothing;

  select pin into v_pin from request_pins where request_id = p_request_id;
  return v_pin;
end;
$$;

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

  perform issue_pickup_pin(v_req.id);

  return v_req;
end;
$$;

-- Jobs already in flight have no code; give them one rather than leaving
-- those ustas unable to advance.
insert into request_pins (request_id, pin)
select r.id, lpad((floor(random() * 10000))::int::text, 4, '0')
from requests r
where r.status in ('accepted', 'en_route', 'arrived', 'in_progress')
on conflict (request_id) do nothing;

-- ---------------------------------------------------------------------------
-- What the customer reads out
-- ---------------------------------------------------------------------------
create or replace function my_pickup_pin(p_request_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.pin
  from request_pins p
  join requests r on r.id = p.request_id
  where p.request_id = p_request_id
    and r.customer_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Checked on arrival
--
-- The parameter list changes, so the old two-argument version has to go: left
-- in place it would still match a two-argument call and wave the job through
-- without a code.
-- ---------------------------------------------------------------------------
drop function if exists advance_job(uuid, text);

create or replace function advance_job(p_request_id uuid, p_status text, p_pin text default null)
returns request_status language plpgsql security definer as $$
declare
  v_uid   uuid := auth.uid();
  v_req   requests;
  v_pin   text;
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

  -- Arrival is the claim worth proving, so it is the one that needs the code.
  if p_status = 'arrived' then
    select pin into v_pin from request_pins where request_id = p_request_id;
    if v_pin is null then
      v_pin := issue_pickup_pin(p_request_id);
    end if;
    if p_pin is null or regexp_replace(p_pin, '\D', '', 'g') <> v_pin then
      raise exception 'Pickup code is wrong';
    end if;
  end if;

  update requests set status = p_status::request_status where id = p_request_id;
  return p_status::request_status;
end;
$$;
