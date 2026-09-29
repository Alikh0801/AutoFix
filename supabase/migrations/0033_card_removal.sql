-- AutoFix — removing a saved card, and keeping our list honest.
--
-- Deleting at Payriff is irreversible, so the rule that stops a provider
-- removing their only card has to be checked BEFORE the gateway call, not
-- after. begin_forget_card validates and hands back the token in one step;
-- forget_card (0031) commits once the gateway has confirmed.
--
-- Payriff's own listing only ever contains cards whose save completed, which
-- makes it a usable source of truth for reconciliation: anything we still
-- believe is usable but they no longer list has gone away on their side —
-- expired, or cancelled by the bank — and would fail at the worst moment,
-- mid-settlement.

-- ---------------------------------------------------------------------------
-- begin_forget_card — validates the removal and returns the gateway token.
-- ---------------------------------------------------------------------------
create or replace function begin_forget_card(p_card_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_row    provider_cards;
  v_usable int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_row from provider_cards
   where id = p_card_id and provider_id = v_uid;
  if v_row is null then raise exception 'Card not found'; end if;

  select count(*) into v_usable
    from provider_cards
   where provider_id = v_uid and status = 'reversed';

  if v_row.status = 'reversed' and v_usable <= 1 then
    raise exception 'Cannot remove the only card';
  end if;

  -- An unsettled debt still has to be collectable while the provider decides
  -- what to do next, so the card behind a failed settlement stays put.
  if v_row.status = 'reversed' and exists (
    select 1 from commission_settlements s
    where s.card_id = v_row.id and s.status = 'pending'
  ) then
    raise exception 'Card has a settlement in progress';
  end if;

  return v_row.card_uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- reconcile_cards — drops cards the gateway no longer knows about.
--
-- Called with the full set of uuids Payriff currently lists for this
-- provider. Rows we hold as usable but which are absent there are removed,
-- because charging them would fail. Service role only: it is driven by an
-- external answer, not by the user.
-- ---------------------------------------------------------------------------
create or replace function reconcile_cards(p_provider_id uuid, p_card_uuids text[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_removed int;
begin
  delete from provider_cards
   where provider_id = p_provider_id
     and status = 'reversed'
     and card_uuid is not null
     and not (card_uuid = any(coalesce(p_card_uuids, array[]::text[])));
  get diagnostics v_removed = row_count;

  -- Deleting the default leaves nobody holding the flag; promote the oldest
  -- survivor so settlement still knows which card to use.
  if v_removed > 0
     and not exists (
       select 1 from provider_cards
       where provider_id = p_provider_id and is_default and status = 'reversed'
     )
  then
    update provider_cards
       set is_default = true
     where id = (
       select id from provider_cards
       where provider_id = p_provider_id and status = 'reversed'
       order by created_at
       limit 1
     );
  end if;

  return v_removed;
end;
$$;

revoke execute on function reconcile_cards(uuid, text[]) from public, anon, authenticated;
grant execute on function reconcile_cards(uuid, text[]) to service_role;
