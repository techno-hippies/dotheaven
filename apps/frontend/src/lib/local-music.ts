import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { parseBuffer } from 'music-metadata-browser'
import type { Track } from '@heaven/ui'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'])
const STORAGE_KEY = 'heaven:local-music'

interface PersistedTrack {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  filePath: string
}

export interface LocalTrack extends Track {
  filePath: string
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.substring(dot).toLowerCase() : ''
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.substring(idx + 1) : normalized
}

function fallbackFromFilename(name: string): { title: string; artist: string } {
  const dot = name.lastIndexOf('.')
  const base = dot >= 0 ? name.substring(0, dot) : name
  const clean = base.replace(/_/g, ' ')

  const dashSplit = clean.split(' - ')
  if (dashSplit.length >= 2) {
    return { artist: dashSplit[0].trim(), title: dashSplit.slice(1).join(' - ').trim() }
  }

  const numbered = clean.replace(/^\d+[\.\)\-]\s*/, '')
  return { title: numbered || clean, artist: 'Unknown Artist' }
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !isFinite(seconds)) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function guessMime(name: string): string {
  const ext = getExtension(name)
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.opus': 'audio/opus',
    '.wma': 'audio/x-ms-wma',
  }
  return map[ext] || 'audio/mpeg'
}

export function getMimeForPath(path: string): string {
  return guessMime(path)
}

export function getExtensionForPath(path: string): string {
  return getExtension(path)
}

async function readMetadata(filePath: string, fileName: string): Promise<{ title: string; artist: string; album: string; duration: string }> {
  const fallback = fallbackFromFilename(fileName)
  try {
    const bytes = await readFile(filePath)
    const metadata = await parseBuffer(bytes, { mimeType: guessMime(fileName) })
    return {
      title: metadata.common.title || fallback.title,
      artist: metadata.common.artist || fallback.artist,
      album: metadata.common.album || '',
      duration: formatDuration(metadata.format.duration),
    }
  } catch (e) {
    console.warn('Failed to read metadata for', fileName, e)
    return { ...fallback, album: '', duration: '' }
  }
}

export async function enrichTrackMetadata(track: LocalTrack): Promise<LocalTrack> {
  const fileName = getBaseName(track.filePath)
  const meta = await readMetadata(track.filePath, fileName)
  return {
    ...track,
    title: meta.title || track.title,
    artist: meta.artist || track.artist,
    album: meta.album || track.album,
    duration: meta.duration || track.duration,
  }
}

async function scanDirectory(dirPath: string): Promise<LocalTrack[]> {
  const tracks: LocalTrack[] = []
  let counter = 0

  async function walk(path: string) {
    const entries = await readDir(path)
    for (const entry of entries) {
      const fullPath = await join(path, entry.name)
      if (entry.isDirectory) {
        await walk(fullPath)
      } else if (entry.isFile && AUDIO_EXTENSIONS.has(getExtension(entry.name))) {
        counter++
        const meta = fallbackFromFilename(entry.name)
        tracks.push({
          id: `local-${counter}`,
          title: meta.title,
          artist: meta.artist,
          album: '',
          duration: '',
          filePath: fullPath,
        })
      }
    }
  }

  await walk(dirPath)
  tracks.sort((a, b) => a.title.localeCompare(b.title))
  return tracks
}

export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false })
  return selected as string | null
}

export async function scanFolder(folderPath: string): Promise<LocalTrack[]> {
  return scanDirectory(folderPath)
}

/** Create a playable blob URL for a local audio file */
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

export function saveState(folderPath: string, tracks: LocalTrack[]) {
  const data = {
    folderPath,
    tracks: tracks.map((t): PersistedTrack => ({
      id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration, filePath: t.filePath,
    })),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage full
  }
}

export function loadState(): { folderPath: string; tracks: LocalTrack[] } | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { folderPath: string; tracks: PersistedTrack[] }
    return {
      folderPath: data.folderPath,
      tracks: data.tracks.map((t): LocalTrack => ({ ...t })),
    }
  } catch {
    return null
  }
}
