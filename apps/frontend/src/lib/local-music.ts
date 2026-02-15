import type { Track } from '@heaven/ui'
import { resolveCoverUrl } from './heaven/cover-ref'

const tauriCore = () => import('@tauri-apps/api/core')
const tauriDialog = () => import('@tauri-apps/plugin-dialog')
const tauriFs = () => import('@tauri-apps/plugin-fs')

export interface LocalTrack extends Track {
  filePath: string
  /** MusicBrainz Recording ID from ID3 tags */
  mbid?: string
  /** MusicBrainz Artist ID (first/primary artist) from ID3 tags */
  artistMbid?: string
  /** MusicBrainz Release Artist ID from ID3 tags */
  albumArtistMbid?: string
  /** IPFS CID for album cover art (set after uploading to Filebase) */
  coverCid?: string
  /** Absolute path to local cover image (for Tauri file reads) */
  coverPath?: string
}

// =============================================================================
// Tauri invoke wrappers (Rust SQLite + lofty backend)
// =============================================================================

/** Scan folder on disk, extract/cache metadata in SQLite, return total count */
export async function scanFolderNative(folder: string): Promise<number> {
  const { invoke } = await tauriCore()
  return invoke<number>('music_scan_folder', { folder })
}

/** Get a page of cached tracks from SQLite */
export async function getTracksNative(folder: string, limit: number, offset: number): Promise<LocalTrack[]> {
  const { invoke, convertFileSrc } = await tauriCore()
  const tracks = await invoke<LocalTrack[]>('music_get_tracks', { folder, limit, offset })
  // Convert local cover paths to asset URLs serveable by Tauri
  // If local embedded art is missing, fallback to on-chain cover CID.
  // Set scrobbleStatus based on whether the track has a recording MBID
  for (const t of tracks) {
    if (t.albumCover) {
      t.albumCover = convertFileSrc(t.albumCover)
    } else {
      const coverUrl = resolveCoverUrl(t.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 })
      if (coverUrl) t.albumCover = coverUrl
    }
    t.scrobbleStatus = t.mbid ? 'verified' : 'unidentified'
  }
  return tracks
}

/** Get total track count for a folder */
export async function getTrackCountNative(folder: string): Promise<number> {
  const { invoke } = await tauriCore()
  return invoke<number>('music_get_track_count', { folder })
}

/** Get persisted folder path from SQLite settings */
export async function getFolderNative(): Promise<string | null> {
  const { invoke } = await tauriCore()
  return invoke<string | null>('music_get_folder')
}

/** Persist folder path in SQLite settings */
export async function setFolderNative(folder: string): Promise<void> {
  const { invoke } = await tauriCore()
  return invoke('music_set_folder', { folder })
}

/** Update cover CID for a local track (propagates to all rows with same cover_path) */
export async function setCoverCidNative(filePath: string, coverCid: string): Promise<void> {
  const { invoke } = await tauriCore()
  return invoke('music_set_cover_cid', { filePath, coverCid })
}

// =============================================================================
// Folder picker
// =============================================================================

export async function pickFolder(): Promise<string | null> {
  const { open } = await tauriDialog()
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
    const { convertFileSrc } = await tauriCore()
    return { url: convertFileSrc(filePath), mime, mode }
  }
  const { readFile } = await tauriFs()
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
