import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { LogoMark } from '../../components/Logo';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { AZ_DIAL_CODE, formatAzLocal, sanitizeAzLocal, validateAzPhone } from '../../lib/phone';
import { formatDob, sanitizeDob, validateDob } from '../../lib/dob';
import { formatAzPlate, sanitizeAzPlate, validateAzPlate } from '../../lib/plate';
import { mapAuthError } from './LoginScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [dobDigits, setDobDigits] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plateRaw, setPlateRaw] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    if (!fullName.trim()) {
      setError('Ad və soyadını yaz.');
      return;
    }
    const phone = validateAzPhone(phoneDigits);
    if (!phone.valid) {
      setError(phone.error!);
      return;
    }
    const dob = validateDob(dobDigits);
    if (!dob.valid) {
      setError(dob.error!);
      return;
    }
    if (!make.trim() || !model.trim()) {
      setError('Avtomobilin marka və modelini yaz.');
      return;
    }
    const plate = validateAzPlate(plateRaw);
    if (!plate.valid) {
      setError(plate.error!);
      return;
    }

    setLoading(true);
    try {
      await signUp({
        phone: phone.e164!,
        fullName,
        dateOfBirth: dob.iso!,
        vehicle: { make, model, color, plate: plate.value! },
      });
      // On success the session updates and RootNavigator swaps to the app.
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
          <Text style={styles.subtitle}>Telefon nömrənlə bir neçə saniyədə qeydiyyatdan keç</Text>

          <Text style={styles.label}>Ad, soyad</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Adın Soyadın"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Telefon</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>{AZ_DIAL_CODE}</Text>
            <TextInput
              value={formatAzLocal(phoneDigits)}
              onChangeText={(v) => setPhoneDigits(sanitizeAzLocal(v))}
              placeholder="(55) - 123 - 45 - 67"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              style={styles.phoneInput}
            />
          </View>

          <Text style={styles.label}>Doğum tarixi</Text>
          <TextInput
            value={formatDob(dobDigits)}
            onChangeText={(v) => setDobDigits(sanitizeDob(v))}
            placeholder="GG.AA.İİİİ"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>Avtomobilin</Text>

          <Text style={styles.label}>Marka</Text>
          <TextInput
            value={make}
            onChangeText={setMake}
            placeholder="Toyota"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Model</Text>
          <TextInput
            value={model}
            onChangeText={setModel}
            placeholder="Corolla"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Rəng</Text>
          <TextInput
            value={color}
            onChangeText={setColor}
            placeholder="Ağ"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>Dövlət nömrəsi</Text>
          <TextInput
            value={formatAzPlate(plateRaw)}
            onChangeText={(v) => setPlateRaw(sanitizeAzPlate(v))}
            placeholder="90-XX-000"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            label="Qeydiyyatdan keç"
            onPress={handleRegister}
            loading={loading}
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
  sectionLabel: { ...type.h3, marginTop: 10, marginBottom: 4 },
  label: { ...type.label, marginBottom: 8, marginTop: 14 },
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
  },
  prefix: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textDim, marginRight: 10 },
  phoneInput: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.cream },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 16 },
  linkRow: { alignItems: 'center', paddingVertical: 16 },
  linkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textDim },
  linkAccent: { fontFamily: fonts.bodySemi, color: colors.amber },
});
