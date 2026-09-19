import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LiveMap, LiveMapMarker } from '../../components/LiveMap';
import { RatingStars } from '../../components/RatingStars';
import { StatusStepper } from '../../components/StatusStepper';
import { useCategories } from '../../context/CategoriesContext';
import {
  fetchMyActiveJob,
  advanceJob,
  cancelActiveJob,
  completeJob,
  setProviderStatus,
  ActiveJob,
  RequestStatus,
} from '../../lib/api';
import { getCurrentLocation } from '../../lib/location';
import { errorMessage } from '../../lib/errors';
import { ProviderStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProviderStackParamList, 'ActiveJob'>;

function initials(name: string | null): string {
  if (!name) return 'M';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

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
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  // Full details are useful right when a job is accepted; once the provider
  // is actually driving, the card just eats map space, so collapse it
  // automatically the first time status moves past "accepted" — but only
  // once, so re-expanding it manually doesn't get overridden on the next poll.
  const [expanded, setExpanded] = useState(true);
  const autoCollapsedRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);

  const load = () => fetchMyActiveJob().then(setJob).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    // Stream the provider's live position so the customer sees them approach,
    // and keep the same reading locally to draw it on our own live map.
    const pushLocation = () =>
      getCurrentLocation()
        .then((loc) => {
          setMyLoc({ lat: loc.lat, lng: loc.lng });
          setProviderStatus(true, loc.lat, loc.lng);
        })
        .catch(() => {});
    pushLocation();
    const loc = setInterval(pushLocation, 10000);
    return () => {
      clearInterval(poll);
      clearInterval(loc);
    };
  }, []);

  useEffect(() => {
    if (job && job.status !== 'accepted' && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setExpanded(false);
    }
  }, [job?.status]);

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

  const markers: LiveMapMarker[] = [];
  if (myLoc) markers.push({ id: 'me', lat: myLoc.lat, lng: myLoc.lng, variant: 'usta' });
  if (job.pickupLat != null && job.pickupLng != null) {
    markers.push({ id: 'dest', lat: job.pickupLat, lng: job.pickupLng, variant: 'destination' });
  }

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

  const onCancel = () => {
    Alert.alert('İşdən imtina et', 'Bu işi ləğv etmək istəyirsən? Bu geri qaytarıla bilməz.', [
      { text: 'Yox', style: 'cancel' },
      {
        text: 'İmtina et',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelActiveJob(job.id);
            navigation.replace('ProviderTabs');
          } catch (e: any) {
            setCancelling(false);
            Alert.alert('Xəta', errorMessage(e, 'Ləğv edilmədi. Yenidən cəhd et.'));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <LiveMap style={styles.map} markers={markers} bottomInset={expanded ? 360 : 120} />

      {/* The job stays active in the background and the Panel keeps a banner
          back into it — without this the provider could not reach Qazanc to
          settle the commission debt that blocks them from new work. */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <Pressable
          style={styles.minimizeBtn}
          onPress={() => navigation.navigate('ProviderTabs')}
          accessibilityRole="button"
          accessibilityLabel="Arxa fona keç"
        >
          <Feather name="chevron-down" size={20} color={colors.cream} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetInner}>
          <Pressable style={styles.handleRow} onPress={() => setExpanded((e) => !e)}>
            <View style={styles.sheetHandle} />
            <Feather name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textDim} />
          </Pressable>

          {expanded && (
            <>
              <StatusStepper current={job.status as any} />

              <Card>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(job.customerName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{job.customerName ?? 'Müştəri'}</Text>
                    <View style={styles.metaRow}>
                      <RatingStars value={Math.round(job.customerRating ?? 5)} size={11} />
                      <Text style={styles.metaText}>
                        {job.customerRatingCount > 0 ? job.customerRating!.toFixed(1) : 'Yeni'}
                      </Text>
                      {job.customerVehicleLabel ? (
                        <>
                          <Text style={styles.metaDot}>·</Text>
                          <Text style={[styles.metaText, styles.metaVehicle]} numberOfLines={1}>
                            {job.customerVehicleLabel}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => job.customerPhone && Linking.openURL(`tel:${job.customerPhone}`)}
                    style={[styles.callBtn, !job.customerPhone && styles.callBtnDisabled]}
                    disabled={!job.customerPhone}
                  >
                    <Feather name="phone" size={16} color={colors.bg} />
                  </Pressable>
                </View>

                <View style={styles.divider} />

                <View style={styles.addressRow}>
                  <Feather name={(category?.icon as any) ?? 'tool'} size={14} color={colors.amber} />
                  <Text style={styles.address} numberOfLines={1}>
                    {job.address ?? 'Ünvan göstərilməyib'}
                  </Text>
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
            </>
          )}

          {step ? (
            <Button label={step.label} onPress={onAdvance} loading={busy} />
          ) : (
            <Button label="İşi tamamladım" onPress={onComplete} loading={busy} />
          )}

          {step ? (
            <Pressable style={styles.cancelLink} onPress={onCancel} disabled={cancelling}>
              <Feather name="x" size={14} color={colors.textDim} />
              <Text style={styles.cancelLinkText}>İşdən imtina et</Text>
            </Pressable>
          ) : null}
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
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  minimizeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
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
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 2 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.bg },
  title: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.cream },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textDim },
  metaVehicle: { flexShrink: 1 },
  metaDot: { color: colors.textFaint, fontSize: 11 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textDim },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnDisabled: { backgroundColor: colors.amberDim, opacity: 0.5 },
  note: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
  priceValue: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber },
  cancelLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  cancelLinkText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
});
