import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  CloudArrowUp,
  Playlist,
  ListPlus,
  Disc,
  User,
} from 'phosphor-react-native';
import { BottomSheet } from '../ui/BottomSheet';
import { colors, fontSize } from '../lib/theme';
import type { MusicTrack } from '../services/music-scanner';

export interface ExtraMenuAction {
  icon: React.ReactNode;
  label: string;
  labelColor?: string;
  onPress: () => void;
}

interface TrackMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  track: MusicTrack | null;
  onUploadToFilecoin?: (track: MusicTrack) => void;
  onAddToPlaylist?: (track: MusicTrack) => void;
  onAddToQueue?: (track: MusicTrack) => void;
  onGoToAlbum?: (track: MusicTrack) => void;
  onGoToArtist?: (track: MusicTrack) => void;
  extraActions?: ExtraMenuAction[];
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  /** Show warning/accent color (e.g. for destructive actions) */
  variant?: 'default' | 'accent';
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onPress, variant = 'default' }) => {
  const textColor = variant === 'accent' ? colors.accentBlue : colors.textPrimary;

  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemIcon}>
        {icon}
      </View>
      <Text style={[styles.menuItemLabel, { color: textColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export const TrackMenuDrawer: React.FC<TrackMenuDrawerProps> = ({
  open,
  onClose,
  track,
  onUploadToFilecoin,
  onAddToPlaylist,
  onAddToQueue,
  onGoToAlbum,
  onGoToArtist,
  extraActions,
}) => {
  if (!track) return null;

  const handleAction = (action?: (track: MusicTrack) => void) => {
    if (action) {
      action(track);
    }
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Track info header */}
      <View style={styles.header}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      {/* Menu items */}
      <View style={styles.menu}>
        {onUploadToFilecoin && !track.pieceCid && (
          <MenuItem
            icon={<CloudArrowUp size={28} color={colors.accentBlue} weight="regular" />}
            label="Upload to Filecoin"
            onPress={() => handleAction(onUploadToFilecoin)}
            variant="accent"
          />
        )}

        {onAddToPlaylist && (
          <MenuItem
            icon={<Playlist size={28} color={colors.textSecondary} weight="regular" />}
            label="Add to Playlist"
            onPress={() => handleAction(onAddToPlaylist)}
          />
        )}

        {onAddToQueue && (
          <MenuItem
            icon={<ListPlus size={28} color={colors.textSecondary} weight="regular" />}
            label="Add to Queue"
            onPress={() => handleAction(onAddToQueue)}
          />
        )}

        {onGoToAlbum && track.album && (
          <MenuItem
            icon={<Disc size={28} color={colors.textSecondary} weight="regular" />}
            label="Go to Album"
            onPress={() => handleAction(onGoToAlbum)}
          />
        )}

        {onGoToArtist && (
          <MenuItem
            icon={<User size={28} color={colors.textSecondary} weight="regular" />}
            label="Go to Artist"
            onPress={() => handleAction(onGoToArtist)}
          />
        )}

        {extraActions?.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={styles.menuItem}
            onPress={() => { action.onPress(); onClose(); }}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemIcon}>{action.icon}</View>
            <Text style={[styles.menuItemLabel, action.labelColor ? { color: action.labelColor } : null]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: 8,
  },
  trackTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  trackArtist: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  menu: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 16,
  },
  menuItemIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
});
