import { supabase } from './supabase';
import { ServiceCategory, ServiceCategoryId } from '../data/mock';

export type RequestStatus =
  | 'searching'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

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

// --- Orders -----------------------------------------------------------------

export interface OrderHistoryItem {
  id: string;
  categoryId: ServiceCategoryId;
  status: RequestStatus;
  price: number | null;
  paymentMethod: 'cash' | 'card';
  createdAt: string;
}

/** The signed-in customer's own requests, newest first. */
export async function fetchMyOrders(): Promise<OrderHistoryItem[]> {
  const uid = await requireUid();
  // Filter by customer_id explicitly: a user who is also a provider would
  // otherwise see open requests too (RLS policies are OR-ed).
  const { data, error } = await supabase
    .from('requests')
    .select('id, category_id, status, agreed_price, payment_method, created_at')
    .eq('customer_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    categoryId: r.category_id as ServiceCategoryId,
    status: r.status as RequestStatus,
    price: r.agreed_price != null ? Number(r.agreed_price) : null,
    paymentMethod: r.payment_method as 'cash' | 'card',
    createdAt: r.created_at,
  }));
}

// --- Provider earnings ------------------------------------------------------

export interface EarningsDay {
  label: string;
  amount: number;
}

export interface ProviderJob {
  id: string;
  categoryId: ServiceCategoryId;
  price: number | null;
  completedAt: string | null;
}

export interface ProviderEarnings {
  weekTotal: number;
  weekByDay: EarningsDay[];
  jobsDone: number;
  ratingAvg: number;
  ratingCount: number;
  walletBalance: number;
  commissionOwed: number;
  recentJobs: ProviderJob[];
}

const AZ_WEEKDAYS = ['B', 'B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş']; // indexed by Date.getDay()

/** Everything the provider earnings screen shows, assembled for the signed-in
 *  provider. A user with no provider record / no completed jobs gets zeros. */
export async function fetchProviderEarnings(): Promise<ProviderEarnings> {
  const uid = await requireUid();

  const [{ data: jobs, error: jobsErr }, { data: pp }, { data: wallet }] = await Promise.all([
    supabase
      .from('requests')
      .select('id, category_id, agreed_price, completed_at')
      .eq('provider_id', uid)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false }),
    supabase.from('provider_profiles').select('jobs_done, rating_avg, rating_count').eq('id', uid).maybeSingle(),
    supabase.from('provider_wallets').select('wallet_balance, commission_balance').eq('id', uid).maybeSingle(),
  ]);
  if (jobsErr) throw jobsErr;

  const recentJobs: ProviderJob[] = (jobs ?? []).map((j) => ({
    id: j.id,
    categoryId: j.category_id as ServiceCategoryId,
    price: j.agreed_price != null ? Number(j.agreed_price) : null,
    completedAt: j.completed_at,
  }));

  // Build the last 7 days (oldest → newest) and total each day's completed jobs.
  const week: { start: number; end: number; day: EarningsDay }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    week.push({ start, end: start + 86400000, day: { label: AZ_WEEKDAYS[d.getDay()], amount: 0 } });
  }
  for (const j of recentJobs) {
    if (!j.completedAt || j.price == null) continue;
    const t = new Date(j.completedAt).getTime();
    const slot = week.find((w) => t >= w.start && t < w.end);
    if (slot) slot.day.amount += j.price;
  }
  const weekByDay = week.map((w) => w.day);
  const weekTotal = weekByDay.reduce((sum, d) => sum + d.amount, 0);

  return {
    weekTotal,
    weekByDay,
    jobsDone: pp?.jobs_done ?? recentJobs.length,
    ratingAvg: pp?.rating_avg != null ? Number(pp.rating_avg) : 0,
    ratingCount: pp?.rating_count ?? 0,
    walletBalance: wallet?.wallet_balance != null ? Number(wallet.wallet_balance) : 0,
    commissionOwed: wallet?.commission_balance != null ? Number(wallet.commission_balance) : 0,
    recentJobs,
  };
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
