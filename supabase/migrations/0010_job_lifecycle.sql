-- Jolt — accepted-job lifecycle: detail views + status advancing.
--
-- Ties together accept_offer / complete_request (already defined) with the
-- data the tracking and active-job screens need, plus a guarded status step.

-- Full detail for the customer's tracking screen (participants only).
-- Coordinates are returned as lat/lng so the client can compute distance/ETA.
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
  provider_rating      numeric,
  provider_rating_cnt  integer,
  provider_lat         double precision,
  provider_lng         double precision
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.category_id, r.agreed_price, r.payment_method,
         ST_Y(r.pickup_location::geometry), ST_X(r.pickup_location::geometry),
         r.provider_id, pn.full_name, pp.rating_avg, pp.rating_count,
         ST_Y(pp.current_location::geometry), ST_X(pp.current_location::geometry)
  from requests r
  left join provider_profiles pp on pp.id = r.provider_id
  left join profiles pn on pn.id = r.provider_id
  where r.id = p_request_id
    and (r.customer_id = auth.uid() or r.provider_id = auth.uid());
$$;

-- The provider's current active job (accepted → in_progress), if any.
create or replace function my_active_job()
returns table (
  id              uuid,
  status          request_status,
  category_id     text,
  agreed_price    numeric,
  payment_method  payment_method,
  address_text    text,
  note            text,
  pickup_lat      double precision,
  pickup_lng      double precision,
  customer_name   text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.category_id, r.agreed_price, r.payment_method,
         r.address_text, r.note,
         ST_Y(r.pickup_location::geometry), ST_X(r.pickup_location::geometry),
         c.full_name
  from requests r
  join profiles c on c.id = r.customer_id
  where r.provider_id = auth.uid()
    and r.status in ('accepted', 'en_route', 'arrived', 'in_progress')
  order by r.accepted_at desc nulls last
  limit 1;
$$;

-- Advance an accepted job's status. Only the assigned provider, and only to the
-- in-between statuses — completion must go through complete_request so the
-- commission is always applied.
create or replace function advance_job(p_request_id uuid, p_status text)
returns request_status language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
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

  update requests set status = p_status::request_status where id = p_request_id;
  return p_status::request_status;
end;
$$;
