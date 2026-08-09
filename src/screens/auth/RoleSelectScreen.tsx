import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { LogoMark } from '../../components/Logo';
import { RootStackParamList } from '../../navigation/types';
import { useApp, Role } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleSelect'>;

export function RoleSelectScreen({ navigation }: Props) {
  const { setRole } = useApp();
  const { session } = useAuth();

  const chooseRole = (role: Role) => {
    setRole(role);
    if (session) {
      // Already signed in — go straight into the app for the chosen mode.
      navigation.reset({
        index: 0,
        routes: [{ name: role === 'provider' ? 'ProviderRoot' : 'CustomerRoot' }],
      });
    } else {
      navigation.replace('Login');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <LogoMark size={40} />
        <Text style={styles.title}>Necə davam edək?</Text>
        <Text style={styles.subtitle}>
          Jolt-a müştəri kimi yoxsa seyyar usta kimi qoşulursan?
        </Text>
      </View>

      <View style={styles.options}>
        <RoleOption
          icon="navigation"
          title="Müştəriyəm"
          desc="Yolda nasazlıq yarandı, kömək lazımdır"
          onPress={() => chooseRole('customer')}
        />
        <RoleOption
          icon="tool"
          title="Ustayam"
          desc="Yaxınlıqdakı sifarişləri qəbul edib qazanmaq istəyirəm"
          onPress={() => chooseRole('provider')}
        />
      </View>
    </SafeAreaView>
  );
}

function RoleOption({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && { opacity: 0.85, borderColor: colors.amber }]}
    >
      <View style={styles.optionIcon}>
        <Feather name={icon} size={22} color={colors.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDesc}>{desc}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  header: { marginTop: 32, marginBottom: 40 },
  title: { ...type.h1, marginTop: 20, marginBottom: 8 },
  subtitle: { ...type.bodyDim, fontSize: 15 },
  options: { gap: 14 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 18,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontFamily: fonts.headingMedium, fontSize: 17, color: colors.cream },
  optionDesc: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textDim, marginTop: 3 },
});
