import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProviderTabs } from './ProviderTabs';
import { IncomingRequestScreen } from '../screens/provider/IncomingRequestScreen';
import { OfferPendingScreen } from '../screens/provider/OfferPendingScreen';
import { ActiveJobScreen } from '../screens/provider/ActiveJobScreen';
import { ProviderServicesScreen } from '../screens/provider/ProviderServicesScreen';
import { RatingScreen } from '../screens/shared/RatingScreen';
import { ProviderStackParamList } from './types';

const Stack = createNativeStackNavigator<ProviderStackParamList>();

export function ProviderRoot() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProviderTabs" component={ProviderTabs} />
      <Stack.Screen
        name="IncomingRequest"
        component={IncomingRequestScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="OfferPending"
        component={OfferPendingScreen}
        options={{ presentation: 'modal', gestureEnabled: false }}
      />
      <Stack.Screen name="ActiveJob" component={ActiveJobScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="ProviderServices" component={ProviderServicesScreen} />
    </Stack.Navigator>
  );
}
