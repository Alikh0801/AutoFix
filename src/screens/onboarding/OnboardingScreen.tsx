import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { LogoMark } from '../../components/Logo';
import { RootStackParamList } from '../../navigation/types';

const { width } = Dimensions.get('window');

const slides = [
  {
    icon: 'zap' as const,
    title: 'Yolda qalma',
    body: 'Avtomobilin xarab olanda tək başına qalma — bir toxunuşla yaxınlıqdakı ustaya çağırış göndər.',
  },
  {
    icon: 'map-pin' as const,
    title: 'Ən yaxın usta gəlsin',
    body: 'Xəritədə sənə ən yaxın ustalar görünür, sifarişi qəbul edən dərhal yerini görür və yola düşür.',
  },
  {
    icon: 'shield' as const,
    title: 'Şəffaf və etibarlı',
    body: 'Reytinq, qiymət razılaşması və canlı izləmə ilə hər addım aydındır.',
  },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  const isLast = index === slides.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.brandRow}>
        <LogoMark size={28} />
        <Text style={styles.brand}>
          JOLT<Text style={{ color: colors.amber }}>.</Text>
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.title}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconWrap}>
              <Feather name={item.icon} size={40} color={colors.amber} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button
          label={isLast ? 'Başla' : 'İrəli'}
          onPress={() => {
            if (isLast) {
              navigation.replace('Login');
            } else {
              listRef.current?.scrollToIndex({ index: index + 1 });
            }
          }}
        />
        {!isLast && (
          <Button
            label="Keç"
            variant="ghost"
            onPress={() => navigation.replace('Login')}
            style={{ marginTop: 10 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  brand: { fontFamily: fonts.heading, fontSize: 18, color: colors.cream, letterSpacing: 0.3 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: { ...type.h1, textAlign: 'center', marginBottom: 14 },
  body: { ...type.bodyDim, textAlign: 'center', fontSize: 15 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.amber, width: 20 },
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
});
