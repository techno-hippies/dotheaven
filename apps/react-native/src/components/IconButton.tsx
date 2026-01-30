import React from 'react';
import { StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';

type IconButtonVariant = 'ghost' | 'soft' | 'default' | 'play' | 'send';
type IconButtonSize = 'md' | 'lg' | 'xl';

export interface IconButtonProps {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  accessibilityLabel: string;
}

const variantStyles: Record<IconButtonVariant, ViewStyle> = {
  ghost: {},
  soft: { borderRadius: 12 },
  default: { backgroundColor: '#2d2645', borderRadius: 12 },
  play: { backgroundColor: '#ffffff', borderRadius: 999 },
  send: { backgroundColor: '#5b8fb8', borderRadius: 999 },
};

const disabledVariantStyles: Partial<Record<IconButtonVariant, ViewStyle>> = {
  send: { backgroundColor: '#2d2645' },
};

const sizeMap: Record<IconButtonSize, number> = {
  md: 32,
  lg: 40,
  xl: 44,
};

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onPress,
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
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
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
