-- Jolt — create a help request from GPS coordinates.
--
-- The client sends lat/lng; this builds the PostGIS point server-side and
-- inserts the request as the signed-in customer. Returns the new request id.

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

-- Let clients subscribe to live changes on requests and offers (Realtime),
-- still filtered by the RLS policies already in place. Wrapped so re-running
-- the migration doesn't error if the tables are already published.
do $$
begin
  begin
    alter publication supabase_realtime add table requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table offers;
  exception when duplicate_object then null;
  end;
end $$;
