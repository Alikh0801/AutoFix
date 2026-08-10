import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomerTabs } from './CustomerTabs';
import { RequestDetailsScreen } from '../screens/customer/RequestDetailsScreen';
import { SearchingScreen } from '../screens/customer/SearchingScreen';
import { TrackingScreen } from '../screens/customer/TrackingScreen';
import { RatingScreen } from '../screens/shared/RatingScreen';
import { VehiclesScreen } from '../screens/customer/VehiclesScreen';
import { VehicleFormScreen } from '../screens/customer/VehicleFormScreen';
import { CustomerStackParamList } from './types';

const Stack = createNativeStackNavigator<CustomerStackParamList>();

export function CustomerRoot() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      <Stack.Screen name="RequestDetails" component={RequestDetailsScreen} />
      <Stack.Screen name="Searching" component={SearchingScreen} />
      <Stack.Screen name="Tracking" component={TrackingScreen} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Vehicles" component={VehiclesScreen} />
      <Stack.Screen name="VehicleForm" component={VehicleFormScreen} />
    </Stack.Navigator>
  );
}
