import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { User } from 'phosphor-react-native';
import { colors, radii } from '../lib/theme';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_MAP: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
  '2xl': 80,
};

const ICON_SIZE_MAP: Record<AvatarSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 40,
};

const BADGE_SIZE_MAP: Record<AvatarSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
};

const BADGE_FONT_MAP: Record<AvatarSize, number> = {
  sm: 8,
  md: 9,
  lg: 10,
  xl: 13,
  '2xl': 16,
};

/** Convert ISO 3166-1 alpha-2 code to emoji flag via regional indicator symbols. */
function countryCodeToEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return '';
  const offset = 0x1f1e6 - 65; // 'A' = 65
  return String.fromCodePoint(upper.charCodeAt(0) + offset, upper.charCodeAt(1) + offset);
}

export interface AvatarProps {
  /** Image URI */
  src?: string;
  /** Avatar size — sm=32, md=40, lg=48, xl=64, 2xl=80. Default: md */
  size?: AvatarSize;
  /** ISO 3166-1 alpha-2 country code for flag badge */
  nationalityCode?: string;
  /** Custom fallback icon (defaults to User) */
  fallbackIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  size = 'md',
  nationalityCode,
  fallbackIcon,
  style,
}) => {
  const dim = SIZE_MAP[size];
  const iconSize = ICON_SIZE_MAP[size];
  const badgeSize = BADGE_SIZE_MAP[size];
  const badgeFont = BADGE_FONT_MAP[size];
  const borderRadius = dim / 2;

  return (
    <View style={[{ width: dim, height: dim }, style]}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={[styles.image, { width: dim, height: dim, borderRadius }]}
        />
      ) : (
        <View style={[styles.fallback, { width: dim, height: dim, borderRadius }]}>
          {fallbackIcon ?? <User size={iconSize} color={colors.textMuted} />}
        </View>
      )}

      {nationalityCode ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
            },
          ]}
        >
          <Text style={{ fontSize: badgeFont, lineHeight: badgeSize }} allowFontScaling={false}>
            {countryCodeToEmoji(nationalityCode)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgPage,
    overflow: 'hidden',
  },
});
