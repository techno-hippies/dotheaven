import React, { useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fingerprint, Key, SignIn } from 'phosphor-react-native';
import { useAuth } from '../providers/AuthProvider';
import { colors, spacing, fontSize } from '../lib/theme';
import { Button, Spinner } from '../ui';
import { ProfileHeader } from '../components/ProfileHeader';
import { ProfileAbout } from '../components/ProfileAbout';
import { useProfile } from '../hooks/useProfile';

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading: authLoading, pkpInfo, register, authenticate } = useAuth();
  const [actionLoading, setActionLoading] = useState(false);
  const { profile, profileLoading, refreshing, refresh } = useProfile({
    isAuthenticated,
    address: pkpInfo?.ethAddress,
  });

  const handleRegister = async () => {
    setActionLoading(true);
    try {
      await register();
      Alert.alert('Success', 'Account created with passkey!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Registration failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    setActionLoading(true);
    try {
      await authenticate();
      Alert.alert('Success', 'Signed in!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Authentication failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Auth loading
  if (authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Spinner size="large" />
      </View>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={styles.welcomeIcon}>
            <Fingerprint size={48} color={colors.textMuted} weight="light" />
          </View>
          <Text style={styles.welcomeTitle}>Your Profile</Text>
          <Text style={styles.welcomeSubtitle}>
            Sign up to create your profile and connect with others.
          </Text>
          <View style={styles.authButtons}>
            <Button
              variant="default"
              size="md"
              fullWidth
              onPress={handleRegister}
              disabled={actionLoading}
              loading={actionLoading}
              leftIcon={<Key size={18} color={colors.white} weight="fill" />}
            >
              Sign Up
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onPress={handleAuthenticate}
              disabled={actionLoading}
              leftIcon={<SignIn size={18} color={colors.textPrimary} />}
            >
              I have an account
            </Button>
          </View>
        </View>
      </View>
    );
  }

  // Authenticated — show profile
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {profileLoading && !profile ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <Spinner label="Loading profile..." />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accentBlue}
              colors={[colors.accentBlue]}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          <ProfileHeader
            avatarUrl={profile?.avatarUrl}
            name={profile?.name ?? 'Unknown'}
            handle={profile?.handle}
            bio={profile?.bio}
            location={profile?.location}
            followerCount={profile?.followerCount}
            followingCount={profile?.followingCount}
            nationalityCode={profile?.nationalityCode}
          />

          {profile ? <ProfileAbout profile={profile} /> : null}

        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.headerPaddingHorizontal,
    paddingBottom: spacing.headerPaddingBottom,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 32,
  },
  authButtons: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 12,
  },
});
