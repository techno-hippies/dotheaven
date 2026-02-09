import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '../lib/theme';
import { ErrorBanner } from './ErrorBanner';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  left?: React.ReactNode;
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputContainerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  error,
  left,
  right,
  containerStyle,
  inputContainerStyle,
  inputStyle,
  ...inputProps
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.inputContainer, inputContainerStyle]}>
        {left ? <View style={styles.left}>{left}</View> : null}
        <TextInput
          {...inputProps}
          style={[styles.input, inputStyle]}
          placeholderTextColor={inputProps.placeholderTextColor ?? colors.textMuted}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {error ? <ErrorBanner message={error} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radii.full,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: 16,
  },
  left: {
    marginRight: 8,
  },
  right: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
});
