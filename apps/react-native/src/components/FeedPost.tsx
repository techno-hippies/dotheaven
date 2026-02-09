import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { Avatar } from '../ui';
import { EngagementBar } from './EngagementBar';

interface FeedPostProps {
  authorName: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  authorNationalityCode?: string;
  timestamp: string;
  text?: string;
  photoUrl?: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  isLiked?: boolean;
  isReposted?: boolean;
  needsTranslation?: boolean;
  onTranslate?: () => void;
  isTranslating?: boolean;
}

export const FeedPost: React.FC<FeedPostProps> = ({
  authorName,
  authorHandle,
  authorAvatarUrl,
  authorNationalityCode,
  timestamp,
  text,
  photoUrl,
  likes = 0,
  comments = 0,
  reposts = 0,
  isLiked,
  isReposted,
  needsTranslation,
  onTranslate,
  isTranslating,
}) => {
  return (
    <View style={styles.container}>
      {/* Left: avatar */}
      <Avatar
        src={authorAvatarUrl}
        size="sm"
        nationalityCode={authorNationalityCode}
      />

      {/* Right: content column */}
      <View style={styles.content}>
        {/* Header: handle · timestamp */}
        <View style={styles.headerRow}>
          <Text style={styles.handle} numberOfLines={1}>
            {authorHandle || authorName}
          </Text>
          <View style={styles.headerSpacer} />
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>

        {/* Text */}
        {text ? (
          <Text style={styles.text} selectable>{text}</Text>
        ) : null}

        {/* Photo */}
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : null}

        {/* Engagement bar */}
        <EngagementBar
          comments={comments}
          likes={likes}
          reposts={reposts}
          isLiked={isLiked}
          isReposted={isReposted}
          needsTranslation={needsTranslation}
          onTranslate={onTranslate}
          isTranslating={isTranslating}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  handle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  headerSpacer: {
    flex: 1,
  },
  timestamp: {
    fontSize: 15,
    color: colors.textMuted,
    flexShrink: 0,
  },
  text: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
    marginTop: 2,
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: colors.bgElevated,
  },
});
