-- Jolt — a provider withdrawing their offer (a DELETE on offers) never
-- reached the customer's live SearchingScreen subscription. Under Postgres'
-- default REPLICA IDENTITY, a DELETE's WAL record only carries the primary
-- key (id) — not request_id — so a Realtime filter on request_id can never
-- match it and the event is silently dropped. FULL replica identity puts
-- every column on the deleted row so the filter can match.

alter table offers replica identity full;
alter table requests replica identity full;
