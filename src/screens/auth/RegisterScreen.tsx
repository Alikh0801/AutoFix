import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { LogoMark } from '../../components/Logo';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { AZ_DIAL_CODE, formatAzLocal, sanitizeAzLocal, validateAzPhone } from '../../lib/phone';
import { mapAuthError } from './LoginScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    const phone = validateAzPhone(phoneDigits);
    if (!phone.valid) {
      setError(phone.error!);
      return;
    }

    setLoading(true);
    try {
      // Reject a number that's already registered before creating the account.
      const { data: taken, error: rpcErr } = await supabase.rpc('is_phone_taken', {
        p_phone: phone.e164,
      });
      if (rpcErr) throw rpcErr;
      if (taken) {
        setError('Bu nömrə artıq qeydiyyatdadır.');
        setLoading(false);
        return;
      }

      // On success the session updates and RootNavigator swaps to the app.
      await signUp(email, password, fullName, phone.e164!);
    } catch (e: any) {
      setError(mapAuthError(e?.message));
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <LogoMark size={40} />
          <Text style={styles.title}>Hesab yarat</Text>
          <Text style={styles.subtitle}>
            Bir neçə saniyədə qeydiyyatdan keç
          </Text>

          <Text style={styles.label}>Ad, soyad</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Adın Soyadın"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

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

          <Text style={styles.label}>Telefon</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>{AZ_DIAL_CODE}</Text>
            <TextInput
              value={formatAzLocal(phoneDigits)}
              onChangeText={(v) => setPhoneDigits(sanitizeAzLocal(v))}
              placeholder="55 322 11 11"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={styles.phoneInput}
            />
          </View>

          <Text style={styles.label}>Parol</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Ən azı 6 simvol"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            label="Qeydiyyatdan keç"
            onPress={handleRegister}
            loading={loading}
            disabled={!fullName.trim() || !email.trim() || phoneDigits.length < 9 || password.length < 6}
            style={{ marginTop: 12 }}
          />
          <Pressable style={styles.linkRow} onPress={() => navigation.replace('Login')}>
            <Text style={styles.linkText}>
              Hesabın var? <Text style={styles.linkAccent}>Daxil ol</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, flexGrow: 1 },
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    height: 54,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  prefix: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textDim, marginRight: 10 },
  phoneInput: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.cream },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 2 },
  linkRow: { alignItems: 'center', paddingVertical: 16 },
  linkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  linkAccent: { fontFamily: fonts.bodySemi, color: colors.amber },
});
