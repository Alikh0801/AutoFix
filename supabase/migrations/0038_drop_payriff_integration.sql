-- AutoFix — remove the Payriff-shaped half of the commission system.
--
-- WHY
-- Payriff declined to enable Card Save for this account ("hal-hazırki
-- mərhələdə mümkün olmayacaq"), and card saving is what autoPay needs. With no
-- saved card there is no automatic collection, so everything built around one
-- is unusable. Another provider will be chosen, and it will not speak
-- Payriff's vocabulary: `reversed`, `reverse_failed` and a `card_save_id` are
-- that gateway's lifecycle, not a general one. Keeping them would mean the
-- next integration either bends to a shape that no longer fits or works
-- around it.
--
-- WHAT STAYS
-- The commission model itself, because it is a business rule and not a
-- gateway's: a ledger row per completed job, settlement every third job,
-- balance first, and no fourth job while the bill is outstanding. Also the
-- commission_settlements audit trail and begin/complete_settlement, which any
-- provider will need — only the card-shaped parts come out of them.
--
-- WHAT THIS DELETES
-- provider_cards and its rows. Safe: Card Save never completed once, so no
-- usta has a card saved. If Payriff is ever reinstated, 0031 recreates it.
--
-- THE TRAP THIS ALSO CLOSES
-- 0037 stops an usta bidding while the bill is due. That was right when a
-- card could pay it. Right now nothing can, so the rule would strand every
-- usta permanently on their fourth job. It is therefore put behind a switch,
-- off until a payment method exists. The debt still accrues and the books
-- stay correct — only the barrier waits for the remedy.

-- ---------------------------------------------------------------------------
-- The switch that keeps the three-job rule honest
-- ---------------------------------------------------------------------------
alter table platform_settings
  add column if not exists commission_collection_enabled boolean not null default false;

comment on column platform_settings.commission_collection_enabled is
  'Turn on only when an usta can actually pay the commission in the app. '
  'While false, the debt accrues but the three-job rule does not block '
  'bidding — blocking with no way to pay would strand every usta.';

-- ---------------------------------------------------------------------------
-- submit_offer — same rule, now conditional on there being a way to pay
-- ---------------------------------------------------------------------------
create or replace function submit_offer(p_request_id uuid, p_price numeric, p_note text default null)
returns offers language plpgsql security definer set search_path = public as $$
declare
  v_provider uuid := auth.uid();
  v_min      numeric;
  v_status   request_status;
  v_customer uuid;
  v_wallet   provider_wallets;
  v_every    int;
  v_collect  boolean;
  v_offer    offers;
begin
  select * into v_wallet from provider_wallets where id = v_provider;
  if v_wallet is null then raise exception 'Not a provider'; end if;

  -- Tried and failed. No collection path exists today, so nothing sets this
  -- any more; it is kept because rows set earlier still mean what they said.
  if v_wallet.is_blocked then raise exception 'Provider is blocked (unpaid commission)'; end if;

  select ps.settlement_every, ps.commission_collection_enabled
    into v_every, v_collect
    from platform_settings ps limit 1;

  -- The quota is spent and the bill is outstanding — but only hold them back
  -- if they have some way to settle it.
  if coalesce(v_collect, false)
     and v_wallet.jobs_since_settlement >= coalesce(v_every, 3)
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

-- ---------------------------------------------------------------------------
-- begin_settlement — the reservation stays, the card lookup goes.
--
-- `from_card` keeps its name: it still means "the part the balance did not
-- cover", whoever ends up charging it.
-- ---------------------------------------------------------------------------
drop function if exists begin_settlement();

create function begin_settlement()
returns table (
  settlement_id    uuid,
  amount           numeric,
  from_balance     numeric,
  from_card        numeric,
  pending_order_id text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_wallet   provider_wallets;
  v_every    int;
  v_balance  numeric;
  v_rest     numeric;
  v_id       uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_wallet from provider_wallets where id = v_uid for update;
  if v_wallet is null then raise exception 'Not a provider'; end if;

  select s.id into v_id from commission_settlements s
   where s.provider_id = v_uid and s.status = 'pending';
  if v_id is not null then
    return query
      select s.id, s.amount, s.from_balance, s.from_card, s.order_id
        from commission_settlements s where s.id = v_id;
    return;
  end if;

  if v_wallet.commission_balance <= 0 then
    raise exception 'Nothing to settle';
  end if;

  select ps.settlement_every into v_every from platform_settings ps limit 1;

  if v_wallet.jobs_since_settlement < coalesce(v_every, 3) and not v_wallet.is_blocked then
    raise exception 'Settlement is not due yet';
  end if;

  v_balance := least(v_wallet.wallet_balance, v_wallet.commission_balance);
  if v_balance < 0 then v_balance := 0; end if;
  v_rest := v_wallet.commission_balance - v_balance;

  insert into commission_settlements (
    provider_id, amount, from_balance, from_card, jobs_covered
  )
  values (v_uid, v_wallet.commission_balance, v_balance, v_rest, v_wallet.jobs_since_settlement)
  returning id into v_id;

  return query
    select v_id, v_wallet.commission_balance, v_balance, v_rest, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_settlement_state — has_card and awaiting_result had no meaning left.
-- ---------------------------------------------------------------------------
drop function if exists my_settlement_state();

create function my_settlement_state()
returns table (
  commission_owed numeric,
  wallet_balance  numeric,
  is_blocked      boolean,
  jobs_until_due  int,
  last_failure    text
)
language sql stable security definer set search_path = public as $$
  select
    w.commission_balance,
    w.wallet_balance,
    w.is_blocked,
    greatest(
      coalesce((select ps.settlement_every from platform_settings ps limit 1), 3)
        - w.jobs_since_settlement,
      0
    ),
    (select s.failure_reason from commission_settlements s
      where s.provider_id = w.id and s.status = 'failed'
      order by s.created_at desc limit 1)
  from provider_wallets w
  where w.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Everything that only existed to serve Payriff's card saving
-- ---------------------------------------------------------------------------
drop function if exists begin_forget_card(uuid);
drop function if exists reconcile_cards(uuid, text[]);
drop function if exists forget_card(uuid);
drop function if exists set_default_card(uuid);
drop function if exists record_card_save(text);
drop function if exists settle_card_save(text, text, text, text, text);
drop function if exists my_cards();
drop function if exists my_card_save_status(text);
drop function if exists has_usable_card();

-- card_id first: commission_settlements outlives the cards it pointed at.
alter table commission_settlements drop column if exists card_id;

drop table if exists provider_cards;
drop type if exists card_save_status;
