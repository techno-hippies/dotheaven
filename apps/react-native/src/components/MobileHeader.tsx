import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User } from 'phosphor-react-native';
import { colors } from '../lib/theme';

interface MobileHeaderProps {
  avatarUrl?: string;
  isAuthenticated?: boolean;
  onAvatarPress: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  avatarUrl,
  isAuthenticated,
  onAvatarPress,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Left: avatar button */}
      <TouchableOpacity style={styles.avatarButton} onPress={onAvatarPress} activeOpacity={0.7}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarFallback}>
            <User size={20} color={colors.textMuted} weight={isAuthenticated ? 'fill' : 'regular'} />
          </View>
        )}
      </TouchableOpacity>

      {/* Center: Heaven logo */}
      <Image
        source={require('../../assets/heaven-white-sm.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Right: spacer for balance */}
      <View style={styles.spacer} />
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
  avatarButton: {
    width: 36,
    height: 36,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    height: 28,
    width: 56,
  },
  spacer: {
    width: 36,
  },
});
