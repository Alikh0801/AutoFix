import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { useCategories } from '../../context/CategoriesContext';
import { fetchProviderEarnings, ProviderEarnings } from '../../lib/api';

const AZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

function formatJobDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export function EarningsScreen() {
  const { getCategory } = useCategories();
  const [data, setData] = useState<ProviderEarnings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchProviderEarnings());
    } catch {
      // keep last-known data on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  const maxAmount = Math.max(1, ...data.weekByDay.map((d) => d.amount));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Qazanc</Text>

        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Bu həftə</Text>
          <Text style={styles.totalValue}>{data.weekTotal} AZN</Text>
          <View style={styles.chartRow}>
            {data.weekByDay.map((d, i) => (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${(d.amount / maxAmount) * 100}%` }]} />
                </View>
                <Text style={styles.barLabel}>{d.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.statValue}>{data.jobsDone}</Text>
            <Text style={styles.statLabel}>Tamamlanan iş</Text>
          </Card>
          <Card style={styles.statCard}>
            <Feather name="star" size={16} color={colors.amber} />
            <Text style={styles.statValue}>{data.ratingCount > 0 ? data.ratingAvg.toFixed(1) : 'Yeni'}</Text>
            <Text style={styles.statLabel}>Reytinq</Text>
          </Card>
          <Card style={styles.statCard}>
            <Feather name="alert-circle" size={16} color={data.commissionOwed > 0 ? colors.danger : colors.info} />
            <Text style={styles.statValue}>{data.commissionOwed} AZN</Text>
            <Text style={styles.statLabel}>Komissiya borcu</Text>
          </Card>
        </View>

        <Text style={styles.sectionTitle}>Son işlər</Text>
        {data.recentJobs.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="briefcase" size={24} color={colors.textFaint} />
            <Text style={styles.emptyText}>Hələ tamamlanmış iş yoxdur</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {data.recentJobs.map((item) => {
              const category = getCategory(item.categoryId);
              return (
                <Card key={item.id} style={styles.jobRow}>
                  <View style={styles.jobIcon}>
                    <Feather name={(category?.icon as any) ?? 'tool'} size={16} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobTitle}>{category?.title ?? 'Xidmət'}</Text>
                    <Text style={styles.jobDate}>{formatJobDate(item.completedAt)}</Text>
                  </View>
                  <Text style={styles.jobPrice}>{item.price != null ? `${item.price} AZN` : '—'}</Text>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { ...type.h2, marginBottom: 16, marginTop: 4 },
  totalCard: { marginBottom: 16 },
  totalLabel: { ...type.label, marginBottom: 6 },
  totalValue: { fontFamily: fonts.heading, fontSize: 30, color: colors.amber, marginBottom: 18 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', height: 90, alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 6, flex: 1 },
  barTrack: {
    width: 14,
    height: 70,
    borderRadius: 7,
    backgroundColor: colors.surface2,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', backgroundColor: colors.amber, borderRadius: 7 },
  barLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16 },
  statValue: { fontFamily: fonts.headingMedium, fontSize: 16, color: colors.cream },
  statLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textDim, textAlign: 'center' },
  sectionTitle: { ...type.h3, marginBottom: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textFaint },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobTitle: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.cream },
  jobDate: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textDim, marginTop: 1 },
  jobPrice: { fontFamily: fonts.monoSemi, fontSize: 12.5, color: colors.amber },
});
