// Shared domain types for the app. The service catalogue itself now comes
// from the database (see fetchServiceCategories); the mock rows, mock ustas
// and sample history that used to live here went with the prototype phase.
export type ServiceCategoryId = 'battery' | 'tire' | 'fuel' | 'lockout' | 'diagnostics' | 'other';

export interface ServiceCategory {
  id: ServiceCategoryId;
  title: string;
  subtitle: string;
  icon: string;
  avgPrice: string;
  avgMinutes: number;
  minPrice: number;
}

export type OrderStatus =
  | 'searching'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface OrderStep {
  status: OrderStatus;
  label: string;
}

export const orderSteps: OrderStep[] = [
  { status: 'accepted', label: 'Qəbul edildi' },
  { status: 'en_route', label: 'Yoldadır' },
  { status: 'arrived', label: 'Çatdı' },
  { status: 'in_progress', label: 'Təmirdə' },
  { status: 'completed', label: 'Tamamlandı' },
];
