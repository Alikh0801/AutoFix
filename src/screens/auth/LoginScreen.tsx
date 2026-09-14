import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
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
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.hero}>
            <View style={styles.badge}>
              <LogoMark size={44} />
            </View>
            <Text style={styles.wordmark}>
              AUTO<Text style={{ color: colors.amber }}>FIX</Text>
            </Text>
            <Text style={styles.tagline}>yolda qalma</Text>

            <Text style={styles.title}>Xoş gəldin</Text>
            <Text style={styles.subtitle}>Davam etmək üçün telefon nömrənlə daxil ol</Text>

            <View style={styles.phoneRow}>
              <Feather name="phone" size={16} color={colors.textDim} />
              <Text style={styles.prefix}>{AZ_DIAL_CODE}</Text>
              <View style={styles.divider} />
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

            <Button
              label="Daxil ol"
              onPress={handleLogin}
              loading={loading}
              disabled={phoneDigits.length < 9}
              style={{ marginTop: 22 }}
            />
          </View>

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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 28 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  wordmark: { fontFamily: fonts.heading, fontSize: 26, color: colors.cream, letterSpacing: 0.3 },
  tagline: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.textDim,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 36,
  },
  title: { ...type.h2, textAlign: 'center', marginBottom: 6 },
  subtitle: { ...type.bodyDim, fontSize: 14, textAlign: 'center', marginBottom: 32, paddingHorizontal: 12 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    height: 58,
    paddingHorizontal: 18,
    gap: 10,
  },
  prefix: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.cream },
  divider: { width: 1, height: 22, backgroundColor: colors.line },
  phoneInput: {
    flex: 1,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginTop: 14,
  },
  linkRow: { alignItems: 'center', paddingVertical: 16 },
  linkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  linkAccent: { fontFamily: fonts.bodySemi, color: colors.amber },
});
