import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii } from '../lib/theme';

interface ErrorBannerProps {
  message: string;
  style?: StyleProp<ViewStyle>;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, style }) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(250,179,135,0.1)',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: '100%',
  },
  text: {
    color: colors.accentCoral,
    fontSize: 15,
  },
});
