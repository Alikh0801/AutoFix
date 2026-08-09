-- Jolt — phone number on sign-up + duplicate-phone guard.
--
-- 1) Extend the new-user trigger so the phone from sign-up metadata is written
--    to profiles.phone (which is UNIQUE, so duplicates are rejected at the DB).
-- 2) Expose an anon-callable check so the app can reject a duplicate phone
--    BEFORE calling signUp (nicer UX than hitting the unique constraint).

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Ensure the trigger exists (safe to run even if 0003 already created it).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Returns true if the phone is already registered. SECURITY DEFINER so it can
-- read profiles past RLS; only leaks a yes/no for an exact number.
create or replace function is_phone_taken(p_phone text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where phone = p_phone);
$$;

grant execute on function is_phone_taken(text) to anon, authenticated;
