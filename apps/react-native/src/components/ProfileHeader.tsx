import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapPin } from 'phosphor-react-native';
import { colors, fontSize } from '../lib/theme';
import { Avatar } from '../ui';
import { formatCount } from '../lib/posts';

export interface ProfileHeaderProps {
  avatarUrl?: string;
  name: string;
  handle?: string;
  bio?: string;
  location?: string;
  followerCount?: number;
  followingCount?: number;
  nationalityCode?: string;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  avatarUrl,
  name,
  handle,
  bio,
  location,
  followerCount = 0,
  followingCount = 0,
  nationalityCode,
  onFollowersPress,
  onFollowingPress,
}) => {
  return (
    <View style={styles.container}>
      <Avatar
        src={avatarUrl}
        size="2xl"
        nationalityCode={nationalityCode}
      />

      <Text style={styles.name}>{name}</Text>

      {handle ? (
        <Text style={styles.handle}>@{handle}</Text>
      ) : null}

      {bio ? (
        <Text style={styles.bio} numberOfLines={3}>
          {bio}
        </Text>
      ) : null}

      {location ? (
        <View style={styles.locationRow}>
          <MapPin size={14} color={colors.textMuted} />
          <Text style={styles.locationText} numberOfLines={1}>
            {location}
          </Text>
        </View>
      ) : null}

      {/* Follow stats */}
      <View style={styles.statsRow}>
        <TouchableOpacity
          onPress={onFollowersPress}
          disabled={!onFollowersPress}
          activeOpacity={0.7}
        >
          <Text style={styles.statText}>
            <Text style={styles.statValue}>{formatCount(followerCount)}</Text>
            {' followers'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.statDot}>&middot;</Text>

        <TouchableOpacity
          onPress={onFollowingPress}
          disabled={!onFollowingPress}
          activeOpacity={0.7}
        >
          <Text style={styles.statText}>
            <Text style={styles.statValue}>{formatCount(followingCount)}</Text>
            {' following'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 6,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 12,
  },
  handle: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  bio: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  statText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  statValue: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statDot: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
