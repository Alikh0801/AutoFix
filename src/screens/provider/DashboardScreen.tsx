import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { LiveMap, LiveMapMarker } from '../../components/LiveMap';
import { RatingStars } from '../../components/RatingStars';
import { ProviderStackParamList, ProviderTabParamList } from '../../navigation/types';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useCategories } from '../../context/CategoriesContext';
import { useLocation } from '../../context/LocationContext';
import { supabase } from '../../lib/supabase';
import { fetchProviderFeed, setProviderStatus, fetchMyActiveJob, ProviderFeedItem } from '../../lib/api';

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'Usta';
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'indi';
  return `${mins} dəq əvvəl`;
}

function initials(name: string | null): string {
  if (!name) return 'M';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<ProviderTabParamList, 'Dashboard'>,
  NativeStackScreenProps<ProviderStackParamList>
>;

export function DashboardScreen({ navigation }: Props) {
  const { isOnline, setIsOnline } = useApp();
  const { profile, session } = useAuth();
  const { location } = useLocation();
  const { getCategory } = useCategories();
  const [feed, setFeed] = useState<ProviderFeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  // Gate the feed behind an active-job check so a provider with an ongoing
  // job never sees the browsing list — they get funnelled straight into it.
  const [checkingActive, setCheckingActive] = useState(true);

  // Mirror online status + location to the DB.
  useEffect(() => {
    setProviderStatus(isOnline, location?.lat, location?.lng).catch(() => {});
  }, [isOnline, location?.lat, location?.lng]);

  const loadFeed = useCallback(() => {
    if (!isOnline || !location) {
      setFeed([]);
      return;
    }
    setLoadingFeed(true);
    fetchProviderFeed(location.lat, location.lng)
      .then(setFeed)
      .catch(() => {})
      .finally(() => setLoadingFeed(false));
  }, [isOnline, location]);

  const checkActive = useCallback(
    (onNone: () => void) => {
      fetchMyActiveJob()
        .then((job) => {
          if (job) {
            navigation.navigate('ActiveJob', { requestId: job.id });
          } else {
            onNone();
          }
        })
        .catch(() => onNone());
    },
    [navigation]
  );

  // On every focus (mount, tab switch back, returning after completing a job),
  // check for an active job FIRST. If there is one, jump straight into it and
  // never reveal the browsing feed; only load the feed once we know there
  // isn't one.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setCheckingActive(true);
      checkActive(() => {
        if (active) {
          setCheckingActive(false);
          loadFeed();
        }
      });
      return () => {
        active = false;
      };
    }, [checkActive, loadFeed])
  );

  // Also react live the instant one of the provider's own offers gets
  // accepted, instead of waiting for a tab-focus to notice — a provider
  // browsing the feed (not on the dedicated waiting screen) would otherwise
  // sit on a stale "no requests" panel until they switched tabs and back.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const channel = supabase
      .channel(`provider-own-offers-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'offers', filter: `provider_id=eq.${uid}` },
        (payload) => {
          if ((payload.new as any)?.status === 'accepted') {
            checkActive(() => {});
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, checkActive]);

  // Refresh the feed live as requests appear / change.
  useEffect(() => {
    if (!isOnline) return;
    const channel = supabase
      .channel('provider-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => loadFeed())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOnline, loadFeed]);

  // Also poll on a timer: when a customer cancels, RLS hides the row from the
  // provider so no Realtime event arrives — a periodic refetch drops cancelled
  // and expired requests out of the list.
  useEffect(() => {
    if (!isOnline) return;
    const t = setInterval(() => loadFeed(), 12000);
    return () => clearInterval(t);
  }, [isOnline, loadFeed]);

  // Memoised: a fresh array each render would re-post to the WebView every time.
  const markers = useMemo<LiveMapMarker[]>(() => {
    const out: LiveMapMarker[] = [];
    if (location) out.push({ id: 'me', lat: location.lat, lng: location.lng, variant: 'usta' });
    if (isOnline) {
      for (const r of feed) {
        if (r.pickupLat != null && r.pickupLng != null) {
          out.push({ id: r.id, lat: r.pickupLat, lng: r.pickupLng, variant: 'destination' });
        }
      }
    }
    return out;
  }, [location, isOnline, feed]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.topBar}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.greeting} numberOfLines={1}>
              Salam, {firstName(profile?.fullName)}
            </Text>
            <Text style={styles.status} numberOfLines={1}>
              {isOnline ? 'Aktivsən · sifarişlər görünür' : 'Passivsən · sifariş gəlmir'}
            </Text>
          </View>
          <View style={styles.onlineToggle}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.textFaint }]} />
            <Switch
              value={isOnline}
              onValueChange={setIsOnline}
              trackColor={{ true: colors.amberDim, false: colors.line }}
              thumbColor={isOnline ? colors.amber : colors.textFaint}
            />
          </View>
        </View>
      </SafeAreaView>

      <LiveMap style={styles.map} markers={markers} bottomInset={28} />

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        {checkingActive ? (
          <View style={styles.offlineBox}>
            <ActivityIndicator color={colors.amber} />
          </View>
        ) : (
          <>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetTitle}>Yaxınlıqdakı sorğular</Text>
          <Text style={styles.sheetCount}>{isOnline ? feed.length : 0}</Text>
        </View>

        {!isOnline ? (
          <View style={styles.offlineBox}>
            <Feather name="moon" size={22} color={colors.textFaint} />
            <Text style={styles.offlineText}>Sifariş almaq üçün aktiv rejimə keç</Text>
          </View>
        ) : loadingFeed && feed.length === 0 ? (
          <View style={styles.offlineBox}>
            <ActivityIndicator color={colors.amber} />
          </View>
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 12, paddingBottom: 8, flexGrow: 1 }}
            renderItem={({ item }) => {
              const category = getCategory(item.categoryId);
              return (
                <Pressable onPress={() => navigation.navigate('IncomingRequest', { request: item })}>
                  <Card style={[styles.reqCard, item.myOfferPrice != null && styles.reqCardOffered]}>
                    <View style={styles.reqTop}>
                      <View style={styles.reqIcon}>
                        <Feather name={(category?.icon as any) ?? 'tool'} size={17} color={colors.amber} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqTitle}>{category?.title ?? 'Sorğu'}</Text>
                        <Text style={styles.reqAddress} numberOfLines={1}>
                          {item.address ?? 'Ünvan göstərilməyib'}
                        </Text>
                      </View>
                      <Text style={styles.reqPay}>{item.paymentMethod === 'card' ? 'Kart' : 'Nağd'}</Text>
                    </View>
                    <View style={styles.reqCustomerRow}>
                      <View style={styles.reqCustomerAvatar}>
                        <Text style={styles.reqCustomerAvatarText}>{initials(item.customerName)}</Text>
                      </View>
                      <Text style={styles.reqCustomerName} numberOfLines={1}>
                        {item.customerName ?? 'Müştəri'}
                      </Text>
                      <RatingStars value={Math.round(item.customerRating ?? 5)} size={10} />
                      <Text style={styles.reqMeta}>
                        {item.customerRatingCount > 0 ? item.customerRating!.toFixed(1) : 'Yeni'}
                      </Text>
                      {item.customerVehicleLabel ? (
                        <>
                          <Text style={styles.reqDot}>·</Text>
                          <Text style={styles.reqMeta} numberOfLines={1}>
                            {item.customerVehicleLabel}
                          </Text>
                        </>
                      ) : null}
                    </View>
                    <View style={styles.reqBottom}>
                      <Feather name="navigation" size={12} color={colors.textDim} />
                      <Text style={styles.reqMeta}>{item.distanceKm} km</Text>
                      <Text style={styles.reqDot}>·</Text>
                      <Text style={styles.reqMeta}>{minutesAgo(item.createdAt)}</Text>
                    </View>
                    {item.myOfferPrice != null && (
                      <View style={styles.offeredBadge}>
                        <Feather name="check-circle" size={12} color={colors.success} />
                        <Text style={styles.offeredText}>Təklif verildi · {item.myOfferPrice} AZN</Text>
                      </View>
                    )}
                  </Card>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.offlineBox}>
                <Feather name="inbox" size={22} color={colors.textFaint} />
                <Text style={styles.offlineText}>Yaxınlıqda uyğun sorğu yoxdur</Text>
              </View>
            }
          />
        )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  greeting: { fontFamily: fonts.headingMedium, fontSize: 18, color: colors.cream },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  onlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  map: { flex: 1 },
  // Fixed share of the screen rather than flex:1 — the list scrolls inside it,
  // so an empty feed no longer leaves half the screen blank while the map is
  // squeezed into a strip.
  sheet: {
    height: '38%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 14 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { ...type.h3 },
  sheetCount: {
    fontFamily: fonts.monoSemi,
    fontSize: 12,
    color: colors.bg,
    backgroundColor: colors.amber,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
  },
  reqCard: { gap: 0 },
  reqCardOffered: { borderColor: colors.amberDim },
  offeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  offeredText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.success },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },
  reqAddress: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  reqPay: { fontFamily: fonts.monoSemi, fontSize: 12, color: colors.amber },
  reqCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  reqCustomerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqCustomerAvatarText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.bg },
  reqCustomerName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.cream, flexShrink: 1 },
  reqBottom: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  reqMeta: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textDim },
  reqDot: { color: colors.textFaint, fontSize: 11 },
  offlineBox: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  offlineText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textFaint, textAlign: 'center' },
});
