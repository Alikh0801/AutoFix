import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CustomerStackParamList } from '../../navigation/types';
import { fetchMyVehicles, deleteVehicle, Vehicle } from '../../lib/api';
import { errorMessage } from '../../lib/errors';

type Props = NativeStackScreenProps<CustomerStackParamList, 'Vehicles'>;

function vehicleLabel(v: Vehicle): string {
  return [v.make, v.model].filter(Boolean).join(' ') || 'Avtomobil';
}

function vehicleDetails(v: Vehicle): string {
  return [v.color, v.plate].filter(Boolean).join(' · ');
}

export function VehiclesScreen({ navigation }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setVehicles(await fetchMyVehicles());
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

  const confirmDelete = (v: Vehicle) => {
    Alert.alert('Avtomobili sil', `${vehicleLabel(v)} silinsin?`, [
      { text: 'Ləğv et', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          // An unhandled rejection here (a car still referenced elsewhere, a
          // dropped connection) used to fail silently — the row simply stayed.
          try {
            await deleteVehicle(v.id);
          } catch (e) {
            Alert.alert('Silinmədi', errorMessage(e, 'Avtomobil silinmədi. Yenidən cəhd et.'));
          }
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Feather name="arrow-left" size={20} color={colors.cream} />
        </Pressable>
        <Text style={styles.headerTitle}>Avtomobillərim</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.carIcon}>
                <Feather name="truck" size={18} color={colors.amber} />
              </View>
              <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('VehicleForm', { vehicle: item })}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{vehicleLabel(item)}</Text>
                  {item.isDefault && <Text style={styles.defaultBadge}>ƏSAS</Text>}
                </View>
                <Text style={styles.details}>{vehicleDetails(item) || 'Detallar yoxdur'}</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(item)}
                hitSlop={8}
                style={styles.deleteBtn}
                accessibilityRole="button"
                accessibilityLabel={`${vehicleLabel(item)} avtomobilini sil`}
              >
                <Feather name="trash-2" size={16} color={colors.textDim} />
              </Pressable>
            </Card>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="truck" size={26} color={colors.textFaint} />
              <Text style={styles.emptyText}>Hələ avtomobil əlavə etməmisən</Text>
            </View>
          }
        />
      )}

      <View style={styles.footer}>
        <Button label="Avtomobil əlavə et" onPress={() => navigation.navigate('VehicleForm')} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  carIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.cream },
  defaultBadge: {
    fontFamily: fonts.monoSemi,
    fontSize: 9,
    color: colors.bg,
    backgroundColor: colors.amber,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  details: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  deleteBtn: { padding: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textFaint },
  footer: { paddingHorizontal: 20, paddingBottom: 8 },
});
