import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { LogoMark } from '../../components/Logo';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      // On success the session updates and RootNavigator swaps to the app.
      await signIn(email, password);
    } catch (e: any) {
      setError(mapAuthError(e?.message));
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container}>
        <LogoMark size={40} />
        <Text style={styles.title}>Xoş gəldin</Text>
        <Text style={styles.subtitle}>Hesabına daxil ol</Text>

        <Text style={styles.label}>E-poçt</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="ad@example.com"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>Parol</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ flex: 1 }} />

        <Button
          label="Daxil ol"
          onPress={handleLogin}
          loading={loading}
          disabled={!email.trim() || password.length < 6}
        />
        <Pressable style={styles.linkRow} onPress={() => navigation.replace('Register')}>
          <Text style={styles.linkText}>
            Hesabın yoxdur? <Text style={styles.linkAccent}>Qeydiyyatdan keç</Text>
          </Text>
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function mapAuthError(message?: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-poçt və ya parol yanlışdır.';
  if (m.includes('email not confirmed')) return 'E-poçt təsdiqlənməyib.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Bu e-poçt artıq qeydiyyatdadır.';
  if (m.includes('password should be')) return 'Parol ən azı 6 simvol olmalıdır.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'E-poçt ünvanı düzgün deyil.';
  if (m.includes('network')) return 'Şəbəkə xətası. İnternet bağlantını yoxla.';
  return message || 'Xəta baş verdi. Yenidən cəhd et.';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 },
  title: { ...type.h1, marginTop: 20, marginBottom: 6 },
  subtitle: { ...type.bodyDim, fontSize: 15, marginBottom: 28 },
  label: { ...type.label, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    height: 54,
    paddingHorizontal: 16,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.cream,
    marginBottom: 16,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
    marginTop: 2,
  },
  linkRow: { alignItems: 'center', paddingVertical: 16 },
  linkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  linkAccent: { fontFamily: fonts.bodySemi, color: colors.amber },
});
