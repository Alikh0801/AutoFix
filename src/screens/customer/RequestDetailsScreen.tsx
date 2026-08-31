import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LiveMap, LiveMapMarker } from '../../components/LiveMap';
import { useCategories } from '../../context/CategoriesContext';
import { useLocation } from '../../context/LocationContext';
import { createRequest } from '../../lib/api';
import { CustomerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CustomerStackParamList, 'RequestDetails'>;
type PayMethod = 'cash' | 'card';

export function RequestDetailsScreen({ route, navigation }: Props) {
  const { getCategory } = useCategories();
  const { location, loading: locLoading, denied, refresh } = useLocation();
  const category = getCategory(route.params.category);
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<PayMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!category) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const addressText = denied
    ? 'Yer icazəsi lazımdır — toxun'
    : location
    ? [location.address, location.city].filter(Boolean).join(', ') || 'Cari GPS mövqeyi'
    : locLoading
    ? 'Yer alınır…'
    : 'Yer təyin olunmayıb — toxun';

  const handleCreate = async () => {
    if (!location) {
      refresh();
      setError('Sifariş üçün yerin təyin olunmalıdır.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const requestId = await createRequest({
        category: category.id,
        lat: location.lat,
        lng: location.lng,
        address: [location.address, location.city].filter(Boolean).join(', ') || null,
        note,
        paymentMethod: payment,
        city: location.city,
      });
      navigation.replace('Searching', { requestId, category: category.id });
    } catch (e: any) {
      setError(e?.message ?? 'Sifariş yaradılmadı. Yenidən cəhd et.');
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.cream} />
          </Pressable>
          <Text style={styles.headerTitle}>Sifariş detalları</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.categoryCard}>
            <View style={styles.categoryIcon}>
              <Feather name={category.icon as any} size={22} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryTitle}>{category.title}</Text>
              <Text style={styles.categorySub}>{category.subtitle}</Text>
            </View>
            <Text style={styles.categoryPrice}>{category.avgPrice}</Text>
          </Card>

          <Text style={styles.label}>Ünvan</Text>
          {location && (
            <LiveMap
              style={styles.mapPreview}
              markers={[{ id: 'you', lat: location.lat, lng: location.lng, variant: 'you' } as LiveMapMarker]}
              interactive={false}
            />
          )}
          <Pressable onPress={() => (denied || !location ? refresh() : undefined)}>
            <Card style={styles.rowCard} padded>
              {locLoading ? (
                <ActivityIndicator size="small" color={colors.amber} />
              ) : (
                <Feather name="map-pin" size={16} color={location ? colors.amber : colors.danger} />
              )}
              <Text style={styles.rowText} numberOfLines={2}>
                {addressText}
              </Text>
            </Card>
          </Pressable>

          <Text style={styles.label}>Ödəniş üsulu</Text>
          <View style={styles.payRow}>
            <PayOption icon="dollar-sign" label="Nağd" active={payment === 'cash'} onPress={() => setPayment('cash')} />
            <PayOption icon="credit-card" label="Kart" active={payment === 'card'} onPress={() => setPayment('card')} />
          </View>

          <Text style={styles.label}>Əlavə qeyd (istəyə bağlı)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Məs: Avtomobil ağ Toyota Corolla, yol kənarında dayanıb..."
            placeholderTextColor={colors.textFaint}
            style={styles.noteInput}
            multiline
          />

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Button label={`${category.title} üçün usta çağır`} onPress={handleCreate} loading={submitting} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function PayOption({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.payOption, active && styles.payOptionActive]}>
      <Feather name={icon} size={16} color={active ? colors.amber : colors.textDim} />
      <Text style={[styles.payText, active && styles.payTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
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
  scroll: { paddingTop: 8, paddingBottom: 16 },
  categoryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.cream },
  categorySub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  categoryPrice: { fontFamily: fonts.monoSemi, fontSize: 11.5, color: colors.amber },
  label: { ...type.label, marginBottom: 8, marginTop: 4 },
  mapPreview: {
    height: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  rowText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream },
  payRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  payOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  payOptionActive: { borderColor: colors.amber, backgroundColor: colors.amberSoft },
  payText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textDim },
  payTextActive: { color: colors.amber },
  noteInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
    minHeight: 88,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.cream,
    textAlignVertical: 'top',
  },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 14 },
  footer: { paddingTop: 8, paddingBottom: 8 },
});
