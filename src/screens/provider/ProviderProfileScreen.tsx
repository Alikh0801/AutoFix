import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { RatingStars } from '../../components/RatingStars';
import { serviceCategories } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { resetToRoleSelect } from '../../navigation/navigationRef';

const skills = ['battery', 'tire', 'lockout'] as const;

const menuItems: { icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { icon: 'briefcase', label: 'Xidmət növlərim' },
  { icon: 'credit-card', label: 'Ödəniş məlumatları' },
  { icon: 'file-text', label: 'Sənədlərim' },
  { icon: 'help-circle', label: 'Dəstək' },
];

export function ProviderProfileScreen() {
  const { resetApp } = useApp();
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Profil</Text>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>RƏ</Text>
          </View>
          <View>
            <Text style={styles.name}>Rəşad Əliyev</Text>
            <View style={styles.ratingRow}>
              <RatingStars value={5} size={13} />
              <Text style={styles.ratingText}>4.9 · 312 iş</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Bacarıqlar</Text>
        <View style={styles.skillsRow}>
          {skills.map((s) => {
            const category = serviceCategories.find((c) => c.id === s)!;
            return (
              <View key={s} style={styles.skillChip}>
                <Feather name={category.icon as any} size={13} color={colors.amber} />
                <Text style={styles.skillText}>{category.title}</Text>
              </View>
            );
          })}
        </View>

        <Card style={styles.vehicleCard}>
          <View style={styles.vehicleRow}>
            <Feather name="truck" size={16} color={colors.amber} />
            <Text style={styles.vehicleText}>VW Transporter · 10-AA-221</Text>
          </View>
        </Card>

        <View style={styles.menu}>
          {menuItems.map((item) => (
            <Pressable key={item.label} style={styles.menuRow}>
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
            resetToRoleSelect();
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
  vehicleCard: { marginBottom: 20 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vehicleText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream },
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
