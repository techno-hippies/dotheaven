import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MapPin } from 'phosphor-react-native';
import { colors, radii, fontSize } from '../lib/theme';
import { Avatar } from '../ui';

export interface CommunityCardProps {
  name: string;
  avatarUrl?: string;
  nationalityCode?: string;
  age?: number;
  gender?: string;
  location?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const CommunityCard: React.FC<CommunityCardProps> = ({
  name,
  avatarUrl,
  nationalityCode,
  age,
  gender,
  location,
  onPress,
  style,
}) => {
  // Build age/gender tag (e.g. "24 M", "F", "30")
  const ageGender = [age, gender].filter(Boolean).join(' ');

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
    >
      <Avatar src={avatarUrl} size="xl" nationalityCode={nationalityCode} />

      <View style={styles.info}>
        {/* Name row */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {ageGender ? (
            <Text style={styles.ageGender} numberOfLines={1}>
              {ageGender}
            </Text>
          ) : null}
        </View>

        {/* Location row */}
        {location ? (
          <View style={styles.locationRow}>
            <MapPin size={16} color={colors.textMuted} />
            <Text style={styles.location} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.bgSurface,
    borderRadius: radii.md,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  ageGender: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textMuted,
    flexShrink: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    flex: 1,
  },
});
