import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { MapMock } from '../../components/MapMock';
import { MapPin } from '../../components/MapPin';
import { StatusStepper } from '../../components/StatusStepper';
import { useCategories } from '../../context/CategoriesContext';
import {
  fetchMyActiveJob,
  advanceJob,
  completeJob,
  setProviderStatus,
  ActiveJob,
  RequestStatus,
} from '../../lib/api';
import { getCurrentLocation } from '../../lib/location';
import { ProviderStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProviderStackParamList, 'ActiveJob'>;

const nextStep: Partial<Record<RequestStatus, { label: string; to: 'en_route' | 'arrived' | 'in_progress' }>> = {
  accepted: { label: 'Yola çıxdım', to: 'en_route' },
  en_route: { label: 'Məkana çatdım', to: 'arrived' },
  arrived: { label: 'Təmirə başladım', to: 'in_progress' },
};

export function ActiveJobScreen({ navigation }: Props) {
  const { getCategory } = useCategories();
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => fetchMyActiveJob().then(setJob).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    // Stream the provider's live position so the customer sees them approach.
    const pushLocation = () =>
      getCurrentLocation()
        .then((loc) => setProviderStatus(true, loc.lat, loc.lng))
        .catch(() => {});
    pushLocation();
    const loc = setInterval(pushLocation, 10000);
    return () => {
      clearInterval(poll);
      clearInterval(loc);
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Feather name="check-circle" size={28} color={colors.success} />
        <Text style={styles.emptyText}>Aktiv iş yoxdur</Text>
        <Button label="Panelə qayıt" onPress={() => navigation.replace('ProviderTabs')} style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  const category = getCategory(job.categoryId);
  const step = nextStep[job.status];

  const onAdvance = async () => {
    if (!step) return;
    setBusy(true);
    try {
      await advanceJob(job.id, step.to);
      await load();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    setBusy(true);
    try {
      await completeJob(job.id);
      navigation.replace('Rating', { requestId: job.id, rateeLabel: job.customerName ?? 'Müştəri' });
    } catch (e) {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapMock style={styles.map}>
        <View style={[styles.pin, { top: '30%', left: '35%', marginLeft: -20, marginTop: -20 }]}>
          <MapPin variant="usta" size={40} />
        </View>
        <View style={[styles.pin, { top: '58%', left: '65%', marginLeft: -18, marginTop: -18 }]}>
          <MapPin variant="destination" size={36} />
        </View>
      </MapMock>

      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetInner}>
          <View style={styles.sheetHandle} />
          <StatusStepper current={job.status as any} />

          <Card>
            <View style={styles.row}>
              <View style={styles.icon}>
                <Feather name={(category?.icon as any) ?? 'tool'} size={18} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{job.customerName ?? 'Müştəri'}</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {job.address ?? 'Ünvan göstərilməyib'}
                </Text>
              </View>
              <Pressable onPress={() => Linking.openURL('tel:')} style={styles.callBtn}>
                <Feather name="phone" size={16} color={colors.bg} />
              </Pressable>
            </View>
            {job.note ? <Text style={styles.note}>{job.note}</Text> : null}
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{category?.title ?? 'Xidmət'}</Text>
              <Text style={styles.priceValue}>
                {job.agreedPrice != null ? `${job.agreedPrice} AZN` : '—'} ·{' '}
                {job.paymentMethod === 'card' ? 'Kart' : 'Nağd'}
              </Text>
            </View>
          </Card>

          {step ? (
            <Button label={step.label} onPress={onAdvance} loading={busy} />
          ) : (
            <Button label="İşi tamamladım" onPress={onComplete} loading={busy} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textDim, marginTop: 10 },
  map: { flex: 1 },
  pin: { position: 'absolute' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetInner: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 18,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.cream },
  address: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
  priceValue: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber },
});
