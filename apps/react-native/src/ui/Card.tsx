import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, fontSize } from '../lib/theme';

export interface CardProps {
  /** Optional section title (rendered uppercase, muted) */
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({ title, children, style }) => (
  <View style={style}>
    {title ? <Text style={styles.title}>{title.toUpperCase()}</Text> : null}
    <View style={styles.container}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  container: {
    backgroundColor: colors.bgSurface,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
});
