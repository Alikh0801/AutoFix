-- Jolt — show the assigned provider the customer's phone, rating, and
-- vehicle on the active-job screen, not just their name. my_active_job is
-- already SECURITY DEFINER and scoped to `r.provider_id = auth.uid()`, so
-- no extra RLS-bypass guard is needed here (unlike provider_feed) — only
-- the provider actually assigned to this specific job sees it.

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
  where r.provider_id = auth.uid()
    and r.status in ('accepted', 'en_route', 'arrived', 'in_progress')
  order by r.accepted_at desc nulls last
  limit 1;
$$;
