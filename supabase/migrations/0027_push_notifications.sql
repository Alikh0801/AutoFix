-- AutoFix — push notifications, sent from the database.
--
-- The gap this closes: provider_feed only returns requests created in the last
-- 15 minutes, and a provider only ever saw that feed while the app was open on
-- the Panel tab. A stranded driver's request therefore reached whoever
-- happened to be looking at their phone, and nobody else. Same on the other
-- side — a customer who locked their phone never learned an offer had arrived.
--
-- Why the database and not an Edge Function: this project's migrations are
-- applied by hand in the SQL Editor and the Supabase CLI is not linked, so a
-- function that needs `supabase functions deploy` would be a second, unlinked
-- deployment path. pg_net posts to Expo straight from a trigger, after the
-- transaction commits, and ships in the same paste as everything else.
--
-- PREREQUISITE: pg_net must be enabled first — Dashboard → Database →
-- Extensions → search "pg_net" → enable. Doing it through the dashboard rather
-- than `create extension` here avoids guessing which schema this project's
-- Postgres puts it in.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception
      'pg_net is not enabled. Dashboard -> Database -> Extensions -> enable "pg_net", then run this migration again.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Device tokens
-- ---------------------------------------------------------------------------
create table if not exists push_tokens (
  token       text primary key,                 -- ExponentPushToken[...]
  user_id     uuid not null references profiles(id) on delete cascade,
  platform    text,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_push_tokens_user on push_tokens(user_id);

alter table push_tokens enable row level security;
drop policy if exists "user manages own push tokens" on push_tokens;
create policy "user manages own push tokens"
  on push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keying on the token (not the user) is what lets a handset move between
-- accounts: signing in as someone else rewrites user_id instead of leaving the
-- previous owner subscribed to this device.

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------

-- Post one message to Expo's push service for every device the given users
-- have registered.
--
-- Every caller is a trigger on a business table, so this must never be able to
-- fail the surrounding transaction: a notification that does not go out is an
-- annoyance, a request that cannot be created is an outage. Hence the blanket
-- exception handler — pg_net not installed, DNS down, malformed row, it all
-- ends the same way.
create or replace function send_push(
  p_user_ids  uuid[],
  p_title     text,
  p_body      text,
  p_channel   text,
  p_data      jsonb
)
returns void language plpgsql security definer set search_path = public, net, extensions as $$
declare
  v_tokens jsonb;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then return; end if;

  -- Expo accepts at most 100 recipients per request.
  select jsonb_agg(t.token) into v_tokens
  from (
    select distinct token
    from push_tokens
    where user_id = any(p_user_ids)
    limit 100
  ) t;

  if v_tokens is null then return; end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'to', v_tokens,
      'title', p_title,
      'body', p_body,
      'sound', 'default',
      'priority', 'high',
      'channelId', p_channel,
      'data', p_data
    )
  );
exception when others then
  -- Never propagated; see the note above. Raised as a warning rather than
  -- swallowed outright so a misconfiguration (pg_net missing, wrong schema)
  -- is visible in the Postgres logs instead of looking like "nobody nearby".
  raise warning 'send_push failed: % (%)', sqlerrm, sqlstate;
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) A new request reaches every eligible provider nearby
--
-- Same eligibility rules as provider_feed, so a provider is only ever woken
-- for a job they could actually have taken: online, not blocked, within 8 km,
-- skill matches (or the "Digər" catch-all), and never their own request.
-- ---------------------------------------------------------------------------
create or replace function notify_new_request()
returns trigger language plpgsql security definer set search_path = public, net, extensions as $$
declare
  v_ids   uuid[];
  v_title text;
begin
  if new.status <> 'searching' then return new; end if;

  select array_agg(pp.id) into v_ids
  from provider_profiles pp
  join provider_wallets w on w.id = pp.id
  where pp.is_online
    and not w.is_blocked
    and pp.id <> new.customer_id
    and pp.current_location is not null
    and ST_DWithin(pp.current_location, new.pickup_location, 8000)
    and (
      new.category_id = 'other'
      or exists (
        select 1 from provider_skills s
        where s.provider_id = pp.id and s.category_id = new.category_id
      )
    );

  select c.title into v_title from service_categories c where c.id = new.category_id;

  perform send_push(
    v_ids,
    'Yeni sorğu: ' || coalesce(v_title, 'Yol yardımı'),
    coalesce(new.address_text, 'Yaxınlığında sürücüyə kömək lazımdır'),
    'requests',
    jsonb_build_object('type', 'new_request', 'role', 'provider', 'requestId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_request on requests;
create trigger trg_notify_new_request
  after insert on requests
  for each row execute function notify_new_request();

-- ---------------------------------------------------------------------------
-- 2) An offer reaches the customer waiting on it
-- ---------------------------------------------------------------------------
create or replace function notify_new_offer()
returns trigger language plpgsql security definer set search_path = public, net, extensions as $$
declare
  v_customer uuid;
  v_status   request_status;
  v_name     text;
begin
  select r.customer_id, r.status into v_customer, v_status
  from requests r where r.id = new.request_id;

  if v_customer is null or v_status <> 'searching' then return new; end if;
  if new.status <> 'pending' then return new; end if;

  select p.full_name into v_name from profiles p where p.id = new.provider_id;

  perform send_push(
    array[v_customer],
    -- numeric(10,2) renders as "20.00"; the app shows "20 AZN" everywhere
    -- because JS drops the trailing zeros. Match it.
    'Yeni təklif: ' || rtrim(rtrim(new.price::text, '0'), '.') || ' AZN',
    coalesce(v_name, 'Bir usta') || ' sorğuna təklif göndərdi',
    'offers',
    jsonb_build_object('type', 'new_offer', 'role', 'customer', 'requestId', new.request_id)
  );
  return new;
end;
$$;

-- Only on insert: an edited bid re-notifying the customer every few seconds
-- would be worse than silence.
drop trigger if exists trg_notify_new_offer on offers;
create trigger trg_notify_new_offer
  after insert on offers
  for each row execute function notify_new_offer();

-- ---------------------------------------------------------------------------
-- 3) Job progress reaches the customer, and a cancellation reaches the other
--    party
--
-- cancelled_by records who walked away, so the person who tapped "Ləğv et" is
-- not notified about their own decision.
-- ---------------------------------------------------------------------------
alter table requests add column if not exists cancelled_by uuid references profiles(id) on delete set null;

create or replace function notify_request_status()
returns trigger language plpgsql security definer set search_path = public, net, extensions as $$
declare
  v_title text;
  v_body  text;
  v_to    uuid[];
  v_role  text := 'customer';
begin
  if new.status = old.status then return new; end if;

  case new.status
    when 'en_route' then
      v_title := 'Usta yola çıxdı';
      v_body  := 'Usta sənə doğru hərəkət edir.';
    when 'arrived' then
      v_title := 'Usta çatdı';
      v_body  := 'Usta göstərdiyin ünvandadır.';
    when 'in_progress' then
      v_title := 'Təmir başladı';
      v_body  := 'Usta işə başladı.';
    when 'completed' then
      v_title := 'İş tamamlandı';
      v_body  := 'Ustanı qiymətləndirməyi unutma.';
    when 'expired' then
      v_title := 'Təklif gəlmədi';
      v_body  := 'Yaxınlıqdakı ustalardan cavab olmadı. Yenidən cəhd edə bilərsən.';
    when 'cancelled' then
      v_title := 'Sifariş ləğv edildi';
      v_body  := 'Qarşı tərəf sifarişi ləğv etdi.';
    else
      return new;
  end case;

  if new.status = 'cancelled' then
    -- Tell whoever did not do the cancelling.
    if new.cancelled_by is not null and new.cancelled_by = new.customer_id then
      v_to := array[new.provider_id];
      v_role := 'provider';
    elsif new.cancelled_by is not null and new.cancelled_by = new.provider_id then
      v_to := array[new.customer_id];
    else
      -- Unknown canceller (older rows): tell both rather than nobody.
      v_to := array[new.customer_id, new.provider_id];
    end if;
  else
    v_to := array[new.customer_id];
  end if;

  v_to := array_remove(v_to, null);
  perform send_push(
    v_to,
    v_title,
    v_body,
    'job',
    jsonb_build_object('type', 'job_status', 'role', v_role, 'requestId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_request_status on requests;
create trigger trg_notify_request_status
  after update of status on requests
  for each row execute function notify_request_status();

-- ---------------------------------------------------------------------------
-- Record who cancelled, so the trigger above can leave them alone.
-- ---------------------------------------------------------------------------
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
  if v_req.status not in ('accepted', 'en_route', 'arrived', 'in_progress') then
    raise exception 'This job can no longer be cancelled';
  end if;

  update requests
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = p_request_id;
end;
$$;

create or replace function cancel_request(p_request_id uuid)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
begin
  select * into v_req from requests where id = p_request_id for update;
  if v_req is null then raise exception 'Request not found'; end if;
  if v_req.customer_id <> v_uid then raise exception 'Not your request'; end if;
  if v_req.status <> 'searching' then raise exception 'Request is no longer open'; end if;

  update requests
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = p_request_id;

  update offers set status = 'closed'
   where request_id = p_request_id and status = 'pending';
end;
$$;
