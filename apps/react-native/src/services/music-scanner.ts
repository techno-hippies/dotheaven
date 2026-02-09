import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  uri: string;
  filename: string;
  artworkUri?: string;
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

/**
 * Request audio permission through expo-media-library.
 * This keeps permissions and media queries on the same native module path.
 */
async function requestAudioPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const current = await withTimeout(
      MediaLibrary.getPermissionsAsync(false, ['audio']),
      PERMISSION_TIMEOUT_MS,
      'Media permission check',
    );
    if (current.granted) return true;

    const requested = await withTimeout(
      MediaLibrary.requestPermissionsAsync(false, ['audio']),
      PERMISSION_TIMEOUT_MS,
      'Media permission request',
    );
    return requested.granted;
  }

  const current = await withTimeout(
    MediaLibrary.getPermissionsAsync(),
    PERMISSION_TIMEOUT_MS,
    'Media permission check',
  );
  if (current.granted) return true;
  const requested = await withTimeout(
    MediaLibrary.requestPermissionsAsync(),
    PERMISSION_TIMEOUT_MS,
    'Media permission request',
  );
  return requested.granted;
}

/**
 * Scan device media library for audio files.
 */
export async function scanMediaLibrary(): Promise<MusicTrack[]> {
  console.log('[music-scanner] starting scanMediaLibrary');
  const granted = await requestAudioPermission();
  console.log('[music-scanner] permission granted:', granted);
  if (!granted) {
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
      const artworkUri =
        Platform.OS === 'android' && asset.albumId
          ? `content://media/external/audio/albumart/${asset.albumId}`
          : undefined;

      tracks.push({
        id: asset.id,
        title: extractTitle(asset.filename),
        artist: 'Unknown Artist',
        album: '',
        duration: asset.duration,
        uri: asset.uri,
        filename: asset.filename,
        artworkUri,
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
