-- AutoFix — ask for a card when there is something to pay, not before.
--
-- 0032 required a usable card before an usta could place a single bid. That
-- puts the hardest step first: a new usta has to hand over card details before
-- earning anything, to a platform they have not used yet. Plenty will simply
-- stop there.
--
-- The debt already has its own brake. Commission is settled every third
-- completed job, and an unsettled balance blocks new work — so an usta without
-- a card can take three cash jobs, and on the third the earnings screen sends
-- them to add one. The card is asked for at the moment it is needed and the
-- reason is obvious, which is the moment someone actually agrees to it.
--
-- The exposure this accepts is three jobs' commission per usta — a few manat —
-- if someone works and then walks away. That is the price of the friction it
-- removes. Nothing else changes: the block still holds, settlement still runs
-- balance-first then card, and the earnings screen already routes an usta with
-- no card to the card page instead of failing.
--
-- Re-runnable.

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
  -- Still the real gate: owe commission and you get no new work until it is
  -- settled, which is what makes the card unavoidable in the end.
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
  values (p_request_id, v_provider, p_price, p_note)
  on conflict (request_id, provider_id)
  do update set price = excluded.price, note = excluded.note,
                status = 'pending', updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;
