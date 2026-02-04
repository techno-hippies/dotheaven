/**
 * Shared hooks for TrackList interactions across all pages.
 *
 * usePlaylistDialog  — AddToPlaylistDialog open/close state + trigger
 * useTrackPlayback   — find local library match + play/select via player
 */

import { createSignal } from 'solid-js'
import type { Track } from '@heaven/ui'
import { usePlayer } from '../providers'
import type { TrackMenuActions } from '@heaven/ui'

// ── AddToPlaylistDialog state ─────────────────────────────────────

export function usePlaylistDialog() {
  const [open, setOpen] = createSignal(false)
  const [track, setTrack] = createSignal<Track | null>(null)

  const trigger = (t: Track) => {
    setTrack(t)
    setOpen(true)
  }

  return { open, setOpen, track, trigger }
}

// ── Track playback via local library match ────────────────────────

export function useTrackPlayback() {
  const player = usePlayer()

  /** Find a track in the local library by title + artist (case-insensitive) */
  const findLocalIndex = (track: Track): number => {
    const library = player.tracks()
    const title = track.title.toLowerCase()
    const artist = track.artist.toLowerCase()
    return library.findIndex(
      (t) => t.title.toLowerCase() === title && t.artist.toLowerCase() === artist,
    )
  }

  const select = (track: Track) => player.setSelectedTrackId(track.id)

  const playCloud = (track: Track) => {
    if (track.pieceCid && track.contentId && track.datasetOwner) {
      player.playEncryptedContent({
        contentId: track.contentId,
        trackId: track.id,
        pieceCid: track.pieceCid,
        datasetOwner: track.datasetOwner,
        title: track.title,
        artist: track.artist,
        algo: track.algo,
        coverUrl: track.albumCover,
      })
      return true
    }
    return false
  }

  const play = (track: Track) => {
    // If clicking the already-active track, toggle play/pause
    if (player.currentTrack()?.id === track.id || findLocalIndex(track) === player.currentIndex()) {
      player.togglePlay()
      return
    }
    const idx = findLocalIndex(track)
    if (idx >= 0) { player.playTrack(idx); return }
    // Fallback: play from Filecoin if cloud metadata available
    playCloud(track)
  }

  /** Play the first matching track from a list */
  const playFirst = (tracks: Track[]) => {
    // Try local match first
    for (const t of tracks) {
      const idx = findLocalIndex(t)
      if (idx >= 0) { player.playTrack(idx); return }
    }
    // Fallback: try cloud playback for the first track with content metadata
    for (const t of tracks) {
      if (playCloud(t)) return
    }
  }

  return {
    player,
    findLocalIndex,
    select,
    play,
    playFirst,
    activeTrackId: () => player.currentTrack()?.id,
    selectedTrackId: () => player.selectedTrackId() || undefined,
  }
}

// ── Standard menu actions (AddToPlaylist + AddToQueue) ────────────

export function buildMenuActions(
  playlistDialog: ReturnType<typeof usePlaylistDialog>,
  extra?: Partial<TrackMenuActions>,
): TrackMenuActions {
  return {
    onAddToPlaylist: playlistDialog.trigger,
    onAddToQueue: (track) => console.log('Add to queue:', track),
    ...extra,
  }
}
