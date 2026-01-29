import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, stat } from '@tauri-apps/plugin-fs'
import type { Track } from '@heaven/ui'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'])
const STORAGE_KEY = 'heaven:local-music'

export interface LocalMusicState {
  folderPath: string
  tracks: LocalTrack[]
}

export interface LocalTrack extends Track {
  filePath: string
  fileUrl: string
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.substring(dot).toLowerCase() : ''
}

function titleFromFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot >= 0 ? name.substring(0, dot) : name
  // Try to split "Artist - Title" format
  return base.replace(/_/g, ' ')
}

function parseArtistTitle(name: string): { title: string; artist: string } {
  const dot = name.lastIndexOf('.')
  const base = dot >= 0 ? name.substring(0, dot) : name
  const clean = base.replace(/_/g, ' ')

  // Common format: "Artist - Title" or "01 - Title" or "01. Title"
  const dashSplit = clean.split(' - ')
  if (dashSplit.length >= 2) {
    return { artist: dashSplit[0].trim(), title: dashSplit.slice(1).join(' - ').trim() }
  }

  // "01. Title" — strip leading track numbers
  const numbered = clean.replace(/^\d+[\.\)\-]\s*/, '')
  return { title: numbered || clean, artist: 'Unknown Artist' }
}

async function scanDirectory(dirPath: string): Promise<LocalTrack[]> {
  const tracks: LocalTrack[] = []
  let counter = 0

  async function walk(path: string) {
    const entries = await readDir(path)
    for (const entry of entries) {
      const fullPath = path + '/' + entry.name
      if (entry.isDirectory) {
        await walk(fullPath)
      } else if (entry.isFile && AUDIO_EXTENSIONS.has(getExtension(entry.name))) {
        const { title, artist } = parseArtistTitle(entry.name)
        counter++
        tracks.push({
          id: `local-${counter}`,
          title,
          artist,
          album: 'Local',
          dateAdded: '',
          duration: '',
          filePath: fullPath,
          fileUrl: convertFileSrc(fullPath),
        })
      }
    }
  }

  await walk(dirPath)
  // Sort by filename
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

export function saveState(state: LocalMusicState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadState(): LocalMusicState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LocalMusicState
  } catch {
    return null
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}
