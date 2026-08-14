import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { RatingStars } from '../../components/RatingStars';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useCategories } from '../../context/CategoriesContext';
import { fetchMyVehicles, fetchMyProviderSkills, vehicleLine, Vehicle } from '../../lib/api';
import { isoToDisplay } from '../../lib/dob';
import { ServiceCategoryId } from '../../data/mock';
import { ProviderStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ProviderStackParamList>;

function initials(name: string | null | undefined): string {
  if (!name) return '👤';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function ProviderProfileScreen() {
  const { resetApp, setRole } = useApp();
  const { signOut, profile } = useAuth();
  const { getCategory } = useCategories();
  const navigation = useNavigation<Nav>();
  const [defaultVehicle, setDefaultVehicle] = useState<Vehicle | null>(null);
  const [skills, setSkills] = useState<ServiceCategoryId[]>([]);

  // Same account as the customer side, so show that same primary vehicle here;
  // also refresh the selected service skills on focus.
  useFocusEffect(
    useCallback(() => {
      fetchMyVehicles()
        .then((vs) => setDefaultVehicle(vs.find((v) => v.isDefault) ?? vs[0] ?? null))
        .catch(() => {});
      fetchMyProviderSkills()
        .then(setSkills)
        .catch(() => {});
    }, [])
  );

  const menuItems: { icon: keyof typeof Feather.glyphMap; label: string; onPress?: () => void }[] = [
    { icon: 'briefcase', label: 'Xidmət növlərim', onPress: () => navigation.navigate('ProviderServices') },
    { icon: 'credit-card', label: 'Ödəniş məlumatları' },
    { icon: 'file-text', label: 'Sənədlərim' },
    { icon: 'help-circle', label: 'Dəstək' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Profil</Text>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(profile?.fullName)}</Text>
          </View>
          <View>
            <Text style={styles.name}>{profile?.fullName || 'Usta'}</Text>
            <View style={styles.ratingRow}>
              <RatingStars value={5} size={13} />
              <Text style={styles.ratingText}>Yeni</Text>
            </View>
            <Text style={styles.ratingText}>
              {[profile?.phone, isoToDisplay(profile?.dateOfBirth)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Bacarıqlar</Text>
        {skills.length === 0 ? (
          <Pressable style={styles.skillsEmpty} onPress={() => navigation.navigate('ProviderServices')}>
            <Text style={styles.skillsEmptyText}>Xidmət növü seçilməyib — seçmək üçün toxun</Text>
          </Pressable>
        ) : (
          <View style={styles.skillsRow}>
            {skills.map((s) => {
              const category = getCategory(s);
              if (!category) return null;
              return (
                <View key={s} style={styles.skillChip}>
                  <Feather name={category.icon as any} size={13} color={colors.amber} />
                  <Text style={styles.skillText}>{category.title}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Card style={styles.vehicleCard}>
          <View style={styles.vehicleRow}>
            <Feather name="truck" size={16} color={defaultVehicle ? colors.amber : colors.textFaint} />
            <Text style={[styles.vehicleText, !defaultVehicle && styles.vehicleTextEmpty]} numberOfLines={1}>
              {defaultVehicle ? vehicleLine(defaultVehicle) : 'Avtomobil əlavə edilməyib'}
            </Text>
          </View>
        </Card>

        <Pressable style={styles.switchCard} onPress={() => setRole('customer')}>
          <View style={styles.switchIcon}>
            <Feather name="navigation" size={18} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Müştəri rejiminə keç</Text>
            <Text style={styles.switchDesc}>Özün üçün yolda kömək çağır</Text>
          </View>
          <Feather name="arrow-right" size={18} color={colors.amber} />
        </Pressable>

        <View style={styles.menu}>
          {menuItems.map((item) => (
            <Pressable key={item.label} style={styles.menuRow} onPress={item.onPress}>
              <View style={styles.menuIcon}>
                <Feather name={item.icon} size={16} color={colors.textDim} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.logout}
          onPress={async () => {
            await signOut();
            resetApp();
          }}
        >
          <Feather name="log-out" size={16} color={colors.danger} />
          <Text style={styles.logoutText}>Çıxış et</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { ...type.h2, marginBottom: 20, marginTop: 4 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
  name: { fontFamily: fonts.headingMedium, fontSize: 17, color: colors.cream, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textDim },
  sectionLabel: { ...type.label, marginBottom: 10 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amberSoft,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  skillText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.amber },
  skillsEmpty: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  skillsEmptyText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
  vehicleCard: { marginBottom: 16 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vehicleText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream },
  vehicleTextEmpty: { color: colors.textDim },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amberDim,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  switchIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.cream },
  switchDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  menu: { gap: 2, marginBottom: 24 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.cream },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.danger },
});
