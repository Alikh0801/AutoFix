import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { OrderHistoryScreen } from '../screens/customer/OrderHistoryScreen';
import { CustomerProfileScreen } from '../screens/customer/CustomerProfileScreen';
import { CustomerTabParamList } from './types';

const Tab = createBottomTabNavigator<CustomerTabParamList>();

const iconByRoute: Record<keyof CustomerTabParamList, keyof typeof Feather.glyphMap> = {
  Home: 'map',
  History: 'list',
  Profile: 'user',
};

export function CustomerTabs() {
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
          <Feather name={iconByRoute[route.name as keyof CustomerTabParamList]} size={size - 4} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Xəritə' }} />
      <Tab.Screen name="History" component={OrderHistoryScreen} options={{ tabBarLabel: 'Sifarişlər' }} />
      <Tab.Screen name="Profile" component={CustomerProfileScreen} options={{ tabBarLabel: 'Profil' }} />
    </Tab.Navigator>
  );
}
