import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CaretLeft,
  Globe,
  MusicNote,
  SpotifyLogo,
  SoundcloudLogo,
  InstagramLogo,
  FacebookLogo,
  XLogo,
} from 'phosphor-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { colors, fontSize, radii } from '../lib/theme';
import { IconButton } from '../ui/IconButton';
import {
  type ArtistPageData,
  type DisplayTrack,
  fetchArtistPageData,
  fetchArtistPageDataByName,
  artistTracksToDisplayTracks,
  resolveImageUrl,
  promoteWikimediaThumb,
  buildWikimediaImageCandidates,
} from '../lib/artist';

type Props = NativeStackScreenProps<RootStackParamList, 'Artist'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 320;

// ── Link helpers ────────────────────────────────────────────────────

const LINK_CONFIG: Record<
  string,
  { icon: React.ComponentType<any>; label: string }
> = {
  spotify: { icon: SpotifyLogo, label: 'Spotify' },
  soundcloud: { icon: SoundcloudLogo, label: 'SoundCloud' },
  twitter: { icon: XLogo, label: 'X/Twitter' },
  instagram: { icon: InstagramLogo, label: 'Instagram' },
  facebook: { icon: FacebookLogo, label: 'Facebook' },
  website: { icon: Globe, label: 'Website' },
};

// ── Track row ───────────────────────────────────────────────────────

const ArtistTrackRow: React.FC<{ track: DisplayTrack; index: number }> =
  React.memo(({ track, index }) => {
    const [imgFailed, setImgFailed] = useState(false);

    return (
      <View style={styles.trackRow}>
        <Text style={styles.trackIndex}>{index + 1}</Text>
        <View style={styles.trackCover}>
          {track.albumCover && !imgFailed ? (
            <Image
              source={{ uri: track.albumCover }}
              style={styles.trackCoverImage}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <MusicNote size={20} color={colors.textMuted} weight="regular" />
          )}
        </View>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.trackMeta} numberOfLines={1}>
            {track.scrobbleCount > 0
              ? `${track.scrobbleCount.toLocaleString()} plays`
              : 'No plays'}
            {track.duration !== '--:--' ? ` · ${track.duration}` : ''}
          </Text>
        </View>
      </View>
    );
  });

// ── Main screen ─────────────────────────────────────────────────────

export const ArtistScreen: React.FC<Props> = ({ navigation, route }) => {
  const { mbid, artistName } = route.params;
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<ArtistPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [heroImageCandidates, setHeroImageCandidates] = useState<string[]>([]);

  // Fetch artist data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let result: ArtistPageData | null;
        if (mbid) {
          result = await fetchArtistPageData(mbid);
        } else if (artistName) {
          result = await fetchArtistPageDataByName(artistName);
        } else {
          throw new Error('No artist identifier provided');
        }

        if (cancelled) return;
        if (!result) {
          setError('Artist not found');
          setLoading(false);
          return;
        }

        setData(result);

        // Resolve hero image
        console.log('[ArtistScreen] links:', JSON.stringify(result.info.links));
        if (result.info.links.image) {
          const promoted = promoteWikimediaThumb(result.info.links.image, 1600);
          console.log('[ArtistScreen] image original:', result.info.links.image);
          console.log('[ArtistScreen] image promoted:', promoted);
          const rehosted = await resolveImageUrl(promoted);
          console.log('[ArtistScreen] image rehosted:', rehosted);
          if (!cancelled) {
            const candidates = buildWikimediaImageCandidates(
              rehosted ?? promoted,
            );
            console.log('[ArtistScreen] image candidates:', candidates);
            setHeroImageCandidates(candidates);
            setHeroImageUrl(candidates[0]);
            setHeroImageIndex(0);
          }
        } else {
          console.log('[ArtistScreen] no image link in artist info');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load artist');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [mbid, artistName]);

  const tracks = data ? artistTracksToDisplayTracks(data.tracks) : [];

  const linkEntries = data
    ? Object.entries(data.info.links).filter(([key]) => key in LINK_CONFIG)
    : [];

  const handleHeroError = useCallback(() => {
    console.log('[ArtistScreen] hero image failed:', heroImageCandidates[heroImageIndex], `(${heroImageIndex + 1}/${heroImageCandidates.length})`);
    const next = heroImageIndex + 1;
    if (next < heroImageCandidates.length) {
      console.log('[ArtistScreen] trying next candidate:', heroImageCandidates[next]);
      setHeroImageIndex(next);
      setHeroImageUrl(heroImageCandidates[next]);
    } else {
      console.log('[ArtistScreen] all candidates exhausted, showing placeholder');
      setHeroImageFailed(true);
    }
  }, [heroImageIndex, heroImageCandidates]);

  const handleLinkPress = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  const renderTrack = useCallback(
    ({ item, index }: { item: DisplayTrack; index: number }) => (
      <ArtistTrackRow track={item} index={index} />
    ),
    [],
  );

  // ── Loading state ──
  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.hero}>
          <View style={styles.heroPlaceholder}>
            <ActivityIndicator size="large" color={colors.accentBlue} />
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(23,23,23,0.85)', colors.bgPage]}
            style={styles.heroGradient}
          />
          <View style={[styles.heroBackButton, { top: insets.top + 8 }]}>
            <IconButton
              variant="ghost"
              size="md"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
            >
              <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
            </IconButton>
          </View>
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <View style={styles.root}>
        <View style={styles.hero}>
          <View style={styles.heroPlaceholder}>
            <Text style={styles.errorText}>{error ?? 'Artist not found'}</Text>
          </View>
          <View style={[styles.heroBackButton, { top: insets.top + 8 }]}>
            <IconButton
              variant="ghost"
              size="md"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
            >
              <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
            </IconButton>
          </View>
        </View>
      </View>
    );
  }

  // ── Header component for FlatList ──
  const ListHeader = (
    <>
      {/* Hero */}
      <View style={styles.hero}>
        {heroImageUrl && !heroImageFailed ? (
          <Image
            source={{ uri: heroImageUrl }}
            style={styles.heroImage}
            onError={handleHeroError}
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <MusicNote size={64} color={colors.textMuted} weight="thin" />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(23,23,23,0.85)', colors.bgPage]}
          style={styles.heroGradient}
        />
        {/* Back button overlaid on hero */}
        <View style={[styles.heroBackButton, { top: insets.top + 8 }]}>
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
          >
            <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
          </IconButton>
        </View>
        {/* Artist name + stats overlaid at bottom */}
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{data.info.name}</Text>
          <Text style={styles.heroStats}>
            {data.uniqueListeners.toLocaleString()} listener
            {data.uniqueListeners !== 1 ? 's' : ''}
            {' · '}
            {data.totalScrobbles.toLocaleString()} scrobble
            {data.totalScrobbles !== 1 ? 's' : ''}
            {data.ranking > 0 && data.totalArtists > 0
              ? ` · #${data.ranking} of ${data.totalArtists}`
              : ''}
          </Text>
        </View>
      </View>

      {/* External links */}
      {linkEntries.length > 0 && (
        <View style={styles.linksRow}>
          {linkEntries.map(([key, url]) => {
            const config = LINK_CONFIG[key];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <TouchableOpacity
                key={key}
                style={styles.linkButton}
                onPress={() => handleLinkPress(url)}
                activeOpacity={0.7}
                accessibilityLabel={config.label}
              >
                <Icon size={22} color={colors.textSecondary} weight="regular" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Section header */}
      {tracks.length > 0 ? (
        <Text style={styles.sectionTitle}>Popular</Text>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No scrobbles found</Text>
          <Text style={styles.emptySubtext}>
            Scrobble tracks by this artist to see them here
          </Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={tracks}
        renderItem={renderTrack}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },

  // Hero
  hero: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT * 0.6,
  },
  heroBackButton: {
    position: 'absolute',
    left: 12,
  },
  heroInfo: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroStats: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Links
  linksRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  linkButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },

  // Track rows — matches TrackItem sizing (48x48 cover, 72px row, 16px text)
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 72,
    gap: 12,
  },
  trackIndex: {
    width: 24,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  trackCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  trackCoverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  trackMeta: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  emptySubtext: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 8,
  },
});
