import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  uri: string;
  filename: string;
}

/**
 * Scan device media library for audio files.
 */
export async function scanMediaLibrary(): Promise<MusicTrack[]> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied');
  }

  const tracks: MusicTrack[] = [];
  let hasMore = true;
  let after: string | undefined;

  while (hasMore) {
    const result = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: 100,
      after,
      sortBy: [MediaLibrary.SortBy.default],
    });

    for (const asset of result.assets) {
      tracks.push({
        id: asset.id,
        title: extractTitle(asset.filename),
        artist: 'Unknown Artist',
        album: '',
        duration: asset.duration,
        uri: asset.uri,
        filename: asset.filename,
      });
    }

    hasMore = result.hasNextPage;
    after = result.endCursor;
  }

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
