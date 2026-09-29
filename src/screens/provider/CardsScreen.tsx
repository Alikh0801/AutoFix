import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import {
  checkCardSave,
  deleteCard,
  fetchMyCards,
  isCardUsable,
  SavedCard,
  setDefaultCard,
  startCardSave,
  syncCards,
} from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { ProviderStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProviderStackParamList, 'Cards'>;

// The save finishes on Payriff's side a moment after the browser closes, and
// the callback is not always first. Poll until it settles.
const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Payriff's own wording, translated for the one screen that shows it. */
const STATUS_LABEL: Record<SavedCard['status'], string> = {
  created: 'Yarımçıq qalıb',
  verified: 'Təsdiqlənir…',
  reversed: '',
  reverse_failed: 'Yoxlama məbləği qaytarılmadı',
  declined: 'Bank imtina etdi',
  expired: 'Vaxtı bitdi',
};

export function CardsScreen({ navigation }: Props) {
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCards(await fetchMyCards());
    } catch {
      setCards([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Payriff's list is the authority on what can still be charged; a card
      // the bank has since cancelled only shows up here.
      syncCards()
        .then((r) => {
          if (r.removed > 0) load();
        })
        .catch(() => {});
    }, [load])
  );

  const handleAdd = async () => {
    setBusy(true);
    try {
      const { cardSaveId, paymentUrl } = await startCardSave();

      // Card details are entered on Payriff's page; they never reach us.
      await WebBrowser.openBrowserAsync(paymentUrl);

      let status = 'CREATED';
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        const res = await checkCardSave(cardSaveId).catch(() => null);
        status = res?.status ?? status;
        // VERIFIED is not done: the 0.01 AZN is still outstanding.
        if (status === 'REVERSED' || status === 'DECLINED' || status === 'EXPIRED') break;
        await sleep(POLL_INTERVAL_MS);
      }

      await load();

      if (status === 'REVERSED') {
        Alert.alert('Kart əlavə olundu', 'Komissiya bundan sonra bu kartdan tutulacaq.');
      } else if (status === 'DECLINED') {
        Alert.alert('Kart təsdiqlənmədi', 'Bank imtina etdi. Başqa kart yoxla.');
      } else if (status === 'EXPIRED') {
        Alert.alert('Vaxt bitdi', 'Kart məlumatları vaxtında daxil edilmədi.');
      } else {
        Alert.alert('Yoxlanılır', 'Kartın təsdiqi bir az çəkir. Bir azdan bu səhifəni yenilə.');
      }
    } catch (e) {
      Alert.alert('Kart əlavə olunmadı', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCardPress = (card: SavedCard) => {
    const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isCardUsable(card) && !card.isDefault) {
      actions.push({
        text: 'Əsas kart et',
        onPress: async () => {
          try {
            await setDefaultCard(card.id);
            await load();
          } catch (e) {
            Alert.alert('Alınmadı', errorMessage(e));
          }
        },
      });
    }

    actions.push({
      text: 'Kartı sil',
      style: 'destructive',
      onPress: () => confirmDelete(card),
    });
    actions.push({ text: 'Bağla', style: 'cancel' });

    Alert.alert(card.maskedPan ?? 'Kart', undefined, actions);
  };

  const confirmDelete = (card: SavedCard) => {
    Alert.alert(
      'Kartı sil',
      'Bu kart birdəfəlik silinir və komissiya ondan tutula bilməyəcək.',
      [
        { text: 'Yox', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteCard(card.id);
              await load();
            } catch (e) {
              Alert.alert('Silinmədi', errorMessage(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const usableCount = (cards ?? []).filter(isCardUsable).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} disabled={busy}>
          <Feather name="arrow-left" size={20} color={colors.cream} />
        </Pressable>
        <Text style={styles.headerTitle}>Ödəniş kartları</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {cards === null ? (
          <ActivityIndicator color={colors.amber} style={{ marginTop: 32 }} />
        ) : cards.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="credit-card" size={26} color={colors.textFaint} />
            <Text style={styles.emptyText}>
              Komissiya bu kartdan tutulur. İşə başlamaq üçün bir kart əlavə et.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {cards.map((card) => {
              const usable = isCardUsable(card);
              return (
                <Pressable key={card.id} onPress={() => handleCardPress(card)} disabled={busy}>
                  <Card style={styles.cardRow}>
                    <View style={[styles.cardIcon, !usable && styles.cardIconDim]}>
                      <Feather
                        name="credit-card"
                        size={18}
                        color={usable ? colors.amber : colors.textFaint}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardPan, !usable && styles.cardPanDim]}>
                        {card.maskedPan ?? 'Kart'}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {[card.cardBrand?.replace('_', ' '), STATUS_LABEL[card.status]]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {card.isDefault && <Text style={styles.defaultBadge}>ƏSAS</Text>}
                    <Feather name="more-vertical" size={16} color={colors.textFaint} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.note}>
          Kart məlumatların bankın səhifəsində daxil edilir və AutoFix-ə ötürülmür. Yoxlama üçün
          0.01 AZN tutulur və dərhal geri qaytarılır.
        </Text>

        {usableCount === 1 && (
          <Text style={styles.note}>
            Yeganə kartını silmək üçün əvvəlcə yeni kart əlavə etməlisən.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Kart əlavə et" onPress={handleAdd} loading={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: fonts.headingMedium, fontSize: 16, color: colors.cream },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconDim: { backgroundColor: colors.surface2 },
  cardPan: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.cream },
  cardPanDim: { color: colors.textDim },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  defaultBadge: {
    fontFamily: fonts.monoSemi,
    fontSize: 9.5,
    color: colors.amber,
    letterSpacing: 0.8,
    marginRight: 4,
  },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 20 },
  emptyText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 20,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 18,
    marginTop: 18,
  },
  footer: { paddingHorizontal: 20, paddingBottom: 8 },
});
