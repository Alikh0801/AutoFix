import React, { PropsWithChildren } from 'react';
import { View, Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../theme/colors';

interface CardProps {
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Makes the whole card tappable, with press feedback. */
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Card({
  children,
  style,
  padded = true,
  onPress,
  accessibilityLabel,
}: PropsWithChildren<CardProps>) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, padded && styles.padded, style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  padded: { padding: 18 },
  pressed: { opacity: 0.85 },
});
