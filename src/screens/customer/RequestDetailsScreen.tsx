import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useCategories } from '../../context/CategoriesContext';
import { CustomerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CustomerStackParamList, 'RequestDetails'>;

export function RequestDetailsScreen({ route, navigation }: Props) {
  const { getCategory } = useCategories();
  const category = getCategory(route.params.category);
  const [note, setNote] = useState('');

  if (!category) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.amber} />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.cream} />
          </Pressable>
          <Text style={styles.headerTitle}>Sifariş detalları</Text>
          <View style={{ width: 36 }} />
        </View>

        <Card style={styles.categoryCard}>
          <View style={styles.categoryIcon}>
            <Feather name={category.icon as any} size={22} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            <Text style={styles.categorySub}>{category.subtitle}</Text>
          </View>
          <Text style={styles.categoryPrice}>{category.avgPrice}</Text>
        </Card>

        <Text style={styles.label}>Ünvan</Text>
        <Card style={styles.rowCard} padded>
          <Feather name="map-pin" size={16} color={colors.amber} />
          <Text style={styles.rowText}>Nizami küç. 118, Bakı (cari GPS)</Text>
          <Text style={styles.editText}>Dəyiş</Text>
        </Card>

        <Text style={styles.label}>Əlavə qeyd (istəyə bağlı)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Məs: Avtomobil ağ Toyota Corolla, yol kənarında dayanıb..."
          placeholderTextColor={colors.textFaint}
          style={styles.noteInput}
          multiline
        />

        <Pressable style={styles.photoRow}>
          <Feather name="camera" size={16} color={colors.textDim} />
          <Text style={styles.photoText}>Şəkil əlavə et</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Button
          label={`${category.title} üçün usta çağır`}
          onPress={() => navigation.navigate('Searching', { category: category.id, note })}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
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
  categoryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 20 },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.cream },
  categorySub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  categoryPrice: { fontFamily: fonts.monoSemi, fontSize: 11.5, color: colors.amber },
  label: { ...type.label, marginBottom: 8, marginTop: 4 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  rowText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.cream },
  editText: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.amber },
  noteInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
    minHeight: 88,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.cream,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  photoText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textDim },
});
