import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Bell,
  Globe,
  Palette,
  Info,
  FileText,
  ShieldCheck,
  SignOut,
  ArrowLeft,
} from 'phosphor-react-native';
import { useAuth } from '../providers/AuthProvider';
import { colors, spacing, fontSize } from '../lib/theme';
import { IconButton } from '../ui';
import { SettingsMenu, type SettingsMenuItem } from '../components/SettingsMenu';

interface SettingsScreenProps {
  onBack?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, logout } = useAuth();

  const accountItems: SettingsMenuItem[] = [
    {
      key: 'profile',
      icon: User,
      label: 'Edit Profile',
      onPress: () => console.log('Edit Profile'),
    },
    {
      key: 'notifications',
      icon: Bell,
      label: 'Notifications',
      onPress: () => console.log('Notifications'),
    },
  ];

  const appItems: SettingsMenuItem[] = [
    {
      key: 'language',
      icon: Globe,
      label: 'Language',
      value: 'English',
      onPress: () => console.log('Language'),
    },
    {
      key: 'theme',
      icon: Palette,
      label: 'Theme',
      value: 'Dark',
      onPress: () => console.log('Theme'),
    },
  ];

  const aboutItems: SettingsMenuItem[] = [
    {
      key: 'version',
      icon: Info,
      label: 'App Version',
      value: '0.1.0',
    },
    {
      key: 'terms',
      icon: FileText,
      label: 'Terms of Service',
      onPress: () => console.log('Terms'),
    },
    {
      key: 'privacy',
      icon: ShieldCheck,
      label: 'Privacy Policy',
      onPress: () => console.log('Privacy'),
    },
  ];

  const dangerItems: SettingsMenuItem[] = isAuthenticated
    ? [
        {
          key: 'logout',
          icon: SignOut,
          label: 'Sign Out',
          destructive: true,
          onPress: logout,
        },
      ]
    : [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {onBack ? (
          <IconButton variant="soft" size="md" onPress={onBack} accessibilityLabel="Back">
            <ArrowLeft size={20} color={colors.textPrimary} />
          </IconButton>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {isAuthenticated ? (
          <SettingsMenu title="Account" items={accountItems} style={styles.section} />
        ) : null}

        <SettingsMenu title="App" items={appItems} style={styles.section} />
        <SettingsMenu title="About" items={aboutItems} style={styles.section} />

        {dangerItems.length > 0 ? (
          <SettingsMenu items={dangerItems} style={styles.section} />
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.headerPaddingHorizontal,
    paddingBottom: spacing.headerPaddingBottom,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
    gap: 24,
  },
  section: {},
});
