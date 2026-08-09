import { ServiceCategoryId } from '../data/mock';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
};

export type CustomerStackParamList = {
  CustomerTabs: undefined;
  RequestDetails: { category: ServiceCategoryId };
  Searching: { category: ServiceCategoryId; note: string };
  Tracking: undefined;
  Rating: undefined;
};

export type CustomerTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

export type ProviderStackParamList = {
  ProviderTabs: undefined;
  IncomingRequest: { requestId: string };
  ActiveJob: { requestId: string };
};

export type ProviderTabParamList = {
  Dashboard: undefined;
  Earnings: undefined;
  Profile: undefined;
};
