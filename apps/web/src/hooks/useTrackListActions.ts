/**
 * Shared hooks for TrackList interactions across all pages.
 *
 * usePlaylistDialog  — AddToPlaylistDialog open/close state + trigger
 * useTrackPlayback   — find local library match + play/select via player
 * buildMenuActions   — standard menu wiring (playlist dialog + artist nav)
 */

import { createSignal } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import type { Track } from '@heaven/ui'
import { artist, album } from '@heaven/core'
import { usePlayer } from '../providers'
import type { TrackMenuActions } from '@heaven/ui'
import { fetchRecordingArtists, fetchRecordingReleaseGroup, payloadToMbid } from '../lib/heaven'
import { addToast } from '../lib/toast'

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
    const ok = playCloud(track)
    if (!ok) {
      addToast('This track is not available for playback yet.', 'error')
      if (import.meta.env.DEV) {
        console.warn('[Playback] No local match and no cloud content metadata; cannot play', {
          id: track.id,
          title: track.title,
          artist: track.artist,
        })
      }
    }
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

// ── Artist navigation helper ─────────────────────────────────────

/**
 * Resolves a track to its artist MBID and navigates to the artist page.
 * Returns a function that can be called with a Track.
 */
export function useArtistNavigation() {
  const navigate = useNavigate()

  return async (track: Track) => {
    // 1. Check for artistMbid on extended track types (e.g. LocalTrack)
    if (track.artistMbid) {
      navigate(artist(track.artistMbid))
      return
    }

    // 2. For on-chain scrobbles with kind=1 (MBID), resolve via recording payload
    if (track.mbid) {
      try {
        const result = await fetchRecordingArtists(track.mbid)
        if (result.artists.length > 0) {
          navigate(artist(result.artists[0].mbid))
          return
        }
      } catch { /* fall through */ }
    }

    // 3. Try to decode recording MBID from payload (on-chain scrobble entries)
    if (track.kind === 1 && track.payload) {
      const recordingMbid = payloadToMbid(track.payload)
      if (recordingMbid) {
        try {
          const result = await fetchRecordingArtists(recordingMbid)
          if (result.artists.length > 0) {
            navigate(artist(result.artists[0].mbid))
            return
          }
        } catch { /* fall through */ }
      }
    }

    // 4. No MBID available — no artist page to navigate to
  }
}

// ── Album navigation helper ──────────────────────────────────────

/**
 * Resolves a track to its release-group (album) MBID and navigates to the album page.
 * Uses the recording resolver which now returns releaseGroup info.
 */
export function useAlbumNavigation() {
  const navigate = useNavigate()

  return async (track: Track) => {
    console.log('[AlbumNav] clicked', { title: track.title, artist: track.artist, album: track.album, mbid: track.mbid, kind: track.kind, payload: track.payload })

    // 1. For on-chain scrobbles with kind=1 (MBID), resolve via recording
    const recordingMbid = track.mbid ?? (track.kind === 1 && track.payload ? payloadToMbid(track.payload) : null)
    console.log('[AlbumNav] recordingMbid:', recordingMbid)

    if (recordingMbid) {
      try {
        console.log('[AlbumNav] fetching release-group for recording:', recordingMbid)
        const rg = await fetchRecordingReleaseGroup(recordingMbid)
        console.log('[AlbumNav] release-group result:', rg)
        if (rg) {
          console.log('[AlbumNav] navigating to album:', rg.mbid)
          navigate(album(rg.mbid))
          return
        }
      } catch (err) {
        console.error('[AlbumNav] error:', err)
      }
    }

    console.log('[AlbumNav] no release-group found, cannot navigate')
  }
}

// ── Standard menu actions (AddToPlaylist + AddToQueue + GoToArtist + GoToAlbum) ─

export function buildMenuActions(
  playlistDialog: ReturnType<typeof usePlaylistDialog>,
  extra?: Partial<TrackMenuActions>,
): TrackMenuActions {
  const goToArtist = useArtistNavigation()
  const goToAlbum = useAlbumNavigation()

  return {
    onAddToPlaylist: playlistDialog.trigger,
    onAddToQueue: (track) => console.log('Add to queue:', track),
    onGoToArtist: goToArtist,
    onGoToAlbum: goToAlbum,
    ...extra,
  }
}
