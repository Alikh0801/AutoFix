-- AutoFix — commission settles every third job, from balance then card.
--
-- WHAT CHANGES
-- Commission used to be charged and enforced the instant a job finished:
-- complete_request added the fee to the debt and set is_blocked in the same
-- statement, so a provider working cash was blocked after their very first
-- job. Now accrual and collection are separate concerns.
--
--   Accrual    every completed job writes its own commission_ledger row, so
--              the books stay per-job accurate.
--   Collection once three completed jobs have piled up, the total is taken —
--              from the in-app balance first, the saved card for the rest.
--   Blocking   only when that card charge fails. Owing money is normal
--              between settlements; being unable to pay is not.
--
-- The cash-job wallet credit from 0013 is also removed. It existed so the
-- test-mode pay_commission_from_wallet had something to draw on, but on a
-- cash job the provider is handed the money directly — crediting their in-app
-- balance as well counted it twice. Balance now only grows from card jobs,
-- where the money genuinely passes through us.
--
-- ORDERING
-- The card is charged before the database is touched. A card charge cannot be
-- rolled back and a transaction can, so doing it the other way round leaves
-- "balance debited, card declined" states that nothing can repair. That is why
-- settlement is split in two: begin_settlement works out and reserves the
-- amount, the Edge Function charges, complete_settlement commits or fails the
-- whole thing.

alter table provider_wallets
  add column if not exists jobs_since_settlement int not null default 0;

do $$ begin
  create type settlement_status as enum ('pending', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

-- One row per settlement attempt: the audit trail, and the record that lets a
-- charge which succeeded at Payriff but failed to land here be found again.
create table if not exists commission_settlements (
  id             uuid primary key default uuid_generate_v4(),
  provider_id    uuid not null references provider_profiles(id) on delete cascade,
  amount         numeric(10,2) not null check (amount > 0),
  from_balance   numeric(10,2) not null default 0,
  from_card      numeric(10,2) not null default 0,
  card_id        uuid references provider_cards(id) on delete set null,
  jobs_covered   int not null,
  status         settlement_status not null default 'pending',
  order_id       text,            -- Payriff's order id for the card charge
  gateway_status text,            -- payload.paymentStatus, verbatim
  failure_reason text,
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);

create index if not exists idx_settlements_provider
  on commission_settlements(provider_id, created_at desc);
-- A provider may only have one settlement in flight at a time.
create unique index if not exists idx_settlements_one_pending
  on commission_settlements(provider_id) where status = 'pending';

alter table commission_settlements enable row level security;

drop policy if exists "provider reads own settlements" on commission_settlements;
create policy "provider reads own settlements"
  on commission_settlements for select to authenticated
  using (provider_id = auth.uid());

-- ---------------------------------------------------------------------------
-- complete_request — accrue, count, but do not collect or block
-- ---------------------------------------------------------------------------
create or replace function complete_request(p_request_id uuid)
returns requests language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_req        requests;
  v_commission numeric;
begin
  select * into v_req from requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_uid <> v_req.customer_id and v_uid <> v_req.provider_id then
    raise exception 'Not a participant';
  end if;
  if v_req.status not in ('accepted','en_route','arrived','in_progress') then
    raise exception 'Cannot complete from status %', v_req.status;
  end if;

  v_commission := commission_for(coalesce(v_req.agreed_price, 0));

  update requests set status = 'completed', completed_at = now()
   where id = v_req.id returning * into v_req;

  insert into commission_ledger (provider_id, request_id, amount, type, note)
  values (
    v_req.provider_id,
    v_req.id,
    v_commission,
    'charge',
    case when v_req.payment_method = 'cash'
         then 'Cash job commission' else 'Card job commission' end
  );

  update provider_wallets
     set commission_balance = commission_balance + v_commission,
         -- Only a card job actually routes money through us; on a cash job the
         -- provider was paid directly and nothing is held on their behalf.
         wallet_balance = wallet_balance
           + case when v_req.payment_method = 'card'
                  then coalesce(v_req.agreed_price, 0) else 0 end,
         jobs_since_settlement = jobs_since_settlement + 1,
         updated_at = now()
   where id = v_req.provider_id;

  update provider_profiles set jobs_done = jobs_done + 1 where id = v_req.provider_id;

  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- settlement_threshold — kept in platform_settings so the cadence can be
-- tuned without a deploy. Payriff's per-transaction fee is still unknown; if
-- it turns out to be flat, collecting every third job may be too often.
-- ---------------------------------------------------------------------------
alter table platform_settings
  add column if not exists settlement_every int not null default 3;

-- ---------------------------------------------------------------------------
-- begin_settlement — works out what is owed and reserves it.
--
-- Nothing moves here. The split is recorded as a pending row so that a card
-- charge which succeeds but never reports back can still be reconciled.
-- ---------------------------------------------------------------------------
create or replace function begin_settlement()
returns table (
  settlement_id uuid,
  amount        numeric,
  from_balance  numeric,
  from_card     numeric,
  card_uuid     text
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
      select s.id, s.amount, s.from_balance, s.from_card, c.card_uuid
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
    select v_id, v_wallet.commission_balance, v_balance, v_card_amt, v_card.card_uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_settlement — the only place commission actually clears.
--
-- All or nothing: if the card was declined, the balance is left untouched too,
-- and the provider is blocked. Locked to service_role because a call to this
-- with p_charged = true forgives real debt.
-- ---------------------------------------------------------------------------
create or replace function complete_settlement(
  p_settlement_id  uuid,
  p_charged        boolean,
  p_order_id       text default null,
  p_gateway_status text default null,
  p_failure_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row commission_settlements;
begin
  select * into v_row from commission_settlements where id = p_settlement_id for update;
  if v_row is null then raise exception 'Unknown settlement %', p_settlement_id; end if;

  -- Already resolved — a replayed callback or a duplicated request.
  if v_row.status <> 'pending' then return; end if;

  if not p_charged then
    update commission_settlements
       set status = 'failed',
           order_id = coalesce(p_order_id, order_id),
           gateway_status = p_gateway_status,
           failure_reason = p_failure_reason,
           settled_at = now()
     where id = v_row.id;

    -- Blocking happens here and nowhere else: the provider owes money the
    -- system could not take.
    update provider_wallets
       set is_blocked = true, updated_at = now()
     where id = v_row.provider_id;
    return;
  end if;

  update commission_settlements
     set status = 'completed',
         order_id = coalesce(p_order_id, order_id),
         gateway_status = p_gateway_status,
         settled_at = now()
   where id = v_row.id;

  insert into commission_ledger (provider_id, amount, type, note)
  values (v_row.provider_id, -v_row.amount, 'payment',
          format('Settled %s jobs (%s from balance, %s from card)',
                 v_row.jobs_covered, v_row.from_balance, v_row.from_card));

  update provider_wallets
     set commission_balance = commission_balance - v_row.amount,
         wallet_balance = wallet_balance - v_row.from_balance,
         jobs_since_settlement = greatest(jobs_since_settlement - v_row.jobs_covered, 0),
         is_blocked = false,
         updated_at = now()
   where id = v_row.provider_id;
end;
$$;

revoke execute on function complete_settlement(uuid, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function complete_settlement(uuid, boolean, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- my_settlement_state — everything the earnings and block screens need.
-- ---------------------------------------------------------------------------
create or replace function my_settlement_state()
returns table (
  commission_owed   numeric,
  wallet_balance    numeric,
  is_blocked        boolean,
  jobs_until_due    int,
  has_card          boolean,
  last_failure      text
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
      order by s.created_at desc limit 1)
  from provider_wallets w
  where w.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- A provider with no card is a debt nothing can collect, so bidding requires
-- one. Checked here rather than only in the UI, where it could be skipped.
-- ---------------------------------------------------------------------------
create or replace function submit_offer(p_request_id uuid, p_price numeric, p_note text default null)
returns offers language plpgsql security definer set search_path = public as $$
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

  if not exists (
    select 1 from provider_cards
    where provider_id = v_provider and status = 'reversed'
  ) then
    raise exception 'No usable card on file';
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

-- The test-mode settlement is gone: it drew on a balance the provider never
-- funded, and there are now two ways to clear a debt where there should be one.
drop function if exists pay_commission_from_wallet();
