import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontSize } from '../lib/theme';

export interface SpinnerProps {
  size?: 'small' | 'large';
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'small', label, style }) => (
  <View style={[styles.container, style]}>
    <ActivityIndicator size={size} color={colors.accentBlue} />
    {label ? <Text style={styles.label}>{label}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
