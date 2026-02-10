import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, User } from 'phosphor-react-native';
import { colors, fontSize } from '../lib/theme';
import { Avatar } from '../ui';
import { IconButton } from '../ui/IconButton';

interface MobileHeaderProps {
  title: string;
  avatarUrl?: string;
  isAuthenticated?: boolean;
  onAvatarPress?: () => void;
  onBackPress?: () => void;
  rightSlot?: React.ReactNode;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  avatarUrl,
  isAuthenticated,
  onAvatarPress,
  onBackPress,
  rightSlot,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Left: back button or avatar */}
      {onBackPress ? (
        <IconButton variant="ghost" size="md" accessibilityLabel="Back" onPress={onBackPress}>
          <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
        </IconButton>
      ) : (
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.7}>
          <Avatar
            src={avatarUrl}
            size="sm"
            fallbackIcon={
              <User
                size={20}
                color={colors.textMuted}
                weight={isAuthenticated ? 'fill' : 'regular'}
              />
            }
          />
        </TouchableOpacity>
      )}

      {/* Center: page title */}
      <Text style={styles.title}>{title}</Text>

      {/* Right: slot or spacer for balance */}
      {rightSlot ?? <View style={styles.spacer} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    minHeight: 56,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  spacer: {
    width: 32,
  },
});
