import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useLitBridge } from '../providers/LitProvider';
import { colors, fontSize } from '../lib/theme';
import { Spinner } from '../ui';
import { ProfileHeader, type ProfileTab } from '../components/ProfileHeader';
import { ProfileAbout } from '../components/ProfileAbout';
import { useProfile } from '../hooks/useProfile';
import { getFollowState, toggleFollow } from '../lib/follow';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicProfile'>;

export const PublicProfileScreen: React.FC<Props> = ({ navigation, route }) => {
  const { address } = route.params;
  const { isAuthenticated, pkpInfo, signMessage } = useAuth();
  const { bridge } = useLitBridge();

  const { profile, profileLoading, refreshing, refresh } = useProfile({
    enabled: true,
    address,
  });

  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('timeline');

  // Check follow state on mount
  useEffect(() => {
    if (!isAuthenticated || !pkpInfo?.ethAddress) return;
    getFollowState(
      pkpInfo.ethAddress as `0x${string}`,
      address as `0x${string}`,
    )
      .then(setIsFollowing)
      .catch(() => {});
  }, [isAuthenticated, pkpInfo?.ethAddress, address]);

  const handleFollow = useCallback(async () => {
    if (!isAuthenticated || !pkpInfo?.pubkey || !bridge) {
      Alert.alert('Sign in', 'Sign in to follow users.');
      return;
    }
    const action = isFollowing ? 'unfollow' : 'follow';
    setFollowLoading(true);
    // Optimistic update
    setIsFollowing(!isFollowing);
    try {
      const result = await toggleFollow(address, action, signMessage, bridge, pkpInfo.pubkey);
      if (!result.success) {
        // Revert
        setIsFollowing(isFollowing);
        Alert.alert('Error', result.error || 'Follow failed');
      }
    } catch (err: any) {
      setIsFollowing(isFollowing);
      Alert.alert('Error', err.message || 'Follow failed');
    } finally {
      setFollowLoading(false);
    }
  }, [isAuthenticated, pkpInfo, bridge, signMessage, address, isFollowing]);

  const handleMessage = useCallback(() => {
    Alert.alert('Message', 'Coming soon');
  }, []);

  const handleMore = useCallback(() => {
    Alert.alert('More', 'Coming soon');
  }, []);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Check if viewing own profile
  const isOwnProfile =
    isAuthenticated &&
    pkpInfo?.ethAddress?.toLowerCase() === address.toLowerCase();

  return (
    <View style={styles.container}>
      {profileLoading && !profile ? (
        <View style={[styles.container, styles.centered]}>
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
            nationalityCode={profile?.nationalityCode}
            followerCount={profile?.followerCount}
            followingCount={profile?.followingCount}
            url={profile?.url}
            twitter={profile?.twitter}
            github={profile?.github}
            telegram={profile?.telegram}
            isOwnProfile={isOwnProfile}
            isFollowing={isFollowing}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onFollowPress={handleFollow}
            onMessagePress={handleMessage}
            onMorePress={handleMore}
            onBackPress={handleBack}
            onEditPress={() => navigation.navigate('EditProfile')}
          />

          {activeTab === 'about' && profile ? <ProfileAbout profile={profile} /> : null}
          {activeTab === 'timeline' ? (
            <View style={styles.tabPlaceholder}>
              <Text style={styles.tabPlaceholderText}>Timeline coming soon</Text>
            </View>
          ) : null}
          {activeTab === 'music' ? (
            <View style={styles.tabPlaceholder}>
              <Text style={styles.tabPlaceholderText}>Music coming soon</Text>
            </View>
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
  tabPlaceholder: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  tabPlaceholderText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
