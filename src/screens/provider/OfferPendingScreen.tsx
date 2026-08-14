import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { MapMock } from '../../components/MapMock';
import { MapPin } from '../../components/MapPin';
import { useCategories } from '../../context/CategoriesContext';
import { supabase } from '../../lib/supabase';
import { fetchOfferStatus, withdrawOffer } from '../../lib/api';
import { ProviderStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProviderStackParamList, 'OfferPending'>;

export function OfferPendingScreen({ route, navigation }: Props) {
  const { requestId, categoryId, address, price } = route.params;
  const { getCategory } = useCategories();
  const category = getCategory(categoryId);
  const pulse = useRef(new Animated.Value(0)).current;
  const [withdrawing, setWithdrawing] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Poll (and listen live) for what happened to this offer: accepted -> jump
  // straight into the active job, closed -> customer picked someone else,
  // request no longer searching -> customer cancelled it. Polling is the
  // reliable path here since RLS visibility flips the moment the request
  // leaves 'searching', which can suppress the Realtime event itself.
  useEffect(() => {
    let active = true;

    const check = () => {
      if (settledRef.current) return;
      fetchOfferStatus(requestId)
        .then((s) => {
          if (!active || settledRef.current) return;
          if (!s || s.offerStatus === 'withdrawn') {
            settledRef.current = true;
            navigation.popToTop();
            return;
          }
          if (s.offerStatus === 'accepted') {
            settledRef.current = true;
            navigation.replace('ActiveJob', { requestId });
            return;
          }
          if (s.offerStatus === 'closed') {
            settledRef.current = true;
            Alert.alert('Başqa usta seçildi', 'Müştəri başqa bir təklifi qəbul etdi.');
            navigation.popToTop();
            return;
          }
          if (s.requestStatus !== 'searching') {
            settledRef.current = true;
            Alert.alert('Sorğu artıq aktiv deyil', 'Müştəri sorğunu ləğv etdi.');
            navigation.popToTop();
          }
        })
        .catch(() => {});
    };

    check();
    const t = setInterval(check, 3000);

    const channel = supabase
      .channel(`offer-pending-${requestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offers', filter: `request_id=eq.${requestId}` },
        check
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests', filter: `id=eq.${requestId}` },
        check
      )
      .subscribe();

    return () => {
      active = false;
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [requestId, navigation]);

  const handleWithdraw = () => {
    Alert.alert('Təklifi ləğv et', 'Bu təklifi geri götürmək istəyirsən?', [
      { text: 'Yox', style: 'cancel' },
      {
        text: 'Ləğv et',
        style: 'destructive',
        onPress: async () => {
          setWithdrawing(true);
          settledRef.current = true;
          try {
            await withdrawOffer(requestId);
          } catch {
            // ignore; leave regardless
          }
          navigation.popToTop();
        },
      },
    ]);
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.container}>
      <MapMock style={styles.map} dimmed>
        <View style={styles.pinCenter}>
          <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />
          <MapPin variant="usta" size={44} />
        </View>
      </MapMock>

      <SafeAreaView style={styles.footer} edges={['bottom']}>
        <View style={styles.card}>
          <Text style={styles.title}>Təklifin göndərildi</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {category?.title ?? 'Sorğu'} · {price} AZN{address ? ` · ${address}` : ''}
          </Text>

          <View style={styles.dotsRow}>
            {[0, 1, 2].map((i) => (
              <LoadingDot key={i} delay={i * 180} />
            ))}
          </View>
          <Text style={styles.waitingText}>Müştərinin cavabı gözlənilir…</Text>

          <Pressable style={styles.cancelBtn} onPress={handleWithdraw} disabled={withdrawing}>
            <Feather name="x" size={14} color={colors.textDim} />
            <Text style={styles.cancelText}>Təklifi ləğv et</Text>
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
  subtitle: { ...type.bodyDim, fontSize: 13, textAlign: 'center', marginBottom: 18 },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  waitingText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim, marginBottom: 4 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, marginTop: 10 },
  cancelText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
});
