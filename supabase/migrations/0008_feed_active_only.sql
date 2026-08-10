-- Jolt — provider feed shows only ACTIVE requests.
--
-- Bug: stale requests (e.g. 20 min old, never answered) and requests the
-- customer already cancelled kept showing in the feed. The status filter
-- already excludes cancelled/accepted ones; here we also drop requests older
-- than 15 minutes so only fresh, actionable requests appear.

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
    and r.created_at > now() - interval '15 minutes'
    and r.customer_id <> auth.uid()
    and ST_DWithin(r.pickup_location, ST_MakePoint(lng, lat)::geography, radius_m)
    and exists (
      select 1 from provider_skills s
      where s.provider_id = auth.uid() and s.category_id = r.category_id
    )
  order by distance_m
$$;
