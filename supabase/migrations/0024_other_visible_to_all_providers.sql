-- Jolt — "Digər" requests go to every provider.
--
-- 0023 removed 'other' as a selectable provider skill (it describes the
-- customer's problem, not equipment a provider carries), but provider_feed
-- only surfaced a request whose category matched one of the caller's skills —
-- so those requests reached nobody. The customer still needs the catch-all, so
-- instead exempt it from skill matching: any provider can see and bid on it.
--
-- The blocked check also becomes a positive test for a provider_wallets row
-- (every provider gets one via the trg_provider_wallet trigger). Previously
-- "not blocked" was true for a plain customer with no wallet row at all, which
-- only stayed safe because the skills test filtered them out — an exemption
-- that bypasses that test would otherwise expose 'Digər' requests to
-- non-providers. This mirrors submit_offer's own "Not a provider" gate.

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
  left join lateral (
    select round(avg(rt.stars)::numeric, 1) as rating_avg, count(*)::int as rating_count
    from ratings rt
    where rt.ratee_id = r.customer_id
  ) cr on true
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
    and exists (
      select 1 from provider_wallets w where w.id = auth.uid() and not w.is_blocked
    )
    and (
      r.category_id = 'other'
      or exists (
        select 1 from provider_skills s
        where s.provider_id = auth.uid() and s.category_id = r.category_id
      )
    )
  order by distance_m
$$;
