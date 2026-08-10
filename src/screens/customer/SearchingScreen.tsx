import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { MapMock } from '../../components/MapMock';
import { MapPin } from '../../components/MapPin';
import { useCategories } from '../../context/CategoriesContext';
import { supabase } from '../../lib/supabase';
import { fetchRequestOffers, cancelRequest, RequestOffer } from '../../lib/api';
import { CustomerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CustomerStackParamList, 'Searching'>;

export function SearchingScreen({ route, navigation }: Props) {
  const { requestId, category: categoryId } = route.params;
  const { getCategory } = useCategories();
  const category = getCategory(categoryId);
  const pulse = useRef(new Animated.Value(0)).current;
  const [offers, setOffers] = useState<RequestOffer[]>([]);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    let active = true;
    const refetch = () => {
      fetchRequestOffers(requestId)
        .then((o) => active && setOffers(o.filter((x) => x.status === 'pending')))
        .catch(() => {});
    };
    refetch();

    // Live-update as providers place or change offers on this request.
    const channel = supabase
      .channel(`offers-${requestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offers', filter: `request_id=eq.${requestId}` },
        refetch
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const onCancel = () => {
    Alert.alert('Sifarişi ləğv et', 'Bu sorğunu ləğv etmək istəyirsən?', [
      { text: 'Yox', style: 'cancel' },
      {
        text: 'Ləğv et',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelRequest(requestId);
          } catch {
            // ignore; navigate back regardless
          }
          navigation.popToTop();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <MapMock style={styles.map} dimmed>
        <View style={styles.pinCenter}>
          <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />
          <MapPin variant="you" size={44} />
        </View>
      </MapMock>

      <SafeAreaView style={styles.footer} edges={['bottom']}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {offers.length > 0 ? `${offers.length} təklif gəldi` : 'Ustalar axtarılır…'}
          </Text>
          <Text style={styles.subtitle}>
            {category?.title ?? 'Sorğu'} · sorğun yaxınlıqdakı ustalara göndərildi
          </Text>

          {offers.length === 0 ? (
            <View style={styles.dotsRow}>
              {[0, 1, 2].map((i) => (
                <LoadingDot key={i} delay={i * 180} />
              ))}
            </View>
          ) : (
            <View style={styles.offerList}>
              {offers.map((o) => (
                <Card key={o.id} style={styles.offerCard}>
                  <View style={styles.offerTop}>
                    <Feather name="tool" size={15} color={colors.amber} />
                    <Text style={styles.offerText}>Usta təklifi</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={styles.offerPrice}>{o.price} AZN</Text>
                  </View>
                  {o.note ? <Text style={styles.offerNote}>{o.note}</Text> : null}
                </Card>
              ))}
              <Text style={styles.offerHint}>Təklifi seçmək növbəti mərhələdə aktivləşəcək.</Text>
            </View>
          )}

          <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={cancelling}>
            <Feather name="x" size={14} color={colors.textDim} />
            <Text style={styles.cancelText}>Ləğv et</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 380, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  return <Animated.View style={[styles.dot, { transform: [{ translateY }] }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  pinCenter: {
    position: 'absolute',
    top: '38%',
    left: '50%',
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.amber },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  card: {
    margin: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },
  title: { ...type.h3, marginBottom: 6, textAlign: 'center' },
  subtitle: { ...type.bodyDim, fontSize: 13, textAlign: 'center', marginBottom: 16 },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  offerList: { alignSelf: 'stretch', gap: 8, marginBottom: 14 },
  offerCard: { gap: 0 },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offerText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.cream },
  offerNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 8, lineHeight: 18 },
  offerPrice: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber },
  offerHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, textAlign: 'center', marginTop: 2 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  cancelText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
});
