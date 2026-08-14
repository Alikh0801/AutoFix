import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { LogoMark } from '../../components/Logo';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { AZ_DIAL_CODE, formatAzLocal, sanitizeAzLocal, validateAzPhone } from '../../lib/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    Keyboard.dismiss();
    setError(null);
    const phone = validateAzPhone(phoneDigits);
    if (!phone.valid) {
      setError(phone.error!);
      return;
    }
    setLoading(true);
    try {
      // On success the session updates and RootNavigator swaps to the app.
      await signIn(phone.e164!);
    } catch (e: any) {
      setError(mapAuthError(e?.message));
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.dismissArea} onPress={() => Keyboard.dismiss()} accessible={false}>
        <SafeAreaView style={styles.container}>
          <LogoMark size={40} />
          <Text style={styles.title}>Xoş gəldin</Text>
          <Text style={styles.subtitle}>Telefon nömrənlə daxil ol</Text>

          <Text style={styles.label}>Telefon</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>{AZ_DIAL_CODE}</Text>
            <TextInput
              value={formatAzLocal(phoneDigits)}
              onChangeText={(v) => setPhoneDigits(sanitizeAzLocal(v))}
              placeholder="55-322-11-11"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={styles.phoneInput}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ flex: 1 }} />

          <Button label="Daxil ol" onPress={handleLogin} loading={loading} disabled={phoneDigits.length < 9} />
          <Pressable style={styles.linkRow} onPress={() => navigation.replace('Register')}>
            <Text style={styles.linkText}>
              Hesabın yoxdur? <Text style={styles.linkAccent}>Qeydiyyatdan keç</Text>
            </Text>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

export function mapAuthError(message?: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Bu nömrə ilə hesab tapılmadı. Əvvəlcə qeydiyyatdan keç.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Bu nömrə artıq qeydiyyatdadır.';
  if (m.includes('unable to validate') || m.includes('invalid phone')) return 'Telefon nömrəsi düzgün deyil.';
  if (m.includes('network')) return 'Şəbəkə xətası. İnternet bağlantını yoxla.';
  return message || 'Xəta baş verdi. Yenidən cəhd et.';
}

const styles = StyleSheet.create({
  dismissArea: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 },
  title: { ...type.h1, marginTop: 20, marginBottom: 6 },
  subtitle: { ...type.bodyDim, fontSize: 15, marginBottom: 28 },
  label: { ...type.label, marginBottom: 8, marginTop: 4 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    height: 54,
    paddingHorizontal: 16,
  },
  prefix: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textDim, marginRight: 10 },
  phoneInput: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.cream },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
    marginTop: 14,
  },
  linkRow: { alignItems: 'center', paddingVertical: 16 },
  linkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  linkAccent: { fontFamily: fonts.bodySemi, color: colors.amber },
});
