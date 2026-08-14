-- Jolt — credit the full price to the wallet on CASH jobs too (TEST MODE).
--
-- Bug: completing a cash job only added the commission to commission_balance
-- (a debt) but never credited wallet_balance with the job's price. Paying the
-- commission then debited an empty wallet, going negative (e.g. two 10 AZN
-- cash jobs at 1.5 AZN commission each should leave 20 - 3 = 17 AZN, but paid
-- showed -3).
--
-- Fix: on a completed cash job, add the full agreed_price to wallet_balance
-- (as if it were "deposited" for tracking), same as card jobs already do with
-- their net amount. The commission debt still accrues and still blocks the
-- provider until pay_commission_from_wallet settles it out of that balance.
-- Production will replace this with real payout/payment rails.

create or replace function complete_request(p_request_id uuid)
returns requests language plpgsql security definer as $$
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

  if v_req.payment_method = 'cash' then
    insert into commission_ledger (provider_id, request_id, amount, type, note)
    values (v_req.provider_id, v_req.id, v_commission, 'charge', 'Cash job commission (owed)');

    update provider_wallets
       set wallet_balance = wallet_balance + coalesce(v_req.agreed_price, 0),
           commission_balance = commission_balance + v_commission,
           is_blocked = (commission_balance + v_commission) > 0,
           updated_at = now()
     where id = v_req.provider_id;
  else  -- card: gateway captured payment; platform keeps commission
    insert into commission_ledger (provider_id, request_id, amount, type, note)
    values (v_req.provider_id, v_req.id, v_commission, 'charge', 'Card job commission (auto-collected)');

    update provider_wallets
       set wallet_balance = wallet_balance + (coalesce(v_req.agreed_price, 0) - v_commission),
           updated_at = now()
     where id = v_req.provider_id;
  end if;

  update provider_profiles set jobs_done = jobs_done + 1 where id = v_req.provider_id;

  return v_req;
end;
$$;
