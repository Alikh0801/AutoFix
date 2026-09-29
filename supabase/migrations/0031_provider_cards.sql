-- AutoFix — saved cards (Payriff Card Save).
--
-- A provider must have a card on file before they can work: commission is
-- collected from it every third job, and a provider with no card is a debt
-- the system can never collect.
--
-- SAVING A CARD costs the provider nothing. Payriff runs a 0.01 AZN
-- verification and reverses it automatically. The process has its own
-- lifecycle, and only ONE of its states means the card can actually be
-- charged:
--
--   CREATED         card details not entered yet
--   VERIFIED        verified, but the 0.01 refund has not completed
--   REVERSED        verified and refunded — the only usable state
--   REVERSE_FAILED  verified, but the refund failed (provider is out 0.01)
--   DECLINED        bank refused
--   EXPIRED         the customer never finished
--
-- The gateway's own names are kept rather than mapped to something of our
-- own, so a support question ("why is this card unusable?") is answered by
-- reading one column instead of reversing a translation.
--
-- customerRef sent to Payriff is the provider's profiles.id, which is also
-- the key their saved-card listing is grouped by — so their records and ours
-- line up without a lookup table.

do $$ begin
  create type card_save_status as enum (
    'created', 'verified', 'reversed', 'reverse_failed', 'declined', 'expired'
  );
exception when duplicate_object then null;
end $$;

create table if not exists provider_cards (
  id            uuid primary key default uuid_generate_v4(),
  provider_id   uuid not null references provider_profiles(id) on delete cascade,
  -- Payriff's handle for the save process; how a callback finds this row.
  card_save_id  text not null unique,
  -- The token AutoPay and Delete need. Only present once verification got far
  -- enough for Payriff to issue one.
  card_uuid     text unique,
  masked_pan    text,
  card_brand    text,
  status        card_save_status not null default 'created',
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  verified_at   timestamptz
);

create index if not exists idx_cards_provider on provider_cards(provider_id, created_at desc);
-- Only one default per provider, and only a usable card may hold the flag.
create unique index if not exists idx_cards_one_default
  on provider_cards(provider_id) where is_default;

alter table provider_cards enable row level security;

-- The provider sees their own cards. Every write goes through the SECURITY
-- DEFINER functions below, so there is no write policy.
drop policy if exists "provider reads own cards" on provider_cards;
create policy "provider reads own cards"
  on provider_cards for select to authenticated
  using (provider_id = auth.uid());

-- ---------------------------------------------------------------------------
-- record_card_save — called after Payriff hands back a cardSaveId, so a
-- callback has somewhere to land.
-- ---------------------------------------------------------------------------
create or replace function record_card_save(p_card_save_id text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from provider_wallets where id = v_uid) then
    raise exception 'Not a provider';
  end if;

  insert into provider_cards (provider_id, card_save_id)
  values (v_uid, p_card_save_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_card_save — the verified outcome, straight from Payriff's API.
--
-- Locked to service_role: a card this marks 'reversed' becomes chargeable,
-- so the app's own key must never be able to call it.
-- ---------------------------------------------------------------------------
create or replace function settle_card_save(
  p_card_save_id text,
  p_status       text,
  p_card_uuid    text default null,
  p_masked_pan   text default null,
  p_card_brand   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row    provider_cards;
  v_status card_save_status;
begin
  select * into v_row from provider_cards where card_save_id = p_card_save_id for update;
  if v_row is null then
    raise exception 'Unknown card save %', p_card_save_id;
  end if;

  v_status := lower(p_status)::card_save_status;

  -- Terminal states never move again, so a replayed callback is a no-op.
  if v_row.status in ('reversed', 'declined', 'expired') then
    return;
  end if;

  update provider_cards
     set status      = v_status,
         card_uuid   = coalesce(p_card_uuid, card_uuid),
         masked_pan  = coalesce(p_masked_pan, masked_pan),
         card_brand  = coalesce(p_card_brand, card_brand),
         verified_at = case when v_status = 'reversed' then now() else verified_at end
   where id = v_row.id;

  -- First usable card becomes the default, so a provider who adds exactly one
  -- card never has to choose.
  if v_status = 'reversed'
     and not exists (select 1 from provider_cards where provider_id = v_row.provider_id and is_default)
  then
    update provider_cards set is_default = true where id = v_row.id;
  end if;
end;
$$;

revoke execute on function settle_card_save(text, text, text, text, text) from public, anon, authenticated;
grant execute on function settle_card_save(text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- set_default_card
-- ---------------------------------------------------------------------------
create or replace function set_default_card(p_card_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  if not exists (
    select 1 from provider_cards
    where id = p_card_id and provider_id = v_uid and status = 'reversed'
  ) then
    raise exception 'Card is not usable';
  end if;

  update provider_cards set is_default = false where provider_id = v_uid and is_default;
  update provider_cards set is_default = true  where id = p_card_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- forget_card — removes our record once the token is gone from Payriff.
--
-- The last usable card cannot go: without one, commission can never be
-- collected and the provider would keep working up a debt nothing can settle.
-- Deleting the default promotes another card in the same statement.
-- ---------------------------------------------------------------------------
create or replace function forget_card(p_card_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_row       provider_cards;
  v_usable    int;
  v_successor uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_row from provider_cards
   where id = p_card_id and provider_id = v_uid for update;
  if v_row is null then raise exception 'Card not found'; end if;

  select count(*) into v_usable
    from provider_cards
   where provider_id = v_uid and status = 'reversed';

  if v_row.status = 'reversed' and v_usable <= 1 then
    raise exception 'Cannot remove the only card';
  end if;

  delete from provider_cards where id = v_row.id;

  if v_row.is_default then
    select id into v_successor
      from provider_cards
     where provider_id = v_uid and status = 'reversed'
     order by created_at
     limit 1;
    if v_successor is not null then
      update provider_cards set is_default = true where id = v_successor;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_cards / my_card_save_status — read helpers for the app.
-- card_uuid is deliberately NOT returned: the app never needs the token, and
-- anything it does not hold cannot leak from a device.
-- ---------------------------------------------------------------------------
create or replace function my_cards()
returns table (
  id          uuid,
  masked_pan  text,
  card_brand  text,
  status      card_save_status,
  is_default  boolean,
  created_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.masked_pan, c.card_brand, c.status, c.is_default, c.created_at
  from provider_cards c
  where c.provider_id = auth.uid()
  order by c.is_default desc, c.created_at desc
$$;

create or replace function my_card_save_status(p_card_save_id text)
returns table (status card_save_status, masked_pan text, card_brand text)
language sql stable security definer set search_path = public as $$
  select c.status, c.masked_pan, c.card_brand
  from provider_cards c
  where c.card_save_id = p_card_save_id and c.provider_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- has_usable_card — the gate the provider side checks before letting someone
-- go online or bid.
-- ---------------------------------------------------------------------------
create or replace function has_usable_card()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from provider_cards
    where provider_id = auth.uid() and status = 'reversed'
  )
$$;
