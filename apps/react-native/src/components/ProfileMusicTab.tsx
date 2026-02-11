/**
 * ProfileMusicTab — Scrobble dashboard for the profile Music tab.
 * Single-column stacked layout. All sections use identical row structure
 * matching the app's standard 72px row pattern (rank + 48x48 cover + text + count).
 */

import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MusicNote } from 'phosphor-react-native';
import { colors, fontSize, spacing } from '../lib/theme';
import { Avatar } from '../ui';
import type { ScrobbleEntry } from '../lib/scrobbles';
import { isValidCid, coverUrl, formatTimeAgo } from '../lib/scrobbles';

// ── Types ─────────────────────────────────────────────────────────

interface TopArtistEntry { artist: string; count: number; coverUrl?: string }
interface TopTrackEntry { title: string; artist: string; count: number; coverUrl?: string; trackId: string }
interface TopAlbumEntry { album: string; artist: string; count: number; coverUrl?: string }

export interface ProfileMusicTabProps {
  scrobbles: ScrobbleEntry[];
  loading?: boolean;
  onArtistPress?: (artist: string) => void;
  onTrackPress?: (trackId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatHours(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  if (h < 1) return `${Math.round(totalSec / 60)}m`;
  return `${h.toLocaleString()}h`;
}

// ── Reusable row sub-components ───────────────────────────────────

/** Album cover with fallback */
const Cover: React.FC<{ uri?: string }> = ({ uri }) =>
  uri ? (
    <Image source={{ uri }} style={styles.cover} />
  ) : (
    <View style={[styles.cover, styles.coverFallback]}>
      <MusicNote size={20} color={colors.textMuted} />
    </View>
  );

// ── Component ─────────────────────────────────────────────────────

export const ProfileMusicTab: React.FC<ProfileMusicTabProps> = ({
  scrobbles,
  loading,
  onArtistPress,
  onTrackPress,
}) => {
  const totalSec = useMemo(() => scrobbles.reduce((sum, s) => sum + (s.durationSec || 0), 0), [scrobbles]);
  const uniqueArtists = useMemo(() => new Set(scrobbles.map((s) => s.artist)).size, [scrobbles]);
  const uniqueTracks = useMemo(() => new Set(scrobbles.map((s) => `${s.title}|||${s.artist}`)).size, [scrobbles]);

  const topArtists = useMemo<TopArtistEntry[]>(() => {
    const map = new Map<string, { count: number; coverUrl?: string }>();
    for (const s of scrobbles) {
      const entry = map.get(s.artist) || { count: 0 };
      entry.count++;
      if (!entry.coverUrl && isValidCid(s.coverCid)) entry.coverUrl = coverUrl(s.coverCid);
      map.set(s.artist, entry);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([a, d]) => ({ artist: a, ...d }));
  }, [scrobbles]);

  const topTracks = useMemo<TopTrackEntry[]>(() => {
    const map = new Map<string, TopTrackEntry>();
    for (const s of scrobbles) {
      const key = `${s.title}|||${s.artist}`;
      const entry = map.get(key) || { title: s.title, artist: s.artist, count: 0, trackId: s.trackId };
      entry.count++;
      if (!entry.coverUrl && isValidCid(s.coverCid)) entry.coverUrl = coverUrl(s.coverCid);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [scrobbles]);

  const topAlbums = useMemo<TopAlbumEntry[]>(() => {
    const map = new Map<string, TopAlbumEntry>();
    for (const s of scrobbles) {
      if (!s.album) continue;
      const key = `${s.album}|||${s.artist}`;
      const entry = map.get(key) || { album: s.album, artist: s.artist, count: 0 };
      entry.count++;
      if (!entry.coverUrl && isValidCid(s.coverCid)) entry.coverUrl = coverUrl(s.coverCid);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [scrobbles]);

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Loading scrobbles...</Text>
      </View>
    );
  }

  if (scrobbles.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MusicNote size={32} color={colors.textMuted} />
        <Text style={styles.emptyText}>No scrobbles yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* KPI Strip — 2x2 grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{scrobbles.length.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>scrobbles</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{formatHours(totalSec)}</Text>
          <Text style={styles.kpiLabel}>listened</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{uniqueArtists.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>artists</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{uniqueTracks.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>tracks</Text>
        </View>
      </View>

      {/* Top Artists — rank + avatar + name + count */}
      {topArtists.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TOP ARTISTS</Text>
          {topArtists.map((entry, i) => (
            <TouchableOpacity
              key={entry.artist}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onArtistPress?.(entry.artist)}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Avatar src={entry.coverUrl} size="lg" />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>{entry.artist}</Text>
              </View>
              <Text style={styles.rowMeta}>{entry.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Top Tracks — rank + cover + title/artist + count */}
      {topTracks.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TOP TRACKS</Text>
          {topTracks.map((track, i) => (
            <TouchableOpacity
              key={`${track.title}|||${track.artist}`}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onTrackPress?.(track.trackId)}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Cover uri={track.coverUrl} />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{track.artist}</Text>
              </View>
              <Text style={styles.rowMeta}>{track.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Top Albums — rank + cover + album/artist + count */}
      {topAlbums.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TOP ALBUMS</Text>
          {topAlbums.map((album, i) => (
            <TouchableOpacity
              key={`${album.album}|||${album.artist}`}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onArtistPress?.(album.artist)}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Cover uri={album.coverUrl} />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>{album.album}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{album.artist}</Text>
              </View>
              <Text style={styles.rowMeta}>{album.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Recent Scrobbles — rank + cover + title/artist + timestamp */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECENT</Text>
        {scrobbles.slice(0, 10).map((scrobble, i) => {
          const cover = isValidCid(scrobble.coverCid) ? coverUrl(scrobble.coverCid) : undefined;
          return (
            <TouchableOpacity
              key={scrobble.id}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onTrackPress?.(scrobble.trackId)}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Cover uri={cover} />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>{scrobble.title}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{scrobble.artist}</Text>
              </View>
              <Text style={styles.rowMeta}>{formatTimeAgo(scrobble.playedAt)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────

const ROW_HEIGHT = spacing.trackRowHeight; // 72

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // KPI — 2x2 grid via flexWrap
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    width: '47%',
    backgroundColor: colors.bgSurface,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  kpiLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Sections
  section: {},
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },

  // Standard row — matches TrackItem / ArtistTrackRow pattern
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rank: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    width: 24,
    textAlign: 'center',
  },
  cover: {
    width: spacing.albumCoverSm, // 48
    height: spacing.albumCoverSm,
    borderRadius: 8,
    flexShrink: 0,
    overflow: 'hidden',
  },
  coverFallback: {
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 1,
  },
  rowMeta: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    flexShrink: 0,
  },
});
