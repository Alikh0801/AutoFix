import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { fetchMyVehicles, vehicleLine, Vehicle } from '../../lib/api';
import { CustomerStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CustomerStackParamList>;

function initials(name: string | null | undefined): string {
  if (!name) return '👤';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function CustomerProfileScreen() {
  const { resetApp, setRole } = useApp();
  const { signOut, profile } = useAuth();
  const navigation = useNavigation<Nav>();
  const [defaultVehicle, setDefaultVehicle] = useState<Vehicle | null>(null);

  // Refresh the primary vehicle whenever the profile tab regains focus (e.g.
  // after adding/editing a car), so the card always mirrors real data.
  useFocusEffect(
    useCallback(() => {
      fetchMyVehicles()
        .then((vs) => setDefaultVehicle(vs.find((v) => v.isDefault) ?? vs[0] ?? null))
        .catch(() => {});
    }, [])
  );

  const menuItems: { icon: keyof typeof Feather.glyphMap; label: string; onPress?: () => void }[] = [
    { icon: 'truck', label: 'Avtomobillərim', onPress: () => navigation.navigate('Vehicles') },
    { icon: 'credit-card', label: 'Ödəniş üsulları' },
    { icon: 'bell', label: 'Bildirişlər' },
    { icon: 'help-circle', label: 'Dəstək' },
    { icon: 'file-text', label: 'Şərtlər və məxfilik' },
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
            <Text style={styles.name}>{profile?.fullName || 'İstifadəçi'}</Text>
            <Text style={styles.phone}>{profile?.phone || '—'}</Text>
          </View>
        </View>

        <Pressable onPress={() => navigation.navigate('Vehicles')}>
          <Card style={styles.vehicleCard}>
            <View style={styles.vehicleRow}>
              <Feather name="truck" size={16} color={defaultVehicle ? colors.amber : colors.textFaint} />
              <Text style={[styles.vehicleText, !defaultVehicle && styles.vehicleTextEmpty]} numberOfLines={1}>
                {defaultVehicle ? vehicleLine(defaultVehicle) : 'Avtomobil əlavə et'}
              </Text>
              <Feather name="chevron-right" size={16} color={colors.textFaint} />
            </View>
          </Card>
        </Pressable>

        <Pressable style={styles.switchCard} onPress={() => setRole('provider')}>
          <View style={styles.switchIcon}>
            <Feather name="tool" size={18} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Yol Yardımı rejiminə keç</Text>
            <Text style={styles.switchDesc}>Yaxınlıqdakı sifarişlərə təklif ver və qazan</Text>
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
  avatarText: { fontFamily: fonts.heading, fontSize: 18, color: colors.bg },
  name: { fontFamily: fonts.headingMedium, fontSize: 17, color: colors.cream },
  phone: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginTop: 2 },
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
