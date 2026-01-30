import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import type { Track } from '@heaven/ui'

export interface LocalTrack extends Track {
  filePath: string
  /** MusicBrainz Recording ID from ID3 tags */
  mbid?: string
}

// =============================================================================
// Tauri invoke wrappers (Rust SQLite + lofty backend)
// =============================================================================

/** Scan folder on disk, extract/cache metadata in SQLite, return total count */
export async function scanFolderNative(folder: string): Promise<number> {
  return invoke<number>('music_scan_folder', { folder })
}

/** Get a page of cached tracks from SQLite */
export async function getTracksNative(folder: string, limit: number, offset: number): Promise<LocalTrack[]> {
  const tracks = await invoke<LocalTrack[]>('music_get_tracks', { folder, limit, offset })
  // Convert local cover paths to asset URLs serveable by Tauri
  for (const t of tracks) {
    if (t.albumCover) {
      t.albumCover = convertFileSrc(t.albumCover)
    }
  }
  return tracks
}

/** Get total track count for a folder */
export async function getTrackCountNative(folder: string): Promise<number> {
  return invoke<number>('music_get_track_count', { folder })
}

/** Get persisted folder path from SQLite settings */
export async function getFolderNative(): Promise<string | null> {
  return invoke<string | null>('music_get_folder')
}

/** Persist folder path in SQLite settings */
export async function setFolderNative(folder: string): Promise<void> {
  return invoke('music_set_folder', { folder })
}

// =============================================================================
// Folder picker
// =============================================================================

export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false })
  return selected as string | null
}

// =============================================================================
// Playback helpers (unchanged)
// =============================================================================

const MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.substring(dot).toLowerCase() : ''
}

function guessMime(name: string): string {
  return MIME_MAP[getExtension(name)] || 'audio/mpeg'
}

export function getMimeForPath(path: string): string {
  return guessMime(path)
}

export function getExtensionForPath(path: string): string {
  return getExtension(path)
}

export type PlaybackSource = {
  url: string
  mime: string
  mode: 'stream' | 'blob'
  revoke?: () => void
}

export async function createPlaybackSource(
  filePath: string,
  mode: 'stream' | 'blob' = 'stream'
): Promise<PlaybackSource> {
  const mime = guessMime(filePath)
  if (mode === 'stream') {
    return { url: convertFileSrc(filePath), mime, mode }
  }
  const bytes = await readFile(filePath)
  const blob = new Blob([bytes], { type: mime })
  const url = URL.createObjectURL(blob)
  return { url, mime, mode, revoke: () => URL.revokeObjectURL(url) }
}

// =============================================================================
// Migration: remove old localStorage data
// =============================================================================

const OLD_STORAGE_KEY = 'heaven:local-music'

/** Returns old folder path if migration is needed, then clears localStorage */
export function migrateFromLocalStorage(): string | null {
  const raw = localStorage.getItem(OLD_STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { folderPath: string }
    localStorage.removeItem(OLD_STORAGE_KEY)
    return data.folderPath || null
  } catch {
    localStorage.removeItem(OLD_STORAGE_KEY)
    return null
  }
}
