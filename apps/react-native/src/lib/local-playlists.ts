/**
 * Local-first playlist storage backed by AsyncStorage.
 *
 * Playlists are created instantly with no authentication required.
 * When the user signs in, local playlists can be synced to chain.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'heaven:local-playlists';

// ── Types ──────────────────────────────────────────────────────────

export interface LocalPlaylistTrack {
  artist: string;
  title: string;
  album?: string;
  duration?: number; // seconds
  uri?: string;      // local file URI for playback
  artworkUri?: string;
  artworkFallbackUri?: string;
}

export interface LocalPlaylist {
  id: string;               // "local:<uuid>"
  name: string;
  tracks: LocalPlaylistTrack[];
  coverUri?: string;         // local image URI
  createdAt: number;        // unix ms
  updatedAt: number;
  /** Set after syncing to chain — the on-chain playlist ID */
  syncedPlaylistId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function generateId(): string {
  // Simple unique ID without crypto dependency
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `local:${ts}-${rand}`;
}

async function readAll(): Promise<LocalPlaylist[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeAll(playlists: LocalPlaylist[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
}

// ── CRUD ───────────────────────────────────────────────────────────

export async function getLocalPlaylists(): Promise<LocalPlaylist[]> {
  return readAll();
}

export async function createLocalPlaylist(
  name: string,
  initialTrack?: LocalPlaylistTrack,
): Promise<LocalPlaylist> {
  const playlists = await readAll();
  const now = Date.now();
  const playlist: LocalPlaylist = {
    id: generateId(),
    name,
    tracks: initialTrack ? [initialTrack] : [],
    createdAt: now,
    updatedAt: now,
  };
  playlists.unshift(playlist); // newest first
  await writeAll(playlists);
  return playlist;
}

export async function addTrackToLocalPlaylist(
  playlistId: string,
  track: LocalPlaylistTrack,
): Promise<LocalPlaylist | null> {
  const playlists = await readAll();
  const idx = playlists.findIndex((p) => p.id === playlistId);
  if (idx === -1) return null;

  // Avoid duplicates by artist+title
  const isDupe = playlists[idx].tracks.some(
    (t) => t.artist === track.artist && t.title === track.title,
  );
  if (!isDupe) {
    playlists[idx].tracks.push(track);
    playlists[idx].updatedAt = Date.now();
    await writeAll(playlists);
  }
  return playlists[idx];
}

export async function renameLocalPlaylist(
  playlistId: string,
  newName: string,
): Promise<LocalPlaylist | null> {
  const playlists = await readAll();
  const idx = playlists.findIndex((p) => p.id === playlistId);
  if (idx === -1) return null;

  playlists[idx].name = newName;
  playlists[idx].updatedAt = Date.now();
  await writeAll(playlists);
  return playlists[idx];
}

export async function removeTrackFromLocalPlaylist(
  playlistId: string,
  trackIndex: number,
): Promise<LocalPlaylist | null> {
  const playlists = await readAll();
  const idx = playlists.findIndex((p) => p.id === playlistId);
  if (idx === -1) return null;

  playlists[idx].tracks.splice(trackIndex, 1);
  playlists[idx].updatedAt = Date.now();
  await writeAll(playlists);
  return playlists[idx];
}

export async function deleteLocalPlaylist(playlistId: string): Promise<boolean> {
  const playlists = await readAll();
  const filtered = playlists.filter((p) => p.id !== playlistId);
  if (filtered.length === playlists.length) return false;
  await writeAll(filtered);
  return true;
}

export async function setLocalPlaylistCover(
  playlistId: string,
  coverUri: string,
): Promise<LocalPlaylist | null> {
  const playlists = await readAll();
  const idx = playlists.findIndex((p) => p.id === playlistId);
  if (idx === -1) return null;

  playlists[idx].coverUri = coverUri;
  playlists[idx].updatedAt = Date.now();
  await writeAll(playlists);
  return playlists[idx];
}

export async function getLocalPlaylist(playlistId: string): Promise<LocalPlaylist | null> {
  const playlists = await readAll();
  return playlists.find((p) => p.id === playlistId) ?? null;
}

export function isLocalPlaylistId(id: string): boolean {
  return id.startsWith('local:');
}
