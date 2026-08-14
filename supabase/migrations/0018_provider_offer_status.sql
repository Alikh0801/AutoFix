-- Jolt — let a provider poll/subscribe to the fate of a single offer they
-- placed, so a dedicated "waiting for the customer" screen can detect
-- acceptance (-> jump into the active job), losing to another offer, or the
-- customer cancelling the request outright — all without needing the
-- provider to leave and re-enter the app tab for a stale focus-effect check
-- to notice.

create or replace function provider_offer_status(p_request_id uuid)
returns table (
  offer_status    offer_status,
  request_status  request_status
)
language sql stable security definer set search_path = public as $$
  select o.status, r.status
  from offers o
  join requests r on r.id = o.request_id
  where o.request_id = p_request_id and o.provider_id = auth.uid()
$$;
