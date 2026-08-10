-- Jolt — offer notes, editing, withdrawing, and marking already-made offers.
--
-- Adds a free-text note to an offer (e.g. "yalnız 95 premium benzin var") that
-- the customer can see. Providers can edit their offer (re-submit) or withdraw
-- it, and the feed reports whether they've already bid on each request.

alter table offers add column if not exists note text;

-- submit_offer now also stores a note. Re-calling it edits the existing offer
-- (unique per request+provider), so a provider can't create a duplicate.
drop function if exists submit_offer(uuid, numeric);
create or replace function submit_offer(p_request_id uuid, p_price numeric, p_note text default null)
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

  insert into offers (request_id, provider_id, price, note)
  values (p_request_id, v_provider, p_price, nullif(p_note, ''))
  on conflict (request_id, provider_id)
  do update set price = excluded.price, note = excluded.note, status = 'pending', updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;

-- Withdraw (remove) the provider's own offer on a request.
create or replace function withdraw_offer(p_request_id uuid)
returns void language plpgsql security definer as $$
begin
  delete from offers where request_id = p_request_id and provider_id = auth.uid();
end;
$$;

-- provider_feed now also returns the provider's own offer (price + note) on each
-- request, so the app can mark "already offered" and open it for editing.
drop function if exists provider_feed(double precision, double precision, integer);
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
  created_at      timestamptz,
  my_offer_price  numeric,
  my_offer_note   text
)
language sql stable as $$
  select r.id, r.category_id, r.address_text, r.note, r.payment_method,
         ST_Distance(r.pickup_location, ST_MakePoint(lng, lat)::geography) as distance_m,
         r.created_at,
         mo.price as my_offer_price, mo.note as my_offer_note
  from requests r
  left join offers mo on mo.request_id = r.id and mo.provider_id = auth.uid()
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
