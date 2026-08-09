import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { useCategories } from '../../context/CategoriesContext';
import { fetchMyOrders, OrderHistoryItem, RequestStatus } from '../../lib/api';

const statusInfo: Record<RequestStatus, { label: string; color: string }> = {
  searching: { label: 'Axtarılır', color: colors.amber },
  accepted: { label: 'Qəbul edildi', color: colors.info },
  en_route: { label: 'Yolda', color: colors.info },
  arrived: { label: 'Çatdı', color: colors.info },
  in_progress: { label: 'Təmirdə', color: colors.info },
  completed: { label: 'Tamamlandı', color: colors.success },
  cancelled: { label: 'Ləğv edildi', color: colors.danger },
  expired: { label: 'Vaxtı bitdi', color: colors.textDim },
};

const AZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export function OrderHistoryScreen() {
  const { getCategory } = useCategories();
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setOrders(await fetchMyOrders());
    } catch {
      // keep last-known list on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.header}>Sifarişlərim</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const category = getCategory(item.categoryId);
            const status = statusInfo[item.status];
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Feather name={(category?.icon as any) ?? 'tool'} size={18} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{category?.title ?? 'Xidmət'}</Text>
                    <Text style={styles.date}>{formatOrderDate(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.price}>{item.price != null ? `${item.price} AZN` : '—'}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.payment}>{item.paymentMethod === 'card' ? 'Kart' : 'Nağd'}</Text>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="clock" size={26} color={colors.textFaint} />
              <Text style={styles.emptyText}>Hələ heç bir sifarişin yoxdur</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { ...type.h2, paddingHorizontal: 20, marginBottom: 16, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12, flexGrow: 1 },
  card: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.cream },
  date: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  price: { fontFamily: fonts.monoSemi, fontSize: 13, color: colors.amber },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  status: { fontFamily: fonts.bodySemi, fontSize: 12.5 },
  payment: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textDim },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 70 },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textFaint },
});
