import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'sm' | 'default' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  default: {
    container: { backgroundColor: '#5b8fb8' },
    text: { color: '#ffffff' },
  },
  destructive: {
    container: { backgroundColor: '#c06a5e' },
    text: { color: '#ffffff' },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2d2645' },
    text: { color: '#f0f0f5' },
  },
  secondary: {
    container: { backgroundColor: '#2d2645' },
    text: { color: '#f0f0f5' },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: '#f0f0f5' },
  },
  link: {
    container: { backgroundColor: 'transparent' },
    text: { color: '#5b8fb8', textDecorationLine: 'underline' },
  },
};

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: { container: { height: 36, paddingHorizontal: 12 }, text: { fontSize: 14 } },
  default: { container: { height: 40, paddingHorizontal: 16 }, text: { fontSize: 16 } },
  md: { container: { height: 40, paddingHorizontal: 24 }, text: { fontSize: 16 } },
  lg: { container: { height: 44, paddingHorizontal: 32 }, text: { fontSize: 16 } },
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  onPress,
  children,
}) => {
  const isDisabled = loading || disabled;
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.base,
        vs.container,
        ss.container,
        isDisabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading && <ActivityIndicator size="small" color={vs.text.color as string} style={styles.spinner} />}
      <Text style={[styles.text, vs.text, ss.text]}>{children}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  text: {
    fontWeight: '500',
  },
  spinner: {
    marginRight: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
