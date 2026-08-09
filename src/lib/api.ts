import { supabase } from './supabase';
import { ServiceCategory, ServiceCategoryId } from '../data/mock';

/**
 * Data-access layer over Supabase. Screens/contexts call these instead of
 * touching the client directly, so the mock-to-live switch stays contained.
 */

export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('id, title, subtitle, icon, min_price')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as ServiceCategoryId,
    title: row.title,
    subtitle: row.subtitle ?? '',
    icon: row.icon ?? 'tool',
    avgPrice: `${Number(row.min_price)} AZN-dən`,
    avgMinutes: 15,
  }));
}

export interface Profile {
  id: string;
  fullName: string | null;
  phone: string | null;
  homeCity: string | null;
}

// --- Vehicles ---------------------------------------------------------------

export interface Vehicle {
  id: string;
  make: string | null;
  model: string | null;
  color: string | null;
  plate: string | null;
  isDefault: boolean;
}

export interface VehicleInput {
  make: string;
  model: string;
  color: string;
  plate: string;
  isDefault: boolean;
}

/** Compact one-line label for a vehicle: "Toyota Corolla · 10-AB-777" (no colour). */
export function vehicleLine(v: Vehicle): string {
  return [[v.make, v.model].filter(Boolean).join(' '), v.plate].filter(Boolean).join(' · ');
}

function mapVehicle(row: any): Vehicle {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    color: row.color,
    plate: row.plate,
    isDefault: row.is_default,
  };
}

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

export async function fetchMyVehicles(): Promise<Vehicle[]> {
  // RLS already limits rows to the signed-in owner.
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, make, model, color, plate, is_default')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapVehicle);
}

/** Make one vehicle the default and clear the flag on the owner's others. */
export async function setDefaultVehicle(id: string): Promise<void> {
  const uid = await requireUid();
  const clear = await supabase.from('vehicles').update({ is_default: false }).eq('owner_id', uid);
  if (clear.error) throw clear.error;
  const set = await supabase.from('vehicles').update({ is_default: true }).eq('id', id);
  if (set.error) throw set.error;
}

export async function addVehicle(input: VehicleInput): Promise<void> {
  const uid = await requireUid();
  const existing = await supabase.from('vehicles').select('id').limit(1);
  if (existing.error) throw existing.error;
  const isFirst = (existing.data ?? []).length === 0;

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      owner_id: uid,
      make: input.make.trim(),
      model: input.model.trim(),
      color: input.color.trim(),
      plate: input.plate.trim().toUpperCase(),
      is_default: false,
    })
    .select('id')
    .single();
  if (error) throw error;

  // First car is default automatically; otherwise honour the toggle.
  if (input.isDefault || isFirst) await setDefaultVehicle(data.id);
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({
      make: input.make.trim(),
      model: input.model.trim(),
      color: input.color.trim(),
      plate: input.plate.trim().toUpperCase(),
    })
    .eq('id', id);
  if (error) throw error;
  if (input.isDefault) await setDefaultVehicle(id);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) throw error;
}

// --- Profile ----------------------------------------------------------------

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, home_city')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return { id: data.id, fullName: data.full_name, phone: data.phone, homeCity: data.home_city };
}
