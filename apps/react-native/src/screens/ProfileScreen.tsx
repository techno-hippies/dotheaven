import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { Fingerprint, Key, SignIn } from 'phosphor-react-native';
import { useAuth } from '../providers/AuthProvider';
import { colors, fontSize } from '../lib/theme';
import { Button, Spinner } from '../ui';
import { ProfileHeader, type ProfileTab } from '../components/ProfileHeader';
import { ProfileAbout } from '../components/ProfileAbout';
import { ProfileMusicTab } from '../components/ProfileMusicTab';
import { useProfile } from '../hooks/useProfile';
import { fetchScrobbleEntries, type ScrobbleEntry } from '../lib/scrobbles';

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated, isLoading: authLoading, pkpInfo, register, authenticate } = useAuth();
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('timeline');
  const { profile, profileLoading, refreshing, refresh } = useProfile({
    enabled: isAuthenticated,
    address: pkpInfo?.ethAddress,
  });

  // Scrobble data
  const [scrobbles, setScrobbles] = useState<ScrobbleEntry[]>([]);
  const [scrobblesLoading, setScrobblesLoading] = useState(false);

  const loadScrobbles = useCallback(async () => {
    const addr = pkpInfo?.ethAddress;
    if (!addr) return;
    setScrobblesLoading(true);
    try {
      const entries = await fetchScrobbleEntries(addr);
      setScrobbles(entries);
    } catch (err) {
      console.error('[Profile] Failed to load scrobbles:', err);
    } finally {
      setScrobblesLoading(false);
    }
  }, [pkpInfo?.ethAddress]);

  useEffect(() => {
    if (isAuthenticated && pkpInfo?.ethAddress) {
      loadScrobbles();
    }
  }, [isAuthenticated, pkpInfo?.ethAddress, loadScrobbles]);

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
        <View style={[styles.authHeader, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.authHeaderTitle}>Profile</Text>
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
              onRefresh={() => { refresh(); loadScrobbles(); }}
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
            nationalityCode={profile?.nationalityCode}
            followerCount={profile?.followerCount}
            followingCount={profile?.followingCount}
            url={profile?.url}
            twitter={profile?.twitter}
            github={profile?.github}
            telegram={profile?.telegram}
            isOwnProfile={true}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBackPress={() => navigation.goBack()}
            onEditPress={() => navigation.navigate('EditProfile')}
          />

          {activeTab === 'about' && profile ? <ProfileAbout profile={profile} /> : null}
          {activeTab === 'timeline' ? (
            <View style={styles.tabPlaceholder}>
              <Text style={styles.tabPlaceholderText}>Timeline coming soon</Text>
            </View>
          ) : null}
          {activeTab === 'music' ? (
            <ProfileMusicTab
              scrobbles={scrobbles}
              loading={scrobblesLoading}
              onArtistPress={(artist) => navigation.navigate('Artist' as any, { name: artist })}
              onTrackPress={(trackId) => console.log('[Profile] track press:', trackId)}
            />
          ) : null}
          {activeTab === 'schedule' ? (
            <View style={styles.tabPlaceholder}>
              <Text style={styles.tabPlaceholderText}>Schedule coming soon</Text>
            </View>
          ) : null}
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
  scrollContent: {
    paddingBottom: 140,
  },
  authHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  authHeaderTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
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
  tabPlaceholder: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  tabPlaceholderText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
