import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LiveMap, LiveMapMarker } from '../../components/LiveMap';
import { StatusStepper } from '../../components/StatusStepper';
import { useCategories } from '../../context/CategoriesContext';
import { cancelActiveJob, fetchRequestDetail, RequestDetail } from '../../lib/api';
import { distanceKm, etaMinutes } from '../../lib/location';
import { RequestStatus } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { CustomerStackParamList } from '../../navigation/types';

const CANCELLABLE: RequestStatus[] = ['accepted', 'en_route', 'arrived'];

type Props = NativeStackScreenProps<CustomerStackParamList, 'Tracking'>;

const statusCopy: Record<RequestStatus, string> = {
  searching: 'Ustalar axtarılır',
  accepted: 'Usta sifarişi qəbul etdi',
  en_route: 'Usta sənə doğru yoldadır',
  arrived: 'Usta məkana çatdı',
  in_progress: 'Təmir işi davam edir',
  completed: 'İş tamamlandı',
  cancelled: 'Sifariş ləğv olundu',
  expired: 'Vaxtı bitdi',
};

function initials(name: string | null): string {
  if (!name) return 'U';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function TrackingScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const { getCategory } = useCategories();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetchRequestDetail(requestId)
        .then((d) => {
          if (!active) return;
          setDetail(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    load();
    const t = setInterval(load, 4000); // live status + provider position
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [requestId]);

  if (loading || !detail) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const category = getCategory(detail.categoryId);
  const enRoute = detail.status === 'accepted' || detail.status === 'en_route';
  const hasLive =
    enRoute &&
    detail.providerLat != null &&
    detail.providerLng != null &&
    detail.pickupLat != null &&
    detail.pickupLng != null;
  const km = hasLive
    ? distanceKm(detail.providerLat!, detail.providerLng!, detail.pickupLat!, detail.pickupLng!)
    : null;
  const canCancel = CANCELLABLE.includes(detail.status);

  const onCancel = () => {
    Alert.alert('Sifarişi ləğv et', 'Ustanı ləğv etmək istəyirsən? Bu geri qaytarıla bilməz.', [
      { text: 'Yox', style: 'cancel' },
      {
        text: 'Ləğv et',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelActiveJob(requestId);
            navigation.popToTop();
          } catch (e: any) {
            setCancelling(false);
            Alert.alert('Xəta', errorMessage(e, 'Ləğv edilmədi. Yenidən cəhd et.'));
          }
        },
      },
    ]);
  };

  const markers: LiveMapMarker[] = [];
  if (detail.pickupLat != null && detail.pickupLng != null) {
    markers.push({ id: 'you', lat: detail.pickupLat, lng: detail.pickupLng, variant: 'you' });
  }
  if (hasLive) {
    markers.push({ id: 'usta', lat: detail.providerLat!, lng: detail.providerLng!, variant: 'usta' });
  }

  return (
    <View style={styles.container}>
      <LiveMap style={styles.map} markers={markers} />

      {/* The job keeps running in the background; Home shows a banner back
          into it. Without this the customer could not reach any other tab
          until the job finished. */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <View style={styles.topBarRow}>
          <Pressable
            style={styles.minimizeBtn}
            onPress={() => navigation.popToTop()}
            accessibilityRole="button"
            accessibilityLabel="Arxa fona keç"
          >
            <Feather name="chevron-down" size={20} color={colors.cream} />
          </Pressable>

          {/* Up here rather than under the sheet: cancelling is destructive and
              irreversible, and at the bottom edge it sat in the strip Android
              hands to the system navigation bar. */}
          {canCancel && (
            <Pressable
              style={styles.cancelChip}
              onPress={onCancel}
              disabled={cancelling}
              accessibilityRole="button"
              accessibilityLabel="Sifarişi ləğv et"
            >
              <Feather name="x" size={14} color={colors.danger} />
              <Text style={styles.cancelChipText}>Ləğv et</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.sheetInner}>
          <View style={styles.sheetHandle} />
          <Text style={styles.statusLine}>{statusCopy[detail.status]}</Text>

          {km != null && (
            <Text style={styles.eta}>
              {km < 0.1 ? 'Çox yaxın' : `${km.toFixed(1)} km`} · ~{etaMinutes(km!)} dəq
            </Text>
          )}

          {/* A cancelled or expired request is not a point on the happy path;
              the stepper greyed every step out and read as "nothing has
              happened yet" rather than "this is over". */}
          {detail.status !== 'cancelled' && detail.status !== 'expired' && (
            <StatusStepper current={detail.status === 'searching' ? 'accepted' : (detail.status as any)} />
          )}

          <Card style={styles.ustaCard}>
            <View style={styles.ustaRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(detail.providerName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ustaName}>{detail.providerName ?? 'Usta'}</Text>
                <View style={styles.metaRow}>
                  <Feather name="star" size={12} color={colors.amber} />
                  <Text style={styles.metaText}>
                    {detail.providerRatingCount > 0 ? detail.providerRating.toFixed(1) : 'Yeni'}
                  </Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>{category?.title ?? 'Xidmət'}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => detail.providerPhone && Linking.openURL(`tel:${detail.providerPhone}`)}
                style={[styles.callBtn, !detail.providerPhone && styles.callBtnDisabled]}
                disabled={!detail.providerPhone}
                accessibilityRole="button"
                accessibilityLabel={`${detail.providerName ?? 'Usta'} ilə əlaqə saxla`}
              >
                <Feather name="phone" size={16} color={colors.bg} />
              </Pressable>
            </View>
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Razılaşdırılmış qiymət</Text>
              <Text style={styles.priceValue}>
                {detail.agreedPrice != null ? `${detail.agreedPrice} AZN` : '—'} ·{' '}
                {detail.paymentMethod === 'card' ? 'Kart' : 'Nağd'}
              </Text>
            </View>
          </Card>

          {detail.status === 'completed' ? (
            <Button
              label="Qiymətləndir"
              onPress={() =>
                navigation.replace('Rating', { requestId, rateeLabel: detail.providerName ?? 'Usta' })
              }
            />
          ) : detail.status === 'cancelled' ? (
            <Button label="Ana səhifəyə qayıt" variant="secondary" onPress={() => navigation.popToTop()} />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
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
  // under the sheet. The rounded corners live on sheetInner, so filling this
  // one just continues the sheet down to the screen edge.
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
    gap: 16,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  statusLine: { fontFamily: fonts.headingMedium, fontSize: 17, color: colors.cream, textAlign: 'center' },
  eta: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber, textAlign: 'center', marginTop: -8 },
  ustaCard: { gap: 0 },
  ustaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.bg },
  ustaName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.cream },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textDim },
  metaDot: { color: colors.textFaint, fontSize: 12 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnDisabled: { backgroundColor: colors.amberDim, opacity: 0.5 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
  priceValue: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber },
});
