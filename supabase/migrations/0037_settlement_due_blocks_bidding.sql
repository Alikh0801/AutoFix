-- AutoFix — once the third job is done, the commission has to be paid before
-- there is a fourth.
--
-- 0036 let an usta bid without a card, so the card is asked for when the
-- commission falls due rather than before any work exists. That removed the
-- only thing that had been forcing a card to exist — and 0032 blocks solely
-- when a card charge fails, on the reasoning that "owing money is normal
-- between settlements; being unable to pay is not". True when every usta had
-- a card. Without one, no settlement is ever attempted, so no charge ever
-- fails, so nobody is ever blocked: an usta could work indefinitely on a
-- growing debt nothing collected.
--
-- The rule that is actually wanted is the one the product states: three jobs
-- free of settlement, then pay before taking more.
--
-- is_blocked is deliberately left alone. It still means "we tried to take the
-- money and could not", which is a different situation needing different
-- words, and 0032 separated the two on purpose. This is a third condition,
-- not a reinterpretation of that flag.
--
-- Re-runnable.

create or replace function submit_offer(p_request_id uuid, p_price numeric, p_note text default null)
returns offers language plpgsql security definer set search_path = public as $$
declare
  v_provider uuid := auth.uid();
  v_min      numeric;
  v_status   request_status;
  v_customer uuid;
  v_wallet   provider_wallets;
  v_every    int;
  v_offer    offers;
begin
  select * into v_wallet from provider_wallets where id = v_provider;
  if v_wallet is null then raise exception 'Not a provider'; end if;

  -- Tried and failed: a card problem the usta has to resolve.
  if v_wallet.is_blocked then raise exception 'Provider is blocked (unpaid commission)'; end if;

  -- Not yet tried: the quota is used up and the bill is outstanding.
  select ps.settlement_every into v_every from platform_settings ps limit 1;
  if v_wallet.jobs_since_settlement >= coalesce(v_every, 3)
     and v_wallet.commission_balance > 0 then
    raise exception 'Commission settlement due';
  end if;

  select r.status, r.customer_id, c.min_price into v_status, v_customer, v_min
  from requests r
  join service_categories c on c.id = r.category_id
  where r.id = p_request_id;

  if v_status is null then raise exception 'Request not found'; end if;
  if v_customer = v_provider then raise exception 'Cannot bid on your own request'; end if;
  if v_status <> 'searching' then raise exception 'Request is not open'; end if;
  if p_price < v_min then raise exception 'Price below minimum of % AZN', v_min; end if;

  insert into offers (request_id, provider_id, price, note)
  values (p_request_id, v_provider, p_price, p_note)
  on conflict (request_id, provider_id)
  do update set price = excluded.price, note = excluded.note,
                status = 'pending', updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;
