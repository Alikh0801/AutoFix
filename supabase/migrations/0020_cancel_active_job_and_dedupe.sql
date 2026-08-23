-- Jolt — close two related holes that let a job get permanently stuck in a
-- non-terminal state, invisible to the customer but still locking the
-- provider (or vice versa):
--
-- 1) Once a request moved past 'searching' there was NO way for either
--    party to cancel it — advance_job/complete_request only move forward.
--    If a customer went silent after accepting an offer (closed the app,
--    lost connection, changed their mind), the assigned provider was
--    permanently funnelled into ActiveJob with no way out, since Dashboard
--    always redirects there while my_active_job() returns a row.
-- 2) The customer side had no equivalent of the provider's "you have an
--    active job" lock/redirect at all — nothing re-surfaced an
--    accepted-but-abandoned request, and create_request() never checked
--    for one, so a customer could rack up multiple simultaneous requests.

-- Either participant can cancel a job that's been accepted but not yet
-- worked on. No commission/wallet side effects — those only ever happen
-- through complete_request, so an abandoned job is simply void.
create or replace function cancel_active_job(p_request_id uuid)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
begin
  select * into v_req from requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_uid <> v_req.customer_id and v_uid <> v_req.provider_id then
    raise exception 'Not a participant of this request';
  end if;
  if v_req.status not in ('accepted', 'en_route', 'arrived') then
    raise exception 'This job can no longer be cancelled';
  end if;

  update requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_request_id;
end;
$$;

-- Customer-side mirror of my_active_job(): whatever open/in-flight request
-- the caller currently has (if any), so Home can redirect back into it
-- instead of leaving it invisible and re-creatable.
create or replace function my_active_request()
returns table (
  id           uuid,
  status       request_status,
  category_id  text
)
language sql stable security definer set search_path = public as $$
  select id, status, category_id
  from requests
  where customer_id = auth.uid()
    and status in ('searching', 'accepted', 'en_route', 'arrived', 'in_progress')
  order by created_at desc
  limit 1;
$$;

-- Defense in depth: reject a new request server-side too, not just via the
-- Home-screen redirect, in case a client ever skips that check.
create or replace function create_request(
  p_category        text,
  p_lat             double precision,
  p_lng             double precision,
  p_address         text default null,
  p_note            text default null,
  p_payment_method  payment_method default 'cash',
  p_city            text default null
)
returns uuid language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  perform 1 from requests
   where customer_id = v_uid
     and status in ('searching', 'accepted', 'en_route', 'arrived', 'in_progress');
  if found then raise exception 'You already have an active request'; end if;

  perform 1 from service_categories where id = p_category and is_active;
  if not found then raise exception 'Invalid category'; end if;

  insert into requests (
    customer_id, category_id, status, payment_method,
    pickup_location, address_text, note, city
  ) values (
    v_uid, p_category, 'searching', p_payment_method,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, nullif(p_note, ''), p_city
  )
  returning id into v_id;

  return v_id;
end;
$$;
