import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../providers/AuthProvider';
import { usePlayer } from '../providers/PlayerProvider';

export const ProfileScreen: React.FC = () => {
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#8fb8e0" />
      </View>
    );
  }

  const shortAddress = pkpInfo?.pubkey
    ? `${pkpInfo.pubkey.slice(0, 10)}...${pkpInfo.pubkey.slice(-8)}`
    : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {isAuthenticated ? (
        <View style={styles.content}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color="#7878a0" />
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
            <TouchableOpacity
              style={styles.flushButton}
              onPress={handleFlush}
              disabled={actionLoading}
            >
              <Ionicons name="cloud-upload" size={18} color="#1a1625" />
              <Text style={styles.flushButtonText}>Submit Scrobbles</Text>
            </TouchableOpacity>
          )}

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#f0f0f5" />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.avatar}>
            <Ionicons name="finger-print" size={48} color="#7878a0" />
          </View>

          <Text style={styles.welcomeTitle}>Welcome to Heaven</Text>
          <Text style={styles.welcomeSubtitle}>
            Sign in with a passkey to enable scrobbling. Your music listening is recorded on-chain.
          </Text>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={handleRegister}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#1a1625" />
            ) : (
              <>
                <Ionicons name="key" size={18} color="#1a1625" />
                <Text style={styles.registerButtonText}>Create Account</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleAuthenticate}
            disabled={actionLoading}
          >
            <Ionicons name="log-in-outline" size={18} color="#f0f0f5" />
            <Text style={styles.loginButtonText}>I have an account</Text>
          </TouchableOpacity>
        </View>
      )}

      {actionLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#8fb8e0" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1625',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1f1b2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2d2645',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f0f0f5',
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
    backgroundColor: '#252139',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    color: '#7878a0',
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#b8b8d0',
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
    backgroundColor: '#1f1b2e',
    borderRadius: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f0f0f5',
  },
  statLabel: {
    fontSize: 12,
    color: '#7878a0',
    marginTop: 4,
  },
  flushButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#8fb8e0',
    marginBottom: 12,
  },
  flushButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1625',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#2d2645',
    marginTop: 20,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f0f0f5',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#f0f0f5',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#7878a0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#8fb8e0',
    width: '100%',
    marginBottom: 12,
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1625',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#2d2645',
    width: '100%',
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#f0f0f5',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26, 22, 37, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#f0f0f5',
  },
});
