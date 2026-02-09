import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fingerprint, User, Key, SignIn, SignOut, CloudArrowUp } from 'phosphor-react-native';
import { useAuth } from '../providers/AuthProvider';
import { usePlayer } from '../providers/PlayerProvider';
import { colors, spacing } from '../lib/theme';
import { Button } from '../ui';

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, pkpInfo, register, authenticate, logout } = useAuth();
  const { pendingScrobbles, flushScrobbles } = usePlayer();
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleLogout = async () => {
    await logout();
  };

  const handleFlush = async () => {
    setActionLoading(true);
    try {
      await flushScrobbles();
      Alert.alert('Done', 'Scrobbles submitted!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Flush failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accentBlue} />
      </View>
    );
  }

  const shortAddress = pkpInfo?.pubkey
    ? `${pkpInfo.pubkey.slice(0, 10)}...${pkpInfo.pubkey.slice(-8)}`
    : '';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {isAuthenticated ? (
        <View style={styles.content}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <User size={40} color={colors.textMuted} />
          </View>

          {/* PKP info */}
          <Text style={styles.label}>PKP Public Key</Text>
          <Text style={styles.address}>{shortAddress}</Text>

          {/* Scrobble stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{pendingScrobbles}</Text>
              <Text style={styles.statLabel}>Pending Scrobbles</Text>
            </View>
          </View>

          {pendingScrobbles > 0 && (
            <Button
              variant="default"
              size="md"
              fullWidth
              style={styles.actionButton}
              onPress={handleFlush}
              disabled={actionLoading}
              leftIcon={<CloudArrowUp size={18} color={colors.white} weight="fill" />}
            >
              Submit Scrobbles
            </Button>
          )}

          {/* Logout */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            style={styles.actionButton}
            onPress={handleLogout}
            leftIcon={<SignOut size={18} color={colors.textPrimary} />}
          >
            Sign Out
          </Button>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.avatar}>
            <Fingerprint size={48} color={colors.textMuted} weight="light" />
          </View>

          <Text style={styles.welcomeTitle}>Your Profile</Text>
          <Text style={styles.welcomeSubtitle}>
            Sign up to create your profile and connect with others.
          </Text>

          <Button
            variant="default"
            size="md"
            fullWidth
            style={styles.actionButton}
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
            style={styles.actionButton}
            onPress={handleAuthenticate}
            disabled={actionLoading}
            leftIcon={<SignIn size={18} color={colors.textPrimary} />}
          >
            I have an account
          </Button>
        </View>
      )}

      {actionLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.bgSurface,
    borderRadius: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  actionButton: {
    width: '100%',
    marginTop: 12,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textPrimary,
  },
});
