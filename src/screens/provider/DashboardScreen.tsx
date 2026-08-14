import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { MapMock } from '../../components/MapMock';
import { MapPin } from '../../components/MapPin';
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

const feedPinPositions = [
  { top: '22%', left: '30%' },
  { top: '55%', left: '70%' },
  { top: '68%', left: '28%' },
] as const;

export function DashboardScreen({ navigation }: Props) {
  const { isOnline, setIsOnline } = useApp();
  const { profile } = useAuth();
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

  // On every focus (mount, tab switch back, returning after completing a job),
  // check for an active job FIRST. If there is one, jump straight into it and
  // never reveal the browsing feed; only load the feed once we know there
  // isn't one.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setCheckingActive(true);
      fetchMyActiveJob()
        .then((job) => {
          if (!active) return;
          if (job) {
            navigation.navigate('ActiveJob', { requestId: job.id });
          } else {
            setCheckingActive(false);
            loadFeed();
          }
        })
        .catch(() => {
          if (active) {
            setCheckingActive(false);
            loadFeed();
          }
        });
      return () => {
        active = false;
      };
    }, [loadFeed, navigation])
  );

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

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.topWrap}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>Salam, {firstName(profile?.fullName)}</Text>
            <Text style={styles.status}>
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

        <MapMock style={styles.map} dimmed={!isOnline}>
          <View style={[styles.pin, { top: '45%', left: '50%', marginLeft: -20, marginTop: -20 }]}>
            <MapPin variant="usta" size={40} />
          </View>
          {isOnline &&
            feed.slice(0, 3).map((r, i) => (
              <View
                key={r.id}
                style={[
                  styles.pin,
                  { top: feedPinPositions[i].top, left: feedPinPositions[i].left, marginLeft: -16, marginTop: -16 },
                ]}
              >
                <MapPin variant="destination" size={32} />
              </View>
            ))}
        </MapMock>
      </SafeAreaView>

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
  topWrap: { height: '52%' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  greeting: { fontFamily: fonts.headingMedium, fontSize: 18, color: colors.cream },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  onlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  map: { flex: 1 },
  pin: { position: 'absolute' },
  sheet: {
    flex: 1,
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
