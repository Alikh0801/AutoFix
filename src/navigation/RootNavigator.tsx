import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { navigationRef } from './navigationRef';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { RoleSelectScreen } from '../screens/auth/RoleSelectScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { CustomerRoot } from './CustomerRoot';
import { ProviderRoot } from './ProviderRoot';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';

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

export function RootNavigator() {
  const { initializing, session } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  // Returning users with a saved session skip onboarding and go straight to
  // role selection (mode pick), then into the app without logging in again.
  const initialRoute = session ? 'RoleSelect' : 'Onboarding';

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="CustomerRoot" component={CustomerRoot} />
        <Stack.Screen name="ProviderRoot" component={ProviderRoot} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
