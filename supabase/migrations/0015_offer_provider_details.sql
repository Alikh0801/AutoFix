-- Jolt — show the bidding provider's identity to the customer.
--
-- Offers only exposed price/note; the customer had no way to see WHO is
-- bidding. This RPC joins each offer on a request to the provider's name,
-- phone, rating, and default vehicle — scoped to the request's own customer
-- (same access rule as the existing offers RLS), via a lateral join so a
-- provider without a vehicle or rating yet still shows up cleanly.

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
         pp.rating_avg, pp.rating_count,
         v.make, v.model, v.plate
  from offers o
  join profiles p on p.id = o.provider_id
  left join provider_profiles pp on pp.id = o.provider_id
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
