import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { User } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import { CountryFlag } from './CountryFlag';

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

/** Flag SVG size relative to badge container */
const FLAG_SIZE_MAP: Record<AvatarSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
};

export interface AvatarProps {
  /** Image URI */
  src?: string;
  /** Avatar size — sm=32, md=40, lg=48, xl=64, 2xl=80. Default: md */
  size?: AvatarSize;
  /** ISO 3166-1 alpha-2 country code for flag badge */
  nationalityCode?: string;
  /** Custom fallback icon (defaults to User) */
  fallbackIcon?: React.ReactNode;
  /** Border width applied to the image/fallback circle (not the outer container) */
  borderWidth?: number;
  /** Border color applied to the image/fallback circle */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  size = 'md',
  nationalityCode,
  fallbackIcon,
  borderWidth: bw,
  borderColor: bc,
  style,
}) => {
  const dim = SIZE_MAP[size];
  const iconSize = ICON_SIZE_MAP[size];
  const badgeSize = BADGE_SIZE_MAP[size];
  const flagSize = FLAG_SIZE_MAP[size];
  const borderRadius = dim / 2;


  const borderStyle = bw ? { borderWidth: bw, borderColor: bc ?? colors.bgPage } : undefined;

  return (
    <View style={[{ width: dim, height: dim, overflow: 'visible' }, style]}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={[styles.image, { width: dim, height: dim, borderRadius }, borderStyle]}
        />
      ) : (
        <View style={[styles.fallback, { width: dim, height: dim, borderRadius }, borderStyle]}>
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
          <CountryFlag code={nationalityCode} size={flagSize} />
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
