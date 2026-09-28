-- AutoFix — an usta can only mark themselves arrived from the pickup point.
--
-- 0029 made the customer prove they are there, by reading out a code. This is
-- the other half: the usta's own device has to be at the pickup. Neither is
-- proof on its own — a code can be read down the phone, and a location can be
-- faked — but together they are awkward enough to stop the casual version of
-- both: tapping "çatdım" while still driving, or from home.
--
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- How close counts as arrived
--
-- Tunable without a migration, because the right number is a field question:
-- city GPS drifts by tens of metres between buildings, and too tight a radius
-- strands honest ustas while too loose defeats the point.
-- ---------------------------------------------------------------------------
alter table platform_settings
  add column if not exists arrival_radius_m integer not null default 150;

comment on column platform_settings.arrival_radius_m is
  'How near the pickup an usta must be to mark themselves arrived, in metres.';

-- ---------------------------------------------------------------------------
-- Checked on arrival, alongside the code
--
-- The position used is the one the active-job screen already streams every ten
-- seconds, not one sent with the tap. Both come from the same device and are
-- equally forgeable in principle, but a stream has to be faked continuously
-- and leaves a trail, where a single field on a single request does not. The
-- freshness check is what stops the other trick: drive past, kill GPS, tap
-- later from somewhere else.
-- ---------------------------------------------------------------------------
create or replace function advance_job(p_request_id uuid, p_status text, p_pin text default null)
returns request_status language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_req     requests;
  v_pin     text;
  v_radius  integer;
  v_dist    double precision;
  v_fix_age interval;
  v_order   constant text[] := array['accepted', 'en_route', 'arrived', 'in_progress'];
  -- A position older than this says nothing about where the usta is now.
  v_max_age constant interval := interval '3 minutes';
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

  if p_status = 'arrived' then
    -- Distance first: "you are 400 m away" is a more useful thing to be told
    -- than "wrong code" when the real problem is that you are not there yet.
    select s.arrival_radius_m into v_radius from platform_settings s limit 1;
    v_radius := coalesce(v_radius, 150);

    select ST_Distance(pp.current_location, v_req.pickup_location),
           now() - pp.location_updated_at
      into v_dist, v_fix_age
      from provider_profiles pp
     where pp.id = v_uid;

    if v_dist is null then
      raise exception 'No location fix for provider';
    end if;
    if v_fix_age is null or v_fix_age > v_max_age then
      raise exception 'Location fix is stale';
    end if;
    if v_dist > v_radius then
      raise exception 'Too far from pickup: % m', round(v_dist)::int;
    end if;

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

-- ---------------------------------------------------------------------------
-- So the app can grey the button out and say how far is left, rather than
-- letting the usta tap into a rejection.
-- ---------------------------------------------------------------------------
create or replace function arrival_radius_m()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select s.arrival_radius_m from platform_settings s limit 1), 150);
$$;
