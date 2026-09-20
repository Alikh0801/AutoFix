import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { navigationRef } from './navigationRef';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { CustomerRoot } from './CustomerRoot';
import { ProviderRoot } from './ProviderRoot';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.line,
    primary: colors.amber,
    text: colors.cream,
  },
};

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { initializing, session } = useAuth();
  const { role } = useApp();
  // Lives here because it needs both the session and the role switch, and
  // this is the first component inside all of the providers.
  usePushNotifications();

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {!session ? (
        // Single, unified sign-up / sign-in — no role chosen up front.
        <AuthStack />
      ) : role === 'provider' ? (
        // The in-app mode switch flips role, swapping the whole root navigator.
        <ProviderRoot />
      ) : (
        <CustomerRoot />
      )}
    </NavigationContainer>
  );
}
