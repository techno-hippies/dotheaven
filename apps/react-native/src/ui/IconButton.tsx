import React from 'react';
import { StyleSheet, TouchableOpacity, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii } from '../lib/theme';

export type IconButtonVariant = 'ghost' | 'soft' | 'default' | 'play' | 'send';
export type IconButtonSize = 'md' | 'lg' | 'xl';

export interface IconButtonProps {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  hitSlop?: Insets;
  activeOpacity?: number;
  children: React.ReactNode;
  accessibilityLabel: string;
}

const variantStyles: Record<IconButtonVariant, ViewStyle> = {
  ghost: { backgroundColor: 'transparent' },
  soft: { backgroundColor: colors.bgElevated, borderRadius: radii.full, borderWidth: 1, borderColor: colors.borderDefault },
  default: { backgroundColor: colors.bgHighlight, borderRadius: radii.full, borderWidth: 1, borderColor: colors.borderDefault },
  play: { backgroundColor: colors.white, borderRadius: radii.full },
  send: { backgroundColor: colors.accentBlue, borderRadius: radii.full },
};

const disabledVariantStyles: Partial<Record<IconButtonVariant, ViewStyle>> = {
  send: { backgroundColor: colors.bgElevated },
};

const sizeMap: Record<IconButtonSize, number> = {
  md: 36,
  lg: 40,
  xl: 44,
};

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'ghost',
  size = 'md',
  disabled = false,
  style,
  onPress,
  onPressIn,
  onPressOut,
  hitSlop,
  activeOpacity = 0.7,
  children,
  accessibilityLabel,
}) => {
  const dim = sizeMap[size];

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles[variant],
        { width: dim, height: dim },
        disabled && styles.disabled,
        disabled && disabledVariantStyles[variant],
        style,
      ]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      activeOpacity={activeOpacity}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
