import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../lib/theme';

export interface DividerProps {
  style?: StyleProp<ViewStyle>;
}

export const Divider: React.FC<DividerProps> = ({ style }) => (
  <View style={[styles.divider, style]} />
);

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
});
