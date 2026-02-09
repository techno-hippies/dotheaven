import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '../lib/theme';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'default' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onPress?: () => void;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  default: {
    container: { backgroundColor: colors.accentBlue, borderColor: colors.accentBlue, borderWidth: 1 },
    text: { color: colors.white },
  },
  destructive: {
    container: { backgroundColor: colors.accentCoral, borderColor: colors.accentCoral, borderWidth: 1 },
    text: { color: colors.black },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderColor: colors.borderDefault, borderWidth: 1 },
    text: { color: colors.textPrimary },
  },
  secondary: {
    container: { backgroundColor: colors.bgElevated, borderColor: colors.borderDefault, borderWidth: 1 },
    text: { color: colors.textPrimary },
  },
  ghost: {
    container: { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 1 },
    text: { color: colors.textPrimary },
  },
  link: {
    container: { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 1 },
    text: { color: colors.accentBlue, textDecorationLine: 'underline' },
  },
};

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: { container: { minHeight: 36, paddingHorizontal: 12 }, text: { fontSize: 14 } },
  default: { container: { minHeight: 40, paddingHorizontal: 16 }, text: { fontSize: 15 } },
  md: { container: { minHeight: 48, paddingHorizontal: 16 }, text: { fontSize: 16 } },
  lg: { container: { minHeight: 52, paddingHorizontal: 20 }, text: { fontSize: 17 } },
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  contentStyle,
  textStyle,
  leftIcon,
  rightIcon,
  onPress,
  children,
}) => {
  const isDisabled = loading || disabled;
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.base,
        sizeStyle.container,
        variantStyle.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      <View style={[styles.content, contentStyle]}>
        {loading && <ActivityIndicator size="small" color={variantStyle.text.color as string} style={styles.spinner} />}
        {!loading && leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}

        {(typeof children === 'string' || typeof children === 'number') ? (
          <Text style={[styles.text, sizeStyle.text, variantStyle.text, textStyle]}>{children}</Text>
        ) : (
          children
        )}

        {!loading && rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  text: {
    fontWeight: '600',
  },
  spinner: {
    marginRight: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
