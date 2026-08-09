-- Jolt — auto-create a profile row for every new auth user.
-- When someone signs up (email + password), Supabase inserts a row into
-- auth.users. This trigger mirrors it into public.profiles so the rest of the
-- app always has a profile to work with. full_name comes from the signUp
-- metadata the client sends.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
