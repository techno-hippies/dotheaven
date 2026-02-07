import type { Track } from '@heaven/ui'
import type { UploadedContentEntry, SharedContentEntry } from '../lib/heaven/scrobbles'
import type { PlayerContextType, EncryptedContentInfo } from '../providers/PlayerProvider'

export const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

export function isValidCid(cid: string | undefined | null): cid is string {
  return !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'))
}

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
    albumCover: isValidCid(e.coverCid)
      ? `${FILEBASE_GATEWAY}/${e.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
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
    albumCover: isValidCid(e.coverCid)
      ? `${FILEBASE_GATEWAY}/${e.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
      : undefined,
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
      coverUrl: isValidCid(entry.coverCid)
        ? `${FILEBASE_GATEWAY}/${entry.coverCid}?img-width=256&img-height=256&img-format=webp&img-quality=80`
        : undefined,
    } as EncryptedContentInfo)
  }
}
