import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { useCategories } from '../../context/CategoriesContext';
import { ServiceCategoryId } from '../../data/mock';
import {
  ensureProviderProfile,
  fetchMyProviderSkills,
  addProviderSkill,
  removeProviderSkill,
} from '../../lib/api';
import { ProviderStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProviderStackParamList, 'ProviderServices'>;

export function ProviderServicesScreen({ navigation }: Props) {
  const { categories } = useCategories();
  const [selected, setSelected] = useState<Set<ServiceCategoryId>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ServiceCategoryId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await ensureProviderProfile();
        const skills = await fetchMyProviderSkills();
        setSelected(new Set(skills));
      } catch {
        // leave empty on error
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async (id: ServiceCategoryId, enable: boolean) => {
    setBusy(id);
    // Optimistic update, reverted on failure.
    setSelected((prev) => {
      const next = new Set(prev);
      if (enable) next.add(id);
      else next.delete(id);
      return next;
    });
    try {
      if (enable) await addProviderSkill(id);
      else await removeProviderSkill(id);
    } catch {
      setSelected((prev) => {
        const next = new Set(prev);
        if (enable) next.delete(id);
        else next.add(id);
        return next;
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.cream} />
        </Pressable>
        <Text style={styles.headerTitle}>Xidmət növlərim</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.subtitle}>
        Avadanlığına uyğun xidmətləri seç — yalnız bu növlərdə sifarişlər sənə göstəriləcək.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {categories.map((cat) => {
            const on = selected.has(cat.id);
            return (
              <Card key={cat.id} style={styles.row}>
                <View style={[styles.icon, on && styles.iconOn]}>
                  <Feather name={cat.icon as any} size={18} color={on ? colors.amber : colors.textDim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{cat.title}</Text>
                  <Text style={styles.desc}>{cat.subtitle}</Text>
                </View>
                <Switch
                  value={on}
                  disabled={busy === cat.id}
                  onValueChange={(v) => toggle(cat.id, v)}
                  trackColor={{ true: colors.amberDim, false: colors.line }}
                  thumbColor={on ? colors.amber : colors.textFaint}
                />
              </Card>
            );
          })}
        </ScrollView>
      )}
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
  subtitle: { ...type.bodyDim, fontSize: 13, paddingHorizontal: 20, marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: { backgroundColor: colors.amberSoft },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.cream },
  desc: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
});
