import { get, set } from 'idb-keyval'
import { playlistStore } from './idb'

export interface Playlist {
  id: string
  title: string
  description: string
  coverUrl?: string
  songCount: number
  createdAt: number
  updatedAt: number
}

const PLAYLISTS_KEY = 'all-playlists'

export async function getPlaylists(): Promise<Playlist[]> {
  const playlists = await get<Playlist[]>(PLAYLISTS_KEY, playlistStore)
  return playlists ?? []
}

export async function getPlaylist(id: string): Promise<Playlist | undefined> {
  const playlists = await getPlaylists()
  return playlists.find((p) => p.id === id)
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  await set(PLAYLISTS_KEY, playlists, playlistStore)
}

export async function createPlaylist(
  data: Partial<Omit<Playlist, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Playlist> {
  const playlists = await getPlaylists()
  const playlistNumber = playlists.length + 1
  const now = Date.now()

  const newPlaylist: Playlist = {
    id: `playlist-${now}`,
    title: data.title || `My Playlist #${playlistNumber}`,
    description: data.description || '',
    coverUrl: data.coverUrl,
    songCount: data.songCount ?? 0,
    createdAt: now,
    updatedAt: now,
  }

  await savePlaylists([...playlists, newPlaylist])
  return newPlaylist
}

export async function updatePlaylist(
  id: string,
  data: Partial<Omit<Playlist, 'id' | 'createdAt'>>
): Promise<Playlist | undefined> {
  const playlists = await getPlaylists()
  const index = playlists.findIndex((p) => p.id === id)

  if (index === -1) return undefined

  const updated: Playlist = {
    ...playlists[index],
    ...data,
    updatedAt: Date.now(),
  }

  playlists[index] = updated
  await savePlaylists(playlists)
  return updated
}

export async function deletePlaylist(id: string): Promise<boolean> {
  const playlists = await getPlaylists()
  const filtered = playlists.filter((p) => p.id !== id)

  if (filtered.length === playlists.length) return false

  await savePlaylists(filtered)
  return true
}
