import React, { useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDots,
  CaretLeft,
  ChatCircle,
  DotsThreeOutline,
  GithubLogo,
  GlobeSimple,
  Info,
  MusicNote,
  Newspaper,
  PencilSimple,
  TelegramLogo,
  TwitterLogo,
  X,
} from 'phosphor-react-native';
import { colors, fontSize } from '../lib/theme';
import { Avatar, Button, IconButton } from '../ui';
import { formatCount } from '../lib/posts';

export type ProfileTab = 'timeline' | 'about' | 'music' | 'schedule';

export interface ProfileHeaderProps {
  avatarUrl?: string;
  name: string;
  handle?: string;
  bio?: string;
  nationalityCode?: string;
  followerCount?: number;
  followingCount?: number;
  // Links
  url?: string;
  twitter?: string;
  github?: string;
  telegram?: string;
  // Actions
  isOwnProfile?: boolean;
  isFollowing?: boolean;
  onFollowPress?: () => void;
  onMessagePress?: () => void;
  onEditPress?: () => void;
  onMorePress?: () => void;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
  onBackPress?: () => void;
  // Tabs
  activeTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
}

const BANNER_HEIGHT = 140;
const AVATAR_OVERLAP = 48;

const PROFILE_TABS: { id: ProfileTab; icon: (color: string) => React.ReactNode }[] = [
  { id: 'timeline', icon: (c) => <Newspaper size={22} color={c} /> },
  { id: 'about', icon: (c) => <Info size={22} color={c} /> },
  { id: 'music', icon: (c) => <MusicNote size={22} color={c} /> },
  { id: 'schedule', icon: (c) => <CalendarDots size={22} color={c} /> },
];

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  avatarUrl,
  name,
  handle,
  bio,
  nationalityCode,
  followerCount = 0,
  followingCount = 0,
  url,
  twitter,
  github,
  telegram,
  isOwnProfile = true,
  isFollowing = false,
  onFollowPress,
  onMessagePress,
  onEditPress,
  onMorePress,
  onFollowersPress,
  onFollowingPress,
  onBackPress,
  activeTab = 'timeline',
  onTabChange,
}) => {
  const insets = useSafeAreaInsets();
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const hasLinks = !!(url || twitter || github || telegram);

  return (
    <View style={styles.container}>
      {/* Banner with overlaid back button */}
      <View style={[styles.banner, { paddingTop: insets.top }]}>
        {onBackPress ? (
          <View style={styles.backRow}>
            <IconButton variant="ghost" size="md" accessibilityLabel="Back" onPress={onBackPress}>
              <CaretLeft size={20} color="#fff" weight="bold" />
            </IconButton>
          </View>
        ) : null}
      </View>

      {/* Content below banner */}
      <View style={styles.content}>
        {/* Avatar — overlapping banner */}
        <TouchableOpacity
          style={styles.avatarContainer}
          activeOpacity={0.8}
          onPress={avatarUrl ? () => setLightboxOpen(true) : undefined}
          disabled={!avatarUrl}
        >
          <Avatar
            src={avatarUrl}
            size="2xl"
            nationalityCode={nationalityCode}
            borderColor={colors.bgPage}
            borderWidth={3}
          />
        </TouchableOpacity>

        {/* Avatar lightbox */}
        <Modal
          visible={lightboxOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setLightboxOpen(false)}
        >
          <View style={styles.lightbox}>
            <Pressable style={styles.lightboxBg} onPress={() => setLightboxOpen(false)} />
            <Image
              source={{ uri: avatarUrl }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={[styles.lightboxClose, { top: insets.top + 12 }]}
              onPress={() => setLightboxOpen(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={24} color="#fff" weight="bold" />
            </TouchableOpacity>
          </View>
        </Modal>

        {/* Name */}
        <Text style={styles.name}>{name}</Text>

        {/* Handle */}
        {handle ? (
          <Text style={styles.handle}>@{handle}</Text>
        ) : null}

        {/* Bio */}
        {bio ? (
          <Text style={styles.bio}>{bio}</Text>
        ) : null}

        {/* Social links row */}
        {hasLinks ? (
          <View style={styles.linksRow}>
            {url ? (
              <TouchableOpacity
                style={styles.linkItem}
                onPress={() => Linking.openURL(url.startsWith('http') ? url : `https://${url}`).catch(() => {})}
                activeOpacity={0.7}
              >
                <GlobeSimple size={16} color={colors.accentBlue} />
                <Text style={styles.linkTextBlue} numberOfLines={1}>
                  {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {twitter ? (
              <TouchableOpacity
                style={styles.linkItem}
                onPress={() => Linking.openURL(`https://x.com/${twitter}`).catch(() => {})}
                activeOpacity={0.7}
              >
                <TwitterLogo size={16} color={colors.textSecondary} />
                <Text style={styles.linkText} numberOfLines={1}>{twitter}</Text>
              </TouchableOpacity>
            ) : null}
            {github ? (
              <TouchableOpacity
                style={styles.linkItem}
                onPress={() => Linking.openURL(`https://github.com/${github}`).catch(() => {})}
                activeOpacity={0.7}
              >
                <GithubLogo size={16} color={colors.textSecondary} />
                <Text style={styles.linkText} numberOfLines={1}>{github}</Text>
              </TouchableOpacity>
            ) : null}
            {telegram ? (
              <TouchableOpacity
                style={styles.linkItem}
                onPress={() => Linking.openURL(`https://t.me/${telegram}`).catch(() => {})}
                activeOpacity={0.7}
              >
                <TelegramLogo size={16} color={colors.textSecondary} />
                <Text style={styles.linkText} numberOfLines={1}>{telegram}</Text>
              </TouchableOpacity>
            ) : null}
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

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          {isOwnProfile ? (
            <Button
              variant="secondary"
              size="default"
              onPress={onEditPress}
              style={styles.editButton}
              leftIcon={<PencilSimple size={16} color={colors.textPrimary} />}
            >
              Edit Profile
            </Button>
          ) : (
            <>
              <Button
                variant={isFollowing ? 'secondary' : 'default'}
                size="default"
                onPress={onFollowPress}
                style={styles.followButton}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
              <IconButton
                variant="soft"
                size="lg"
                accessibilityLabel="Message"
                onPress={onMessagePress}
              >
                <ChatCircle size={20} color={colors.textSecondary} />
              </IconButton>
              <IconButton
                variant="soft"
                size="lg"
                accessibilityLabel="More"
                onPress={onMorePress}
              >
                <DotsThreeOutline size={20} color={colors.textSecondary} weight="fill" />
              </IconButton>
            </>
          )}
        </View>
      </View>

      {/* Icon tabs */}
      <View style={styles.tabBar}>
        {PROFILE_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabItem}
              onPress={() => onTabChange?.(tab.id)}
              activeOpacity={0.7}
            >
              {tab.icon(active ? colors.textPrimary : colors.textMuted)}
              {active ? <View style={styles.tabIndicator} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgPage,
  },
  banner: {
    height: BANNER_HEIGHT,
    backgroundColor: '#6B5CE7',
  },
  backRow: {
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    overflow: 'visible',
  },
  avatarContainer: {
    marginTop: -AVATAR_OVERLAP,
    marginBottom: 12,
    overflow: 'visible',
    zIndex: 1,
  },
  name: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  handle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  editButton: {
    flex: 1,
  },
  followButton: {
    flex: 1,
  },
  bio: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    lineHeight: 22,
    marginTop: 16,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkTextBlue: {
    fontSize: fontSize.base,
    color: colors.accentBlue,
  },
  linkText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
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
  lightbox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  lightboxImage: {
    width: '90%',
    aspectRatio: 1,
    borderRadius: 12,
  },
  lightboxClose: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: colors.accentBlue,
    borderRadius: 1,
  },
});
