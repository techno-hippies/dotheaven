import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ChatCircle,
  ArrowsClockwise,
  Heart,
  Globe,
  UploadSimple,
} from 'phosphor-react-native';
import { colors, fontSize } from '../lib/theme';
import { formatCount } from '../lib/posts';

export interface EngagementBarProps {
  comments?: number;
  onComment?: () => void;
  reposts?: number;
  isReposted?: boolean;
  onRepost?: () => void;
  likes?: number;
  isLiked?: boolean;
  onLike?: () => void;
  onShare?: () => void;
  needsTranslation?: boolean;
  onTranslate?: () => void;
  isTranslating?: boolean;
  compact?: boolean;
}

export const EngagementBar: React.FC<EngagementBarProps> = ({
  comments = 0,
  onComment,
  reposts = 0,
  isReposted,
  onRepost,
  likes = 0,
  isLiked,
  onLike,
  onShare,
  needsTranslation,
  onTranslate,
  isTranslating,
  compact,
}) => {
  const iconSize = compact ? 16 : 18;

  return (
    <View style={styles.bar}>
      {/* Comment */}
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={onComment}
        disabled={!onComment}
      >
        <ChatCircle size={iconSize} color={colors.textMuted} />
        {comments > 0 ? (
          <Text style={styles.count}>{formatCount(comments)}</Text>
        ) : null}
      </TouchableOpacity>

      {/* Repost */}
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={onRepost}
        disabled={!onRepost}
      >
        <ArrowsClockwise
          size={iconSize}
          color={isReposted ? '#a6e3a1' : colors.textMuted}
        />
        {reposts > 0 ? (
          <Text style={[styles.count, isReposted && styles.repostedCount]}>
            {formatCount(reposts)}
          </Text>
        ) : null}
      </TouchableOpacity>

      {/* Like */}
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={onLike}
        disabled={!onLike}
      >
        <Heart
          size={iconSize}
          color={isLiked ? '#f38ba8' : colors.textMuted}
          weight={isLiked ? 'fill' : 'regular'}
        />
        {likes > 0 ? (
          <Text style={[styles.count, isLiked && styles.likedCount]}>
            {formatCount(likes)}
          </Text>
        ) : null}
      </TouchableOpacity>

      {/* Translate */}
      {needsTranslation ? (
        <TouchableOpacity
          style={styles.item}
          activeOpacity={0.7}
          onPress={onTranslate}
          disabled={isTranslating || !onTranslate}
        >
          {isTranslating ? (
            <ActivityIndicator size={iconSize} color={colors.accentBlue} />
          ) : (
            <Globe size={iconSize} color={colors.accentBlue} />
          )}
        </TouchableOpacity>
      ) : null}

      {/* Share */}
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={onShare}
        disabled={!onShare}
      >
        <UploadSimple size={iconSize} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginLeft: -8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  count: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  likedCount: {
    color: '#f38ba8',
  },
  repostedCount: {
    color: '#a6e3a1',
  },
});
