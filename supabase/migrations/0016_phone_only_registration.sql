-- Jolt — switch to phone-only registration.
--
-- Accounts are now created with Supabase's native phone+password auth
-- (auth.users.phone) instead of email. TEST MODE: the app derives a fixed,
-- invisible password from the phone number itself (see AuthContext), so no
-- SMS is ever sent and there is no real verification yet — replace with
-- signInWithOtp/verifyOtp once an SMS provider is wired up.
--
-- Registration also now collects date of birth and a first vehicle, both
-- passed through signUp's metadata and picked up here.

alter table profiles add column if not exists date_of_birth date;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dob date;
begin
  begin
    v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;
  exception when others then
    v_dob := null;
  end;

  insert into public.profiles (id, full_name, phone, date_of_birth)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    -- Prefer the native auth phone; fall back to metadata for any old
    -- email-based test accounts that still pass it that way.
    coalesce(new.phone, nullif(new.raw_user_meta_data->>'phone', '')),
    v_dob
  )
  on conflict (id) do nothing;

  if nullif(new.raw_user_meta_data->>'vehicle_make', '') is not null then
    insert into public.vehicles (owner_id, make, model, color, plate, is_default)
    values (
      new.id,
      new.raw_user_meta_data->>'vehicle_make',
      new.raw_user_meta_data->>'vehicle_model',
      nullif(new.raw_user_meta_data->>'vehicle_color', ''),
      nullif(new.raw_user_meta_data->>'vehicle_plate', ''),
      true
    );
  end if;

  return new;
end;
$$;
