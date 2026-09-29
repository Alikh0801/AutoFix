-- AutoFix — stop accepting card requests until card payments actually exist.
--
-- THE HOLE
-- docs/PAYMENTS.md is explicit that Phase 1 builds only flow A, the provider's
-- commission. Flow B — the customer paying by card — was never built: nothing
-- in the codebase calls Create Order, so choosing "Kart" charges the customer
-- nothing at all.
--
-- complete_request, however, credits the provider's wallet the full agreed
-- price on a card job, because that is what a real card payment would have
-- meant. So today a customer can pick "Kart", receive the service, pay
-- nothing, and AutoFix ends up owing the provider money that never arrived —
-- money the provider can then settle commission from, and withdraw once
-- payouts open in Phase 2.
--
-- No exploit is needed for this; the option is right there in the app.
--
-- WHY A SETTING RATHER THAN A HARD BLOCK
-- Flow B is coming. Turning it on should be a settings change once Create
-- Order, refunds and payouts are in place — not another migration written
-- under time pressure on the day it is needed.

alter table platform_settings
  add column if not exists card_payments_enabled boolean not null default false;

comment on column platform_settings.card_payments_enabled is
  'Flow B (customer pays by card). Keep false until Create Order, refunds and '
  'payouts are implemented — complete_request credits the provider the full '
  'price for a card job, so enabling this early credits money nobody received.';

create or replace function create_request(
  p_category        text,
  p_lat             double precision,
  p_lng             double precision,
  p_address         text default null,
  p_note            text default null,
  p_payment_method  payment_method default 'cash',
  p_city            text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_cards boolean;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  perform 1 from requests
   where customer_id = v_uid
     and status in ('searching', 'accepted', 'en_route', 'arrived', 'in_progress');
  if found then raise exception 'You already have an active request'; end if;

  perform 1 from service_categories where id = p_category and is_active;
  if not found then raise exception 'Invalid category'; end if;

  -- Checked here rather than only in the UI, for the same reason every other
  -- money rule is: the screen can be skipped, the RPC cannot.
  if p_payment_method = 'card' then
    select ps.card_payments_enabled into v_cards from platform_settings ps limit 1;
    if not coalesce(v_cards, false) then
      raise exception 'Card payments are not available yet';
    end if;
  end if;

  insert into requests (
    customer_id, category_id, status, payment_method,
    pickup_location, address_text, note, city
  ) values (
    v_uid, p_category, 'searching', p_payment_method,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, nullif(p_note, ''), p_city
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- card_payments_enabled — so the app can grey the option out instead of
-- letting the customer pick it and meet an error.
-- ---------------------------------------------------------------------------
create or replace function card_payments_enabled()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ps.card_payments_enabled from platform_settings ps limit 1), false)
$$;
