import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { MapMock } from '../../components/MapMock';
import { MapPin } from '../../components/MapPin';
import { ServiceCategoryCard } from '../../components/ServiceCategoryCard';
import { useCategories } from '../../context/CategoriesContext';
import { useLocation } from '../../context/LocationContext';
import { CustomerStackParamList, CustomerTabParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, 'Home'>,
  NativeStackScreenProps<CustomerStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const { categories, loading } = useCategories();
  const { location, loading: locLoading, denied } = useLocation();

  const locationText = denied
    ? 'Yer icazəsi lazımdır'
    : location
    ? [location.address, location.city].filter(Boolean).join(', ') || 'Cari yer'
    : locLoading
    ? 'Yer alınır…'
    : 'Yer təyin olunmayıb';

  return (
    <View style={styles.container}>
      <MapMock style={styles.map}>
        <View style={styles.pinCenter}>
          <MapPin variant="you" size={44} />
        </View>
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <View style={styles.locationChip}>
            <Feather name="map-pin" size={13} color={colors.amber} />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationText}
            </Text>
          </View>
          <Pressable style={styles.avatarChip}>
            <Feather name="user" size={16} color={colors.cream} />
          </Pressable>
        </SafeAreaView>
      </MapMock>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Nə probleminiz var?</Text>
        <Text style={styles.sheetSubtitle}>Problemi seç, ən yaxın usta 60 saniyə ərzində tapılsın</Text>

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
                onPress={() => navigation.navigate('RequestDetails', { category: cat.id })}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Feather name="clock" size={16} color={colors.amber} />
          </View>
          <Text style={styles.bannerText}>
            Orta gözləmə vaxtı hazırda <Text style={{ color: colors.amber }}>6 dəqiqə</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  pinCenter: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    marginLeft: -22,
    marginTop: -22,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(23,27,34,0.9)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: '78%',
  },
  locationText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.cream },
  avatarChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(23,27,34,0.9)',
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
