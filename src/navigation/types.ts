import { ServiceCategoryId } from '../data/mock';
import { Vehicle, ProviderFeedItem } from '../lib/api';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  /** Email confirmation code. `from` only changes the wording. */
  Otp: { email: string; from: 'register' | 'login' };
};

export type CustomerStackParamList = {
  CustomerTabs: undefined;
  RequestDetails: { category: ServiceCategoryId };
  Searching: { requestId: string; category: ServiceCategoryId };
  Tracking: { requestId: string };
  Rating: { requestId: string; rateeLabel: string };
  Vehicles: undefined;
  VehicleForm: { vehicle?: Vehicle } | undefined;
};

export type CustomerTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

export type ProviderStackParamList = {
  ProviderTabs: undefined;
  IncomingRequest: { request: ProviderFeedItem };
  OfferPending: {
    requestId: string;
    categoryId: ServiceCategoryId;
    address: string | null;
    price: number;
    pickupLat: number | null;
    pickupLng: number | null;
  };
  ActiveJob: { requestId: string };
  Rating: { requestId: string; rateeLabel: string };
  ProviderServices: undefined;
};

export type ProviderTabParamList = {
  Dashboard: undefined;
  Earnings: undefined;
  Profile: undefined;
};
