-- AutoFix — close the holes the notification audit found in 0027.
--
-- Re-runnable: every function is replaced in place and every trigger is
-- dropped before it is created.

-- ---------------------------------------------------------------------------
-- A) The winning usta was never told they had won
--
-- accept_offer moves the request to 'accepted', and notify_request_status had
-- no branch for that status, so it fell through silently. The provider only
-- ever learned their bid was accepted by having the app open on the waiting
-- screen (which polls) or on the Panel (which has a Realtime subscription).
-- Bid, lock the phone, and the job was simply lost: the customer sits waiting
-- for an usta who does not know they have been chosen. This was the single
-- worst gap in the flow.
--
-- Also: a cancellation still goes to whoever did not cancel, and the customer
-- keeps getting the progress updates.
-- ---------------------------------------------------------------------------
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
    when 'accepted' then
      v_title := 'Təklifin qəbul edildi';
      v_body  := case
                   when new.address_text is not null
                     then 'Müştəri səni seçdi · ' || new.address_text
                   else 'Müştəri səni seçdi — yola çıxa bilərsən.'
                 end;
      v_to    := array[new.provider_id];
      v_role  := 'provider';

    when 'en_route' then
      v_title := 'Usta yola çıxdı';
      v_body  := 'Usta sənə doğru hərəkət edir.';
      v_to    := array[new.customer_id];

    when 'arrived' then
      v_title := 'Usta çatdı';
      v_body  := 'Usta göstərdiyin ünvandadır.';
      v_to    := array[new.customer_id];

    when 'in_progress' then
      v_title := 'Təmir başladı';
      v_body  := 'Usta işə başladı.';
      v_to    := array[new.customer_id];

    when 'completed' then
      v_title := 'İş tamamlandı';
      v_body  := 'Ustanı qiymətləndirməyi unutma.';
      v_to    := array[new.customer_id];

    when 'expired' then
      v_title := 'Təklif gəlmədi';
      v_body  := 'Yaxınlıqdakı ustalardan cavab olmadı. Yenidən cəhd edə bilərsən.';
      v_to    := array[new.customer_id];

    when 'cancelled' then
      v_title := 'Sifariş ləğv edildi';
      v_body  := 'Qarşı tərəf sifarişi ləğv etdi.';
      -- Tell whoever did not do the cancelling.
      if new.cancelled_by is not null and new.cancelled_by = new.customer_id then
        v_to   := array[new.provider_id];
        v_role := 'provider';
      elsif new.cancelled_by is not null and new.cancelled_by = new.provider_id then
        v_to := array[new.customer_id];
      else
        -- Unknown canceller (rows cancelled before 0027): tell both rather
        -- than nobody.
        v_to := array[new.customer_id, new.provider_id];
      end if;

    else
      return new;
  end case;

  v_to := array_remove(v_to, null);
  perform send_push(
    v_to,
    v_title,
    v_body,
    case when v_role = 'provider' then 'requests' else 'job' end,
    jsonb_build_object('type', 'job_status', 'role', v_role, 'requestId', new.id)
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- B) An edited or re-placed bid never reached the customer
--
-- submit_offer is an upsert, so only a provider's FIRST bid on a request is an
-- INSERT. Changing the price is an UPDATE, and so is coming back after a
-- withdrawal (withdraw sets 'withdrawn', re-bidding sets it to 'pending'
-- again) — in both cases the customer was never told, even though a returning
-- offer is new information to them.
--
-- Deliberately narrow, so a provider fiddling with their bid cannot buzz the
-- customer repeatedly: only a changed PRICE or a genuine return from
-- 'withdrawn' qualifies. Editing the note alone stays silent.
-- ---------------------------------------------------------------------------
create or replace function notify_offer_changed()
returns trigger language plpgsql security definer set search_path = public, net, extensions as $$
declare
  v_customer uuid;
  v_status   request_status;
  v_name     text;
  v_returned boolean;
  v_repriced boolean;
begin
  if new.status <> 'pending' then return new; end if;

  v_returned := old.status = 'withdrawn';
  v_repriced := old.price is distinct from new.price;
  if not (v_returned or v_repriced) then return new; end if;

  select r.customer_id, r.status into v_customer, v_status
  from requests r where r.id = new.request_id;
  if v_customer is null or v_status <> 'searching' then return new; end if;

  select p.full_name into v_name from profiles p where p.id = new.provider_id;

  perform send_push(
    array[v_customer],
    case when v_returned then 'Yeni təklif: ' else 'Təklif yeniləndi: ' end
      || rtrim(rtrim(new.price::text, '0'), '.') || ' AZN',
    coalesce(v_name, 'Bir usta') ||
      case when v_returned then ' sorğuna təklif göndərdi' else ' qiymətini dəyişdi' end,
    'offers',
    jsonb_build_object('type', 'new_offer', 'role', 'customer', 'requestId', new.request_id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_offer_changed on offers;
create trigger trg_notify_offer_changed
  after update on offers
  for each row execute function notify_offer_changed();

-- ---------------------------------------------------------------------------
-- C) Providers mid-repair were still being woken for new work
--    I) …and when more than 100 matched, which 100 was arbitrary
--
-- notify_new_request checked availability the way provider_feed does, but
-- provider_feed is only ever read by someone looking at the Panel — and the
-- Panel funnels a provider with an active job straight into it, so they never
-- see the list. A notification has no such gate, so an usta in the middle of a
-- repair kept getting "Yeni sorğu".
--
-- The recipient cap is also now meaningful: nearest first, rather than
-- whichever hundred rows the planner happened to return.
-- ---------------------------------------------------------------------------
create or replace function notify_new_request()
returns trigger language plpgsql security definer set search_path = public, net, extensions as $$
declare
  v_ids   uuid[];
  v_title text;
begin
  if new.status <> 'searching' then return new; end if;

  select array_agg(id) into v_ids
  from (
    select pp.id
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
      )
      -- Already working: the Panel would not show them this request either.
      and not exists (
        select 1 from requests r2
        where r2.provider_id = pp.id
          and r2.status in ('accepted', 'en_route', 'arrived', 'in_progress')
      )
    order by ST_Distance(pp.current_location, new.pickup_location)
    limit 100
  ) nearest;

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
