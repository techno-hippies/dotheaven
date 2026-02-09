import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Gear, SignOut, SignIn, Key } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import { Avatar, Button } from '../ui';

const DRAWER_WIDTH = Math.min(280, Dimensions.get('window').width * 0.85);

interface SideMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated?: boolean;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  onProfile?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  onSignUp?: () => void;
  onSignIn?: () => void;
}

export const SideMenuDrawer: React.FC<SideMenuDrawerProps> = ({
  open,
  onClose,
  isAuthenticated,
  displayName,
  username,
  avatarUrl,
  onProfile,
  onSettings,
  onLogout,
  onSignUp,
  onSignIn,
}) => {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [open]);

  const handleNav = (cb?: (() => void) | (() => Promise<void>)) => {
    onClose();
    // Run callback after drawer closes — errors are handled by the callback itself
    if (cb) {
      Promise.resolve(cb()).catch((err) => {
        console.error('[SideMenuDrawer] Callback error:', err);
      });
    }
  };

  if (!open) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Overlay */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {/* Logo header */}
        <View style={styles.logoRow}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoIcon}
          />
          <Text style={styles.logoText}>heaven</Text>
        </View>

        {/* User info */}
        {isAuthenticated && displayName ? (
          <View style={styles.userRow}>
            <Avatar src={avatarUrl} size="sm" />
            <View style={styles.userInfo}>
              <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
              {username ? (
                <Text style={styles.username} numberOfLines={1}>{username}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Nav items */}
        <View style={styles.nav}>
          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onPress={() => handleNav(onProfile)}
              style={styles.navButton}
              contentStyle={styles.navButtonContent}
              textStyle={styles.navButtonText}
              leftIcon={<User size={20} color={colors.textSecondary} />}
            >
              Profile
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => handleNav(onSettings)}
            style={styles.navButton}
            contentStyle={styles.navButtonContent}
            textStyle={styles.navButtonText}
            leftIcon={<Gear size={20} color={colors.textSecondary} />}
          >
            Settings
          </Button>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onPress={() => handleNav(onLogout)}
              style={styles.navButton}
              contentStyle={styles.navButtonContent}
              textStyle={styles.logoutText}
              leftIcon={<SignOut size={20} color={colors.accentCoral} />}
            >
              Log Out
            </Button>
          ) : (
            <View style={styles.authButtons}>
              <Button
                variant="default"
                size="md"
                fullWidth
                onPress={() => handleNav(onSignUp)}
                leftIcon={<Key size={18} color={colors.white} weight="fill" />}
              >
                Sign Up
              </Button>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onPress={() => handleNav(onSignIn)}
                leftIcon={<SignIn size={18} color={colors.textPrimary} />}
              >
                Log In
              </Button>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: 16,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  username: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  nav: {
    paddingTop: 16,
    gap: 4,
  },
  navButton: {
    borderRadius: 10,
  },
  navButtonContent: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  navButtonText: {
    fontWeight: '500',
    fontSize: 16,
    color: colors.textSecondary,
  },
  logoutText: {
    fontWeight: '500',
    fontSize: 16,
    color: colors.accentCoral,
  },
  footer: {
    marginTop: 'auto',
    gap: 4,
  },
  authButtons: {
    gap: 10,
  },
});
