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
