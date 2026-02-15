import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  uri: string;
  filename: string;
  artworkUri?: string;
  artworkFallbackUri?: string;
  // Optional cloud-content metadata for encrypted playback.
  contentId?: string;
  pieceCid?: string;
  datasetOwner?: string;
  algo?: number;
}

const PERMISSION_TIMEOUT_MS = 10000;
const PAGE_TIMEOUT_MS = 15000;
const MAX_SCAN_PAGES = 500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

type MediaPermissions = {
  audioGranted: boolean;
  artworkGranted: boolean;
};

/**
 * Request media permissions through expo-media-library.
 * Audio is required for scanning; photo permission is optional and used for album art URIs.
 */
async function requestMediaPermissions(): Promise<MediaPermissions> {
  if (Platform.OS === 'android') {
    const currentAudio = await withTimeout(
      MediaLibrary.getPermissionsAsync(false, ['audio']),
      PERMISSION_TIMEOUT_MS,
      'Media permission check',
    );
    let audioGranted = currentAudio.granted;
    if (!audioGranted) {
      const requestedAudio = await withTimeout(
        MediaLibrary.requestPermissionsAsync(false, ['audio']),
        PERMISSION_TIMEOUT_MS,
        'Media permission request',
      );
      audioGranted = requestedAudio.granted;
    }

    if (!audioGranted) {
      return { audioGranted: false, artworkGranted: false };
    }

    const currentArtwork = await withTimeout(
      MediaLibrary.getPermissionsAsync(false, ['audio', 'photo']),
      PERMISSION_TIMEOUT_MS,
      'Artwork permission check',
    );

    let artworkGranted = currentArtwork.granted;
    if (!artworkGranted && currentArtwork.canAskAgain) {
      const requestedArtwork = await withTimeout(
        MediaLibrary.requestPermissionsAsync(false, ['audio', 'photo']),
        PERMISSION_TIMEOUT_MS,
        'Artwork permission request',
      );
      artworkGranted = requestedArtwork.granted;
    }

    return { audioGranted: true, artworkGranted };
  }

  const current = await withTimeout(
    MediaLibrary.getPermissionsAsync(),
    PERMISSION_TIMEOUT_MS,
    'Media permission check',
  );
  if (current.granted) {
    return { audioGranted: true, artworkGranted: true };
  }
  const requested = await withTimeout(
    MediaLibrary.requestPermissionsAsync(),
    PERMISSION_TIMEOUT_MS,
    'Media permission request',
  );
  return {
    audioGranted: requested.granted,
    artworkGranted: requested.granted,
  };
}

function buildArtworkUris(
  asset: MediaLibrary.Asset,
  artworkGranted: boolean,
): { artworkUri?: string; artworkFallbackUri?: string } {
  if (Platform.OS !== 'android' || !artworkGranted) {
    return {};
  }

  const fallback = `content://media/external/audio/media/${asset.id}/albumart`;
  if (!asset.albumId) {
    return { artworkUri: fallback };
  }

  const primary = `content://media/external/audio/albumart/${asset.albumId}`;
  if (primary === fallback) {
    return { artworkUri: primary };
  }

  return { artworkUri: primary, artworkFallbackUri: fallback };
}

/**
 * Scan device media library for audio files.
 */
export async function scanMediaLibrary(): Promise<MusicTrack[]> {
  console.log('[music-scanner] starting scanMediaLibrary');
  const permissions = await requestMediaPermissions();
  console.log(
    '[music-scanner] permissions:',
    `audio=${permissions.audioGranted}`,
    `artwork=${permissions.artworkGranted}`,
  );
  if (!permissions.audioGranted) {
    throw new Error('Media library permission denied');
  }

  const tracks: MusicTrack[] = [];
  let hasMore = true;
  let after: string | undefined;
  let page = 0;
  const seenCursors = new Set<string | undefined>();

  while (hasMore) {
    if (seenCursors.has(after)) {
      console.warn('[music-scanner] duplicate cursor detected, stopping to avoid infinite loop');
      break;
    }
    seenCursors.add(after);
    page++;
    const result = await withTimeout(
      MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 100,
        after,
        sortBy: [MediaLibrary.SortBy.default],
      }),
      PAGE_TIMEOUT_MS,
      `Media page ${page} fetch`,
    );

    for (const asset of result.assets) {
      const { artworkUri, artworkFallbackUri } = buildArtworkUris(asset, permissions.artworkGranted);

      tracks.push({
        id: asset.id,
        title: extractTitle(asset.filename),
        artist: 'Unknown Artist',
        album: '',
        duration: asset.duration,
        uri: asset.uri,
        filename: asset.filename,
        artworkUri,
        artworkFallbackUri,
      });
    }

    const nextCursor = result.endCursor ?? undefined;
    if (result.hasNextPage && nextCursor === after) {
      console.warn('[music-scanner] unchanged cursor with hasNextPage=true, stopping loop');
      break;
    }

    hasMore = result.hasNextPage;
    after = nextCursor;

    if (page >= MAX_SCAN_PAGES) {
      console.warn('[music-scanner] max pages reached, stopping scan');
      break;
    }
  }

  console.log('[music-scanner] done, total tracks:', tracks.length);
  return tracks;
}

/**
 * Pick audio files manually via document picker.
 */
export async function pickMusicFiles(): Promise<MusicTrack[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets) return [];

  return result.assets.map((asset, i) => ({
    id: `picked-${Date.now()}-${i}`,
    title: extractTitle(asset.name),
    artist: 'Unknown Artist',
    album: '',
    duration: 0,
    uri: asset.uri,
    filename: asset.name,
  }));
}

function extractTitle(filename: string): string {
  // Remove extension
  const name = filename.replace(/\.[^.]+$/, '');

  // Try "Artist - Title" pattern
  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 0) {
    return name.slice(dashIdx + 3).trim();
  }

  // Try "NN. Title" pattern (track number)
  const numbered = name.match(/^\d+\.?\s+(.+)/);
  if (numbered) return numbered[1].trim();

  return name.trim();
}

/**
 * Try to extract artist from filename pattern "Artist - Title".
 */
export function extractArtistFromFilename(filename: string): string {
  const name = filename.replace(/\.[^.]+$/, '');
  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 0) {
    return name.slice(0, dashIdx).trim();
  }
  return 'Unknown Artist';
}

// ── Local library track resolution ──────────────────────────────────

const TRACKS_STORAGE_KEY = 'heaven:music-tracks';

/**
 * Load cached library tracks from AsyncStorage.
 */
export async function getCachedLibraryTracks(): Promise<MusicTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(TRACKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Find a local library track matching by artist + title (case-insensitive).
 * Returns the full MusicTrack (with valid uri) or null.
 */
export function findLocalMatch(
  library: MusicTrack[],
  artist: string,
  title: string,
): MusicTrack | null {
  const a = artist.toLowerCase();
  const t = title.toLowerCase();
  return library.find(
    (track) =>
      track.uri &&
      track.title.toLowerCase() === t &&
      track.artist.toLowerCase() === a,
  ) ?? null;
}
