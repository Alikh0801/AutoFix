import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { errorMessage } from '../../lib/errors';
import { CustomerStackParamList } from '../../navigation/types';
import { addVehicle, updateVehicle } from '../../lib/api';
import { formatAzPlate, sanitizeAzPlate, validateAzPlate } from '../../lib/plate';

type Props = NativeStackScreenProps<CustomerStackParamList, 'VehicleForm'>;

export function VehicleFormScreen({ route, navigation }: Props) {
  const editing = route.params?.vehicle;
  const [make, setMake] = useState(editing?.make ?? '');
  const [model, setModel] = useState(editing?.model ?? '');
  const [color, setColor] = useState(editing?.color ?? '');
  const [plateRaw, setPlateRaw] = useState(sanitizeAzPlate(editing?.plate ?? ''));
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!make.trim() || !model.trim()) {
      setError('Marka və model tələb olunur.');
      return;
    }
    const plateResult = validateAzPlate(plateRaw);
    if (!plateResult.valid) {
      setError(plateResult.error!);
      return;
    }
    setSaving(true);
    try {
      const input = { make, model, color, plate: plateResult.value!, isDefault };
      if (editing) await updateVehicle(editing.id, input);
      else await addVehicle(input);
      navigation.goBack();
    } catch (e: any) {
      setError(errorMessage(e, 'Yadda saxlanmadı. Yenidən cəhd et.'));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
            <Feather name="arrow-left" size={20} color={colors.cream} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Avtomobili redaktə et' : 'Yeni avtomobil'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Əsas avtomobil</Text>
              <Text style={styles.switchDesc}>Sifariş verəndə standart olaraq seçilsin</Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              trackColor={{ true: colors.amberDim, false: colors.line }}
              thumbColor={isDefault ? colors.amber : colors.textFaint}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Button label={editing ? 'Yadda saxla' : 'Əlavə et'} onPress={handleSave} loading={saving} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: fonts.headingMedium, fontSize: 16, color: colors.cream },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  label: { ...type.label, marginBottom: 8, marginTop: 6 },
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
    marginBottom: 8,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  switchTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.cream },
  switchDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 14 },
  footer: { paddingHorizontal: 20, paddingBottom: 8 },
});
