-- Jolt — provider feed + online/location updates.

-- Set the provider's online flag and current GPS location (idempotent create).
create or replace function set_provider_status(
  p_online boolean,
  p_lat    double precision default null,
  p_lng    double precision default null
)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  insert into provider_profiles (id) values (v_uid) on conflict (id) do nothing;

  update provider_profiles
     set is_online = p_online,
         current_location = case
           when p_lat is not null and p_lng is not null
           then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
           else current_location end,
         location_updated_at = case
           when p_lat is not null and p_lng is not null then now()
           else location_updated_at end,
         updated_at = now()
   where id = v_uid;
end;
$$;

-- Open requests near the provider, limited to their selected skills, excluding
-- their own requests, nearest first — with distance so the app can show it.
create or replace function provider_feed(
  lat       double precision,
  lng       double precision,
  radius_m  integer default 8000
)
returns table (
  id              uuid,
  category_id     text,
  address_text    text,
  note            text,
  payment_method  payment_method,
  distance_m      double precision,
  created_at      timestamptz
)
language sql stable as $$
  select r.id, r.category_id, r.address_text, r.note, r.payment_method,
         ST_Distance(r.pickup_location, ST_MakePoint(lng, lat)::geography) as distance_m,
         r.created_at
  from requests r
  where r.status = 'searching'
    and r.customer_id <> auth.uid()
    and ST_DWithin(r.pickup_location, ST_MakePoint(lng, lat)::geography, radius_m)
    and exists (
      select 1 from provider_skills s
      where s.provider_id = auth.uid() and s.category_id = r.category_id
    )
  order by distance_m
$$;
