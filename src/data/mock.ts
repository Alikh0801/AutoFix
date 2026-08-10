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

export const serviceCategories: ServiceCategory[] = [
  {
    id: 'battery',
    title: 'Akkumulyator',
    subtitle: 'cərəyan / işə salma',
    icon: 'battery-charging',
    avgPrice: '5-15 AZN',
    avgMinutes: 12,
    minPrice: 5,
  },
  {
    id: 'tire',
    title: 'Təkər',
    subtitle: 'Hava, dəyişmə, deşik',
    icon: 'disc',
    avgPrice: '10-30 AZN',
    avgMinutes: 15,
    minPrice: 5,
  },
  {
    id: 'fuel',
    title: 'Yanacaq',
    subtitle: 'Benzin / dizel çatdırılması',
    icon: 'droplet',
    avgPrice: '20-35 AZN',
    avgMinutes: 18,
    minPrice: 10,
  },
  {
    id: 'lockout',
    title: 'Açar maşında qalıb',
    subtitle: 'Qapı açılması',
    icon: 'key',
    avgPrice: '15-25 AZN',
    avgMinutes: 10,
    minPrice: 5,
  },
  {
    id: 'diagnostics',
    title: 'Diaqnostika',
    subtitle: 'Nasazlığın yoxlanması',
    icon: 'activity',
    avgPrice: '10-20 AZN',
    avgMinutes: 20,
    minPrice: 10,
  },
  {
    id: 'other',
    title: 'Digər',
    subtitle: 'Başqa problem təsvir et',
    icon: 'tool',
    avgPrice: 'Qiymət razılaşma ilə',
    avgMinutes: 15,
    minPrice: 0,
  },
];

export interface Usta {
  id: string;
  name: string;
  rating: number;
  jobsDone: number;
  vehicle: string;
  distanceKm: number;
  etaMinutes: number;
  skills: ServiceCategoryId[];
  avatarColor: string;
  initials: string;
}

export const mockUstas: Usta[] = [
  {
    id: 'u1',
    name: 'Rəşad Əliyev',
    rating: 4.9,
    jobsDone: 312,
    vehicle: 'VW Transporter · 10-AA-221',
    distanceKm: 1.2,
    etaMinutes: 4,
    skills: ['battery', 'tire', 'lockout'],
    avatarColor: '#3DD68C',
    initials: 'RƏ',
  },
  {
    id: 'u2',
    name: 'Elvin Məmmədov',
    rating: 4.8,
    jobsDone: 187,
    vehicle: 'Ford Transit · 90-BC-410',
    distanceKm: 2.4,
    etaMinutes: 7,
    skills: ['battery', 'fuel'],
    avatarColor: '#5FA8FF',
    initials: 'EM',
  },
  {
    id: 'u3',
    name: 'Tural Hüseynov',
    rating: 5.0,
    jobsDone: 94,
    vehicle: 'Şəxsi avtomobil, alət çantası',
    distanceKm: 3.1,
    etaMinutes: 9,
    skills: ['tire', 'lockout', 'other'],
    avatarColor: '#FFB627',
    initials: 'TH',
  },
];

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

export interface HistoryOrder {
  id: string;
  category: ServiceCategoryId;
  date: string;
  price: string;
  ustaName: string;
  rating: number;
}

export const customerHistory: HistoryOrder[] = [
  { id: 'o1001', category: 'battery', date: '2 Avq, 14:20', price: '18 AZN', ustaName: 'Rəşad Əliyev', rating: 5 },
  { id: 'o0998', category: 'tire', date: '28 İyul, 09:05', price: '12 AZN', ustaName: 'Tural Hüseynov', rating: 5 },
  { id: 'o0991', category: 'lockout', date: '19 İyul, 22:40', price: '20 AZN', ustaName: 'Elvin Məmmədov', rating: 4 },
];

export interface FeedRequest {
  id: string;
  category: ServiceCategoryId;
  customerName: string;
  distanceKm: number;
  address: string;
  note: string;
  offer: string;
  postedMinutesAgo: number;
}

export const providerFeed: FeedRequest[] = [
  {
    id: 'r2001',
    category: 'battery',
    customerName: 'Nihad C.',
    distanceKm: 0.8,
    address: 'Nizami küç. 118 yaxınlığı',
    note: 'Maşın işə düşmür, işıqlar da zəifdir.',
    offer: '20 AZN',
    postedMinutesAgo: 1,
  },
  {
    id: 'r2002',
    category: 'tire',
    customerName: 'Günel S.',
    distanceKm: 1.6,
    address: '28 May metrosu ətrafı',
    note: 'Arxa sağ təkər deşilib, ehtiyat təkər var.',
    offer: '15 AZN',
    postedMinutesAgo: 3,
  },
  {
    id: 'r2003',
    category: 'fuel',
    customerName: 'Kamran A.',
    distanceKm: 2.9,
    address: 'Heydər Əliyev pr. 45',
    note: 'Benzin qurtarıb, 5 litr lazımdır.',
    offer: '25 AZN',
    postedMinutesAgo: 6,
  },
];

export interface EarningsDay {
  label: string;
  amount: number;
}

export const earningsWeek: EarningsDay[] = [
  { label: 'B.e', amount: 42 },
  { label: 'Ç.a', amount: 58 },
  { label: 'Ç', amount: 35 },
  { label: 'C.a', amount: 71 },
  { label: 'C', amount: 64 },
  { label: 'Ş', amount: 88 },
  { label: 'B', amount: 53 },
];
