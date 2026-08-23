import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { MapMock } from '../../components/MapMock';
import { MapPin } from '../../components/MapPin';
import { RatingStars } from '../../components/RatingStars';
import { useCategories } from '../../context/CategoriesContext';
import { supabase } from '../../lib/supabase';
import { fetchRequestOffers, cancelRequest, acceptOffer, RequestOffer } from '../../lib/api';
import { CustomerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CustomerStackParamList, 'Searching'>;

function initials(name: string | null): string {
  if (!name) return 'U';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function SearchingScreen({ route, navigation }: Props) {
  const { requestId, category: categoryId } = route.params;
  const { getCategory } = useCategories();
  const category = getCategory(categoryId);
  const pulse = useRef(new Animated.Value(0)).current;
  const [offers, setOffers] = useState<RequestOffer[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const onAccept = async (offerId: string) => {
    setAccepting(offerId);
    try {
      await acceptOffer(offerId);
      navigation.replace('Tracking', { requestId });
    } catch (e: any) {
      setAccepting(null);
      Alert.alert('Xəta', e?.message ?? 'Təklif qəbul edilmədi.');
    }
  };

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

    // Live-update as providers place, edit, or withdraw offers on this request.
    const channel = supabase
      .channel(`offers-${requestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offers', filter: `request_id=eq.${requestId}` },
        refetch
      )
      .subscribe();

    // Belt-and-suspenders poll, same as elsewhere in the app — a missed or
    // delayed Realtime event shouldn't leave a withdrawn offer stuck on screen.
    const t = setInterval(refetch, 4000);

    return () => {
      active = false;
      clearInterval(t);
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
                    <View style={styles.offerAvatar}>
                      <Text style={styles.offerAvatarText}>{initials(o.providerName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerText}>{o.providerName ?? 'Usta'}</Text>
                      <View style={styles.offerMetaRow}>
                        <RatingStars value={Math.round(o.providerRating)} size={11} />
                        <Text style={styles.offerMetaText}>
                          {o.providerRatingCount > 0 ? o.providerRating.toFixed(1) : 'Yeni'}
                        </Text>
                        {o.vehicleLabel ? (
                          <>
                            <Text style={styles.offerMetaDot}>·</Text>
                            <Text style={styles.offerMetaText} numberOfLines={1}>
                              {o.vehicleLabel}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.offerPrice}>{o.price} AZN</Text>
                  </View>

                  {o.providerPhone ? (
                    <Pressable
                      style={styles.offerPhoneRow}
                      onPress={() => Linking.openURL(`tel:${o.providerPhone}`)}
                    >
                      <Feather name="phone" size={12} color={colors.textDim} />
                      <Text style={styles.offerPhoneText}>{o.providerPhone}</Text>
                    </Pressable>
                  ) : null}

                  {o.note ? <Text style={styles.offerNote}>{o.note}</Text> : null}

                  <Button
                    label="Qəbul et"
                    onPress={() => onAccept(o.id)}
                    loading={accepting === o.id}
                    disabled={accepting != null && accepting !== o.id}
                    style={{ marginTop: 12, height: 44 }}
                  />
                </Card>
              ))}
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
  offerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerAvatarText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.bg },
  offerText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream },
  offerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  offerMetaText: { fontFamily: fonts.body, fontSize: 11, color: colors.textDim },
  offerMetaDot: { color: colors.textFaint, fontSize: 11 },
  offerPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  offerPhoneText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textDim },
  offerNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 8, lineHeight: 18 },
  offerPrice: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber },
  offerHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint, textAlign: 'center', marginTop: 2 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  cancelText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
});
