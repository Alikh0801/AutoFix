import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { LiveMap, LiveMapMarker } from '../../components/LiveMap';
import { ServiceCategoryCard } from '../../components/ServiceCategoryCard';
import { useCategories } from '../../context/CategoriesContext';
import { useLocation } from '../../context/LocationContext';
import { fetchMyActiveRequest, MyActiveRequest } from '../../lib/api';
import { CustomerStackParamList, CustomerTabParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, 'Home'>,
  NativeStackScreenProps<CustomerStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const { categories, loading } = useCategories();
  const { location, loading: locLoading, denied } = useLocation();
  const [checkingActive, setCheckingActive] = useState(true);
  const [activeRequest, setActiveRequest] = useState<MyActiveRequest | null>(null);
  // Which request we have already funnelled the user into. Redirecting on
  // EVERY focus meant that while a request was in flight, backing out of the
  // tracking screen bounced straight back to it — leaving Sifarişlər, Profil
  // and Avtomobillərim unreachable for as long as the job lasted. Redirect
  // once, then leave a banner so returning to it is still one tap away.
  const autoRedirectedRef = useRef<string | null>(null);

  const openActive = useCallback(
    (r: MyActiveRequest) => {
      if (r.status === 'searching') {
        navigation.navigate('Searching', { requestId: r.id, category: r.categoryId });
      } else {
        navigation.navigate('Tracking', { requestId: r.id });
      }
    },
    [navigation]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchMyActiveRequest()
        .then((r) => {
          if (!active) return;
          setActiveRequest(r);
          setCheckingActive(false);
          if (r && autoRedirectedRef.current !== r.id) {
            autoRedirectedRef.current = r.id;
            openActive(r);
          }
        })
        .catch(() => {
          if (active) setCheckingActive(false);
        });
      return () => {
        active = false;
      };
    }, [openActive])
  );

  const locationText = denied
    ? 'Yer icazəsi lazımdır'
    : location
    ? [location.address, location.city].filter(Boolean).join(', ') || 'Cari yer'
    : locLoading
    ? 'Yer alınır…'
    : 'Yer təyin olunmayıb';

  const markers: LiveMapMarker[] = location
    ? [{ id: 'you', lat: location.lat, lng: location.lng, variant: 'you' }]
    : [];

  if (checkingActive) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.topBar}>
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={14} color={colors.amber} />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationText}
            </Text>
          </View>
          <Pressable
            style={styles.avatarChip}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Profil"
          >
            <Feather name="user" size={16} color={colors.cream} />
          </Pressable>
        </View>
      </SafeAreaView>

      <LiveMap style={styles.map} markers={markers} bottomInset={44} />

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        {activeRequest ? (
          <Pressable
            style={styles.activeBanner}
            onPress={() => openActive(activeRequest)}
            accessibilityRole="button"
            accessibilityLabel="Aktiv sifarişinə qayıt"
          >
            <View style={styles.activeIcon}>
              <Feather name="navigation" size={18} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>Aktiv sifarişin var</Text>
              <Text style={styles.activeSub} numberOfLines={1}>
                {activeRequest.status === 'searching'
                  ? 'Təkliflər gözlənilir — davam et'
                  : 'İzləmə ekranına qayıt'}
              </Text>
            </View>
            <Feather name="arrow-right" size={18} color={colors.amber} />
          </Pressable>
        ) : null}

        <Text style={styles.sheetTitle}>Nə probleminiz var?</Text>
        <Text style={styles.sheetSubtitle}>
          {activeRequest
            ? 'Yeni sifariş üçün əvvəlcə hazırkını bitir və ya ləğv et'
            : 'Problemi seç, yaxınlıqdakı ustalar təklif göndərsin'}
        </Text>

        {loading && categories.length === 0 ? (
          <View style={styles.categoryLoading}>
            <ActivityIndicator color={colors.amber} />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {categories.map((cat) => (
              <ServiceCategoryCard
                key={cat.id}
                category={cat}
                // With a request already in flight the backend refuses a second
                // one, so send the user back to it rather than into a form that
                // can only fail at the last step.
                onPress={() =>
                  activeRequest
                    ? openActive(activeRequest)
                    : navigation.navigate('RequestDetails', { category: cat.id })
                }
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Feather name="clock" size={16} color={colors.amber} />
          </View>
          <Text style={styles.bannerText}>
            Sorğun <Text style={{ color: colors.amber }}>8 km</Text> radiusundakı ustalara göndərilir
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },
  header: { backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  locationText: { flexShrink: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream },
  avatarChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amberDim,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  activeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.cream },
  activeSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  sheetTitle: { ...type.h2, marginBottom: 4 },
  sheetSubtitle: { ...type.bodyDim, fontSize: 13, marginBottom: 16 },
  categoryRow: { gap: 12, paddingRight: 8, paddingBottom: 4 },
  categoryLoading: { height: 96, alignItems: 'center', justifyContent: 'center' },
  banner: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
  },
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim },
});
