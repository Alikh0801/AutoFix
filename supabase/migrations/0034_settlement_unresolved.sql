-- AutoFix — a settlement that is neither paid nor refused.
--
-- The documented PaymentStatus enum contains values that mean "not finished":
-- PENDING, ACCEPTED, CREATED, and PREAUTH_APPROVED (funds held, not captured).
-- complete_settlement only knows charged / not charged, so until now any of
-- these would have been recorded as a failure — blocking a provider whose
-- money may still be taken, and leaving us claiming a debt that may already
-- have been paid.
--
-- Such an attempt now stays `pending` and keeps the order id, which is the
-- only handle we have for finding out later what actually happened.
--
-- THE POINT OF STORING THE ORDER ID
-- It is what stops the retry charging a second time. A pending settlement is
-- handed back unchanged by begin_settlement, so without this the next tap on
-- "try again" would call autoPay once more for a charge that may already have
-- gone through. With an order id on the row, the Edge Function refuses to
-- charge again and asks the provider to wait instead.

create or replace function mark_settlement_unresolved(
  p_settlement_id  uuid,
  p_order_id       text,
  p_gateway_status text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row commission_settlements;
begin
  select * into v_row from commission_settlements where id = p_settlement_id for update;
  if v_row is null then raise exception 'Unknown settlement %', p_settlement_id; end if;

  -- Never walk back a decision that was already made.
  if v_row.status <> 'pending' then return; end if;

  update commission_settlements
     set order_id = coalesce(p_order_id, order_id),
         gateway_status = p_gateway_status
   where id = v_row.id;
end;
$$;

revoke execute on function mark_settlement_unresolved(uuid, text, text)
  from public, anon, authenticated;
grant execute on function mark_settlement_unresolved(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- begin_settlement now also reports the order id of an attempt already in
-- flight, so the caller can tell "nothing was charged yet" from "something was
-- charged and we do not know the result".
-- ---------------------------------------------------------------------------
drop function if exists begin_settlement();

create function begin_settlement()
returns table (
  settlement_id    uuid,
  amount           numeric,
  from_balance     numeric,
  from_card        numeric,
  card_uuid        text,
  pending_order_id text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_wallet   provider_wallets;
  v_every    int;
  v_card     provider_cards;
  v_balance  numeric;
  v_card_amt numeric;
  v_id       uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_wallet from provider_wallets where id = v_uid for update;
  if v_wallet is null then raise exception 'Not a provider'; end if;

  -- An attempt already in flight: hand back the same one rather than making a
  -- second, so a double tap on "retry" cannot charge twice.
  select s.id into v_id from commission_settlements s
   where s.provider_id = v_uid and s.status = 'pending';
  if v_id is not null then
    return query
      select s.id, s.amount, s.from_balance, s.from_card, c.card_uuid, s.order_id
        from commission_settlements s
        left join provider_cards c on c.id = s.card_id
       where s.id = v_id;
    return;
  end if;

  if v_wallet.commission_balance <= 0 then
    raise exception 'Nothing to settle';
  end if;

  select ps.settlement_every into v_every from platform_settings ps limit 1;

  -- Due either on reaching the cadence, or whenever a previous attempt left
  -- the provider blocked and they are retrying.
  if v_wallet.jobs_since_settlement < coalesce(v_every, 3) and not v_wallet.is_blocked then
    raise exception 'Settlement is not due yet';
  end if;

  v_balance  := least(v_wallet.wallet_balance, v_wallet.commission_balance);
  if v_balance < 0 then v_balance := 0; end if;
  v_card_amt := v_wallet.commission_balance - v_balance;

  if v_card_amt > 0 then
    select * into v_card from provider_cards
     where provider_id = v_uid and is_default and status = 'reversed';
    if v_card is null then
      select * into v_card from provider_cards
       where provider_id = v_uid and status = 'reversed'
       order by created_at limit 1;
    end if;
    if v_card is null then raise exception 'No usable card'; end if;
  end if;

  insert into commission_settlements (
    provider_id, amount, from_balance, from_card, card_id, jobs_covered
  )
  values (
    v_uid, v_wallet.commission_balance, v_balance, v_card_amt,
    v_card.id, v_wallet.jobs_since_settlement
  )
  returning id into v_id;

  return query
    select v_id, v_wallet.commission_balance, v_balance, v_card_amt,
           v_card.card_uuid, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_settlement_state — an unresolved attempt is neither a debt the provider
-- can act on nor a failure, so the app needs to know one is outstanding.
-- ---------------------------------------------------------------------------
create or replace function my_settlement_state()
returns table (
  commission_owed   numeric,
  wallet_balance    numeric,
  is_blocked        boolean,
  jobs_until_due    int,
  has_card          boolean,
  last_failure      text,
  awaiting_result   boolean
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
    exists (
      select 1 from provider_cards c
      where c.provider_id = w.id and c.status = 'reversed'
    ),
    (select s.failure_reason from commission_settlements s
      where s.provider_id = w.id and s.status = 'failed'
      order by s.created_at desc limit 1),
    exists (
      select 1 from commission_settlements s
      where s.provider_id = w.id and s.status = 'pending' and s.order_id is not null
    )
  from provider_wallets w
  where w.id = auth.uid()
$$;
