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
    minPrice: Number(row.min_price),
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

// --- Creating / tracking a request ------------------------------------------

export interface CreateRequestInput {
  category: ServiceCategoryId;
  lat: number;
  lng: number;
  address?: string | null;
  note?: string;
  paymentMethod: 'cash' | 'card';
  city?: string | null;
}

/** Create a help request from GPS coordinates. Returns the new request id. */
export async function createRequest(input: CreateRequestInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_request', {
    p_category: input.category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_address: input.address ?? null,
    p_note: input.note ?? null,
    p_payment_method: input.paymentMethod,
    p_city: input.city ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export interface RequestOffer {
  id: string;
  providerId: string;
  price: number;
  note: string | null;
  status: 'pending' | 'accepted' | 'closed' | 'withdrawn';
}

/** Offers placed on one of the customer's requests. */
export async function fetchRequestOffers(requestId: string): Promise<RequestOffer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, provider_id, price, note, status')
    .eq('request_id', requestId)
    .order('price', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((o) => ({
    id: o.id,
    providerId: o.provider_id,
    price: Number(o.price),
    note: o.note ?? null,
    status: o.status,
  }));
}

// --- Accepted-job lifecycle -------------------------------------------------

/** Customer accepts one offer; that provider is assigned, others closed. */
export async function acceptOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
  if (error) throw error;
}

export interface RequestDetail {
  id: string;
  status: RequestStatus;
  categoryId: ServiceCategoryId;
  agreedPrice: number | null;
  paymentMethod: 'cash' | 'card';
  pickupLat: number | null;
  pickupLng: number | null;
  providerId: string | null;
  providerName: string | null;
  providerRating: number;
  providerRatingCount: number;
  providerLat: number | null;
  providerLng: number | null;
}

export async function fetchRequestDetail(requestId: string): Promise<RequestDetail | null> {
  const { data, error } = await supabase.rpc('request_detail', { p_request_id: requestId });
  if (error) throw error;
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status as RequestStatus,
    categoryId: r.category_id as ServiceCategoryId,
    agreedPrice: r.agreed_price != null ? Number(r.agreed_price) : null,
    paymentMethod: r.payment_method as 'cash' | 'card',
    pickupLat: r.pickup_lat != null ? Number(r.pickup_lat) : null,
    pickupLng: r.pickup_lng != null ? Number(r.pickup_lng) : null,
    providerId: r.provider_id,
    providerName: r.provider_name,
    providerRating: r.provider_rating != null ? Number(r.provider_rating) : 0,
    providerRatingCount: r.provider_rating_cnt ?? 0,
    providerLat: r.provider_lat != null ? Number(r.provider_lat) : null,
    providerLng: r.provider_lng != null ? Number(r.provider_lng) : null,
  };
}

export interface ActiveJob {
  id: string;
  status: RequestStatus;
  categoryId: ServiceCategoryId;
  agreedPrice: number | null;
  paymentMethod: 'cash' | 'card';
  address: string | null;
  note: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  customerName: string | null;
}

export async function fetchMyActiveJob(): Promise<ActiveJob | null> {
  const { data, error } = await supabase.rpc('my_active_job');
  if (error) throw error;
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status as RequestStatus,
    categoryId: r.category_id as ServiceCategoryId,
    agreedPrice: r.agreed_price != null ? Number(r.agreed_price) : null,
    paymentMethod: r.payment_method as 'cash' | 'card',
    address: r.address_text,
    note: r.note,
    pickupLat: r.pickup_lat != null ? Number(r.pickup_lat) : null,
    pickupLng: r.pickup_lng != null ? Number(r.pickup_lng) : null,
    customerName: r.customer_name,
  };
}

export async function advanceJob(requestId: string, status: 'en_route' | 'arrived' | 'in_progress'): Promise<void> {
  const { error } = await supabase.rpc('advance_job', { p_request_id: requestId, p_status: status });
  if (error) throw error;
}

export async function completeJob(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_request', { p_request_id: requestId });
  if (error) throw error;
}

export async function submitRating(requestId: string, stars: number, comment?: string): Promise<void> {
  const { error } = await supabase.rpc('submit_rating', {
    p_request_id: requestId,
    p_stars: stars,
    p_comment: comment ?? null,
  });
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

/** TEST MODE: clear the provider's commission debt from their wallet balance. */
export async function payCommissionFromWallet(): Promise<{ commissionBalance: number; walletBalance: number }> {
  const { data, error } = await supabase.rpc('pay_commission_from_wallet');
  if (error) throw error;
  const r = (data ?? [])[0] ?? {};
  return {
    commissionBalance: Number(r.commission_balance ?? 0),
    walletBalance: Number(r.wallet_balance ?? 0),
  };
}

// --- Provider profile & skills ----------------------------------------------

/** Make the current user a provider (idempotent). The DB trigger also creates
 *  their wallet row. Call before they manage skills / go online. */
export async function ensureProviderProfile(): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase
    .from('provider_profiles')
    .upsert({ id: uid }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Category ids the current provider has marked as their skills. */
export async function fetchMyProviderSkills(): Promise<ServiceCategoryId[]> {
  const uid = await requireUid();
  // Skills are publicly readable, so scope to the current provider explicitly.
  const { data, error } = await supabase
    .from('provider_skills')
    .select('category_id')
    .eq('provider_id', uid);
  if (error) throw error;
  return (data ?? []).map((r) => r.category_id as ServiceCategoryId);
}

export async function addProviderSkill(categoryId: ServiceCategoryId): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase
    .from('provider_skills')
    .upsert({ provider_id: uid, category_id: categoryId }, { onConflict: 'provider_id,category_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeProviderSkill(categoryId: ServiceCategoryId): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase
    .from('provider_skills')
    .delete()
    .eq('provider_id', uid)
    .eq('category_id', categoryId);
  if (error) throw error;
}

// --- Provider feed & offers -------------------------------------------------

export async function setProviderStatus(online: boolean, lat?: number, lng?: number): Promise<void> {
  const { error } = await supabase.rpc('set_provider_status', {
    p_online: online,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });
  if (error) throw error;
}

export interface ProviderFeedItem {
  id: string;
  categoryId: ServiceCategoryId;
  address: string | null;
  note: string | null;
  paymentMethod: 'cash' | 'card';
  distanceKm: number;
  createdAt: string;
  myOfferPrice: number | null;
  myOfferNote: string | null;
}

/** Nearby open requests matching the provider's skills, nearest first. */
export async function fetchProviderFeed(lat: number, lng: number, radiusM = 8000): Promise<ProviderFeedItem[]> {
  const { data, error } = await supabase.rpc('provider_feed', { lat, lng, radius_m: radiusM });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    categoryId: r.category_id as ServiceCategoryId,
    address: r.address_text,
    note: r.note,
    paymentMethod: r.payment_method as 'cash' | 'card',
    distanceKm: Math.round((Number(r.distance_m) / 1000) * 10) / 10,
    createdAt: r.created_at,
    myOfferPrice: r.my_offer_price != null ? Number(r.my_offer_price) : null,
    myOfferNote: r.my_offer_note ?? null,
  }));
}

/** Place or edit the provider's bid on a request (optionally with a note). */
export async function submitOffer(requestId: string, price: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('submit_offer', {
    p_request_id: requestId,
    p_price: price,
    p_note: note ?? null,
  });
  if (error) throw error;
}

/** Withdraw the provider's offer on a request. */
export async function withdrawOffer(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_offer', { p_request_id: requestId });
  if (error) throw error;
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
