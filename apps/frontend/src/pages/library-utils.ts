import type { Track } from '@heaven/ui'
import type { UploadedContentEntry, SharedContentEntry } from '../lib/heaven/scrobbles'
import type { PlayerContextType, EncryptedContentInfo } from '../providers/PlayerProvider'
import { resolveCoverUrl } from '../lib/heaven/cover-ref'

export function mapUploadedToTracks(entries: UploadedContentEntry[]): Track[] {
  return entries.map((e) => ({
    id: e.contentId,
    contentId: e.contentId,
    pieceCid: e.pieceCid,
    title: e.title,
    artist: e.artist,
    album: '',
    kind: e.kind,
    payload: e.payload,
    mbid: e.mbid,
    coverCid: e.coverCid,
    albumCover: resolveCoverUrl(e.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 }),
    dateAdded: new Date(e.uploadedAt * 1000).toLocaleDateString(),
  }))
}

export function mapSharedToTracks(entries: SharedContentEntry[]): Track[] {
  return entries.map((e) => ({
    id: e.contentId,
    contentId: e.contentId,
    pieceCid: e.pieceCid,
    title: e.title,
    artist: e.artist,
    album: '',
    sharedBy: e.sharedBy,
    kind: e.kind,
    payload: e.payload,
    mbid: e.mbid,
    coverCid: e.coverCid,
    albumCover: resolveCoverUrl(e.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 }),
    dateAdded: new Date(e.uploadedAt * 1000).toLocaleDateString(),
  }))
}

export function buildEntriesMap<T extends UploadedContentEntry | SharedContentEntry>(
  entries: T[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const e of entries) {
    map.set(e.contentId, e)
  }
  return map
}

/** Handle play for uploaded/shared content with toggle support */
export function handleEncryptedTrackPlay(
  track: Track,
  entriesMap: Map<string, UploadedContentEntry | SharedContentEntry>,
  player: Pick<PlayerContextType, 'currentTrack' | 'togglePlay' | 'playEncryptedContent'>,
) {
  const currentTrack = player.currentTrack()
  // If same track is playing, toggle play/pause
  if (currentTrack?.id === track.id) {
    player.togglePlay()
    return
  }
  // Otherwise play the new track
  const entry = entriesMap.get(track.id)
  if (entry) {
    player.playEncryptedContent({
      ...entry,
      coverUrl: resolveCoverUrl(entry.coverCid, { width: 256, height: 256, format: 'webp', quality: 80 }),
    } as EncryptedContentInfo)
  }
}
