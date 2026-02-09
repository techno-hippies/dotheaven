import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii } from '../lib/theme';

interface PillProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const Pill: React.FC<PillProps> = ({
  label,
  selected = false,
  disabled = false,
  onPress,
  style,
}) => {
  return (
    <TouchableOpacity
      style={[styles.base, selected && styles.active, disabled && styles.disabled, style]}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, selected && styles.activeText]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  active: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  activeText: {
    color: colors.white,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
