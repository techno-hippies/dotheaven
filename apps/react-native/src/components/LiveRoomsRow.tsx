import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Plus } from 'phosphor-react-native';
import { Avatar } from '../ui/Avatar';
import { colors, fontSize, radii } from '../lib/theme';

export interface LiveRoom {
  id: string;
  hostName: string;
  hostAvatarUrl?: string;
  participantCount: number;
  coverUrl?: string;
}

interface LiveRoomsRowProps {
  rooms: LiveRoom[];
  onRoomPress?: (roomId: string) => void;
  onCreateRoom?: () => void;
  createAvatarUrl?: string;
}

const CARD_W = 120;
const CARD_H = 180;

export const LiveRoomsRow: React.FC<LiveRoomsRowProps> = ({
  rooms,
  onRoomPress,
  onCreateRoom,
  createAvatarUrl,
}) => {
  if (rooms.length === 0 && !onCreateRoom) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {/* Create room card */}
      {onCreateRoom && (
        <TouchableOpacity
          style={[styles.card, styles.createCard]}
          activeOpacity={0.7}
          onPress={onCreateRoom}
        >
          {createAvatarUrl && (
            <Image
              source={{ uri: createAvatarUrl }}
              style={styles.createBgAvatar}
              blurRadius={4}
            />
          )}
          <View style={styles.createIconWrap}>
            <Plus size={20} color="#fff" weight="bold" />
          </View>
          <View style={styles.bottomLabel}>
            <Text style={styles.hostName}>Your room</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Room cards */}
      {rooms.slice(0, 5).map((room) => (
        <TouchableOpacity
          key={room.id}
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => onRoomPress?.(room.id)}
        >
          {room.coverUrl ? (
            <>
              <Image source={{ uri: room.coverUrl }} style={styles.coverImage} />
              <View style={styles.darkOverlay} />
            </>
          ) : (
            <View style={styles.gradientFallback} />
          )}

          {/* Host avatar — top left */}
          <View style={styles.hostAvatar}>
            <Avatar src={room.hostAvatarUrl} size="sm" />
          </View>

          {/* Bottom info */}
          <View style={styles.bottomInfo}>
            <Text style={styles.hostName} numberOfLines={1}>
              {room.hostName}
            </Text>
            <Text style={styles.participantCount}>{room.participantCount}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  createCard: {
    backgroundColor: colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBgAvatar: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
    resizeMode: 'cover',
  },
  createIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  gradientFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bgElevated,
  },
  hostAvatar: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  bottomLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  hostName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
  participantCount: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
  },
});
