-- Jolt — fix "column reference wallet_balance is ambiguous" in
-- pay_commission_from_wallet().
--
-- The function's RETURNS TABLE(commission_balance, wallet_balance) implicitly
-- declares PL/pgSQL variables with those same names, which collided with the
-- provider_wallets columns of the same name inside the UPDATE ... SET clause.
-- Qualifying the column with the table name resolves it in favour of the
-- column (the intended behaviour) without changing the RPC's output shape.

create or replace function pay_commission_from_wallet()
returns table (commission_balance numeric, wallet_balance numeric)
language plpgsql security definer as $$
declare
  v_uid  uuid := auth.uid();
  v_owed numeric;
begin
  select pw.commission_balance into v_owed from provider_wallets pw where pw.id = v_uid;
  if v_owed is null then raise exception 'Not a provider'; end if;

  if v_owed > 0 then
    insert into commission_ledger (provider_id, amount, type, note)
    values (v_uid, -v_owed, 'payment', 'Paid from wallet (test mode)');

    update provider_wallets
       set wallet_balance = provider_wallets.wallet_balance - v_owed,
           commission_balance = 0,
           is_blocked = false,
           updated_at = now()
     where id = v_uid;
  end if;

  return query
    select pw.commission_balance, pw.wallet_balance from provider_wallets pw where pw.id = v_uid;
end;
$$;
