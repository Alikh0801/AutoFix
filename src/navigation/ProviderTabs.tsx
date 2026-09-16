import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { DashboardScreen } from '../screens/provider/DashboardScreen';
import { EarningsScreen } from '../screens/provider/EarningsScreen';
import { ProviderProfileScreen } from '../screens/provider/ProviderProfileScreen';
import { ProviderTabParamList } from './types';

const Tab = createBottomTabNavigator<ProviderTabParamList>();

const iconByRoute: Record<keyof ProviderTabParamList, keyof typeof Feather.glyphMap> = {
  Dashboard: 'compass',
  Earnings: 'trending-up',
  Profile: 'user',
};

export function ProviderTabs() {
  // Android draws edge-to-edge, so the tab bar sits under the system
  // navigation bar unless its own height accounts for that inset. A fixed
  // height alone overrides React Navigation's automatic handling.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          height: 64 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
        tabBarIcon: ({ color, size }) => (
          <Feather name={iconByRoute[route.name as keyof ProviderTabParamList]} size={size - 4} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Panel' }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ tabBarLabel: 'Qazanc' }} />
      <Tab.Screen name="Profile" component={ProviderProfileScreen} options={{ tabBarLabel: 'Profil' }} />
    </Tab.Navigator>
  );
}
