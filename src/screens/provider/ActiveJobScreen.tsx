import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Keyboard,
} from 'react-native';
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

const PIN_LENGTH = 4;

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
  const [askingPin, setAskingPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

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
    // Arrival is the one step the usta cannot take alone: it needs the code
    // the customer reads out, so open the prompt instead of advancing.
    if (step.to === 'arrived') {
      setPinError(null);
      setPin('');
      setAskingPin(true);
      return;
    }
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

  const onSubmitPin = async () => {
    Keyboard.dismiss();
    setPinError(null);
    setBusy(true);
    try {
      await advanceJob(job.id, 'arrived', pin);
      setAskingPin(false);
      setPin('');
      await load();
    } catch (e: any) {
      setPinError(errorMessage(e, 'Kod təsdiqlənmədi.'));
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
        <View style={styles.topBarRow}>
          <Pressable
            style={styles.minimizeBtn}
            onPress={() => navigation.navigate('ProviderTabs')}
            accessibilityRole="button"
            accessibilityLabel="Arxa fona keç"
          >
            <Feather name="chevron-down" size={20} color={colors.cream} />
          </Pressable>

          {/* Away from the bottom edge: walking away from a job is
              irreversible, and down there it shared the strip Android gives
              the system navigation bar. */}
          {step && (
            <Pressable
              style={styles.cancelChip}
              onPress={onCancel}
              disabled={cancelling}
              accessibilityRole="button"
              accessibilityLabel="İşdən imtina et"
            >
              <Feather name="x" size={14} color={colors.danger} />
              <Text style={styles.cancelChipText}>İmtina et</Text>
            </Pressable>
          )}
        </View>
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

          {askingPin ? (
            <View style={styles.pinBox}>
              <Text style={styles.pinTitle}>Müştərinin kodunu daxil et</Text>
              <Text style={styles.pinHint}>
                Müştərinin ekranında 4 rəqəmli kod var. Onu soruş və bura yaz.
              </Text>

              <TextInput
                value={pin}
                onChangeText={(v) => {
                  setPin(v.replace(/\D/g, '').slice(0, PIN_LENGTH));
                  setPinError(null);
                }}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                autoFocus
                placeholder="••••"
                placeholderTextColor={colors.textFaint}
                style={styles.pinInput}
                accessibilityLabel="Müştərinin kodu"
              />

              {pinError && <Text style={styles.pinError}>{pinError}</Text>}

              <View style={styles.pinActions}>
                <Button
                  label="Geri"
                  variant="secondary"
                  onPress={() => {
                    setAskingPin(false);
                    setPinError(null);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Təsdiqlə"
                  onPress={onSubmitPin}
                  loading={busy}
                  disabled={pin.length < PIN_LENGTH}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : step ? (
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
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 8,
  },
  cancelChipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.danger },
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
  // The SafeAreaView pads itself by the bottom inset; without a background of
  // its own that padding was transparent, so the map showed through as a strip
  // under the sheet. The rounded corners live on sheetInner.
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bg },
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
  pinBox: { gap: 10 },
  pinTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.cream, textAlign: 'center' },
  pinHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, textAlign: 'center', lineHeight: 18 },
  pinInput: {
    alignSelf: 'center',
    width: 170,
    height: 62,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.amberDim,
    textAlign: 'center',
    fontFamily: fonts.monoSemi,
    fontSize: 28,
    letterSpacing: 8,
    color: colors.cream,
  },
  pinError: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.danger, textAlign: 'center' },
  pinActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
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
});
