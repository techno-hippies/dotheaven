import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Icon } from 'phosphor-react-native';
import { colors, spacing } from '../lib/theme';

interface PlaceholderScreenProps {
  title: string;
  subtitle?: string;
  IconComponent?: Icon;
}

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({
  title,
  subtitle,
  IconComponent,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.content}>
        {IconComponent && (
          <View style={styles.iconWrap}>
            <IconComponent size={48} color={colors.textMuted} weight="light" />
          </View>
        )}
        <Text style={styles.text}>Coming soon</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    paddingHorizontal: spacing.headerPaddingHorizontal,
    paddingBottom: spacing.headerPaddingBottom,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  text: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
