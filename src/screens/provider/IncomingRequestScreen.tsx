import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useCategories } from '../../context/CategoriesContext';
import { submitOffer } from '../../lib/api';
import { ProviderStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProviderStackParamList, 'IncomingRequest'>;

export function IncomingRequestScreen({ route, navigation }: Props) {
  const { request } = route.params;
  const { getCategory } = useCategories();
  const category = getCategory(request.categoryId);
  const minPrice = category?.minPrice ?? 0;

  const [price, setPrice] = useState(minPrice ? String(minPrice) : '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleOffer = async () => {
    Keyboard.dismiss();
    setError(null);
    const value = Number(price);
    if (!value || value < minPrice) {
      setError(`Təklif minimum ${minPrice} AZN olmalıdır.`);
      return;
    }
    setSubmitting(true);
    try {
      await submitOffer(request.id, value);
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Təklif göndərilmədi. Yenidən cəhd et.');
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.dismissArea} onPress={() => Keyboard.dismiss()} accessible={false}>
        <View style={styles.grabber} />
        <Text style={styles.newBadge}>YENİ SORĞU</Text>

        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Feather name={(category?.icon as any) ?? 'tool'} size={24} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{category?.title ?? 'Sorğu'}</Text>
              <Text style={styles.distance}>{request.distanceKm} km məsafədə</Text>
            </View>
            <Text style={styles.pay}>{request.paymentMethod === 'card' ? 'Kart' : 'Nağd'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Feather name="map-pin" size={14} color={colors.textDim} />
            <Text style={styles.infoText}>{request.address ?? 'Ünvan göstərilməyib'}</Text>
          </View>
          {request.note ? (
            <View style={styles.infoRow}>
              <Feather name="message-square" size={14} color={colors.textDim} />
              <Text style={styles.infoText}>{request.note}</Text>
            </View>
          ) : null}
        </Card>

        <Text style={styles.label}>Təklifin (AZN)</Text>
        <View style={styles.priceRow}>
          <TextInput
            value={price}
            onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder={`min ${minPrice}`}
            placeholderTextColor={colors.textFaint}
            style={styles.priceInput}
          />
          <Text style={styles.priceHint}>minimum {minPrice} AZN</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ flex: 1 }} />

        <View style={styles.actions}>
          <Button label="İmtina" variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <Button label="Təklif ver" onPress={handleOffer} loading={submitting} style={{ flex: 2 }} />
        </View>
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  dismissArea: { flex: 1 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16 },
  newBadge: { ...type.label, color: colors.amber, textAlign: 'center', marginBottom: 12 },
  card: { marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.headingMedium, fontSize: 17, color: colors.cream },
  distance: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginTop: 2 },
  pay: { fontFamily: fonts.monoSemi, fontSize: 12, color: colors.amber },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream, lineHeight: 19 },
  label: { ...type.label, marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  priceInput: {
    flex: 1,
    height: 54,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: fonts.headingMedium,
    fontSize: 20,
    color: colors.cream,
  },
  priceHint: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 12 },
});
