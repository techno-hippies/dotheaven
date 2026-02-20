package com.pirate.app.music

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import com.pirate.app.arweave.ArweaveTurboConfig
import com.pirate.app.player.PlayerController
import kotlinx.coroutines.launch

internal fun openTurboTopUpUrl(
  context: Context,
  onShowMessage: (String) -> Unit,
) {
  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(ArweaveTurboConfig.TOP_UP_URL))
  runCatching { context.startActivity(intent) }
    .onFailure {
      onShowMessage("Unable to open browser. Visit ${ArweaveTurboConfig.TOP_UP_URL}")
    }
}

internal fun playNewReleaseWithUi(
  release: AlbumCardModel,
  player: PlayerController,
  onOpenPlayer: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val audioUrl = resolveReleaseAudioUrl(release.audioRef)
  if (audioUrl.isNullOrBlank()) {
    onShowMessage("This release is not playable yet")
    return
  }
  val coverUrl = resolveReleaseCoverUrl(release.coverRef)
  val track =
    MusicTrack(
      id = "release:${release.audioRef ?: "${release.title}-${release.artist}"}",
      title = release.title,
      artist = release.artist,
      album = "",
      durationSec = 0,
      uri = audioUrl,
      filename = "${release.title}.mp3",
      artworkUri = coverUrl,
      artworkFallbackUri = release.coverRef,
    )
  player.playTrack(track, listOf(track))
  onOpenPlayer()
}

internal suspend fun refreshSharedLibraryWithUi(
  force: Boolean,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
  sharedLoading: Boolean,
  sharedPlaylists: List<PlaylistShareEntry>,
  sharedTracks: List<SharedCloudTrack>,
  sharedLastFetchAtMs: Long,
  ttlMs: Long,
  onSetSharedError: (String?) -> Unit,
  onSetSharedLoading: (Boolean) -> Unit,
  onSetSharedPlaylists: (List<PlaylistShareEntry>) -> Unit,
  onSetSharedTracks: (List<SharedCloudTrack>) -> Unit,
  onSetSharedLastFetchAtMs: (Long) -> Unit,
) {
  onSetSharedError(null)
  if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
    onSetSharedPlaylists(emptyList())
    onSetSharedTracks(emptyList())
    onSetSharedLastFetchAtMs(0L)
    SharedWithYouCache.playlists = emptyList()
    SharedWithYouCache.tracks = emptyList()
    SharedWithYouCache.lastFetchAtMs = 0L
    return
  }
  if (sharedLoading) return

  val now = SystemClock.elapsedRealtime()
  val hasData = sharedPlaylists.isNotEmpty() || sharedTracks.isNotEmpty()
  val shouldRefresh =
    shouldRefreshSharedLibrary(
      hasData = hasData,
      lastFetchAtMs = sharedLastFetchAtMs,
      nowMs = now,
      ttlMs = ttlMs,
    )
  if (!force && !shouldRefresh) return

  // Avoid flashing loaders when navigating between tabs; keep stale data visible while refreshing.
  onSetSharedLoading(!hasData)
  try {
    val fetched = fetchSharedLibrary(ownerEthAddress)
    onSetSharedError(fetched.error)
    onSetSharedPlaylists(fetched.playlists)
    onSetSharedTracks(fetched.tracks)
    onSetSharedLastFetchAtMs(now)
    SharedWithYouCache.playlists = fetched.playlists
    SharedWithYouCache.tracks = fetched.tracks
    SharedWithYouCache.lastFetchAtMs = now
  } finally {
    onSetSharedLoading(false)
  }
}

internal suspend fun refreshSharedPlaylistTracksWithUi(
  share: PlaylistShareEntry,
  force: Boolean,
  sharedPlaylistLoading: Boolean,
  sharedPlaylistRefreshing: Boolean,
  ttlMs: Long,
  currentSharedPlaylistKey: () -> String?,
  onSetSharedPlaylistError: (String?) -> Unit,
  onSetSharedPlaylistKey: (String?) -> Unit,
  onSetSharedPlaylistTracks: (List<SharedCloudTrack>) -> Unit,
  onSetSharedPlaylistLoading: (Boolean) -> Unit,
  onSetSharedPlaylistRefreshing: (Boolean) -> Unit,
) {
  onSetSharedPlaylistError(null)

  val key = sharedPlaylistCacheKey(share)
  onSetSharedPlaylistKey(key)

  val cached = SharedWithYouCache.getPlaylistTracks(key)
  // Show cached tracks instantly; otherwise clear to avoid showing stale tracks from a
  // previously-opened playlist.
  onSetSharedPlaylistTracks(cached?.second ?: emptyList())

  if (sharedPlaylistLoading || sharedPlaylistRefreshing) return

  val hasData = cached?.second?.isNotEmpty() == true
  if (!shouldRefreshSharedPlaylistTracks(cached = cached, force = force, ttlMs = ttlMs)) return

  if (hasData) {
    onSetSharedPlaylistRefreshing(true)
  } else {
    onSetSharedPlaylistLoading(true)
  }
  try {
    val fetched = fetchSharedPlaylistTracks(share)
    onSetSharedPlaylistError(fetched.error)
    // Only apply if we're still on this same playlist key (avoid race when switching fast).
    if (currentSharedPlaylistKey() == key) {
      onSetSharedPlaylistTracks(fetched.tracks)
    }
    SharedWithYouCache.putPlaylistTracks(key, SystemClock.elapsedRealtime(), fetched.tracks)
  } finally {
    onSetSharedPlaylistLoading(false)
    onSetSharedPlaylistRefreshing(false)
  }
}

internal suspend fun downloadAllSharedPlaylistTracksWithUi(
  tracks: List<SharedCloudTrack>,
  onSetCloudPlayLabel: (String?) -> Unit,
  onDownloadTrack: suspend (SharedCloudTrack) -> Boolean,
  onShowMessage: (String) -> Unit,
) {
  var ok = 0
  for ((idx, track) in tracks.withIndex()) {
    onSetCloudPlayLabel("Downloading ${idx + 1}/${tracks.size}: ${track.title}")
    if (onDownloadTrack(track)) ok += 1
  }
  onShowMessage("Downloaded $ok/${tracks.size} tracks")
}

internal fun findOnChainPlaylistById(
  playlistId: String,
  displayPlaylists: List<PlaylistDisplayItem>,
): PlaylistDisplayItem? {
  if (!playlistId.startsWith("0x")) return null
  return displayPlaylists.firstOrNull { it.id.equals(playlistId, ignoreCase = true) }
}

internal fun openPlaylistDetailWithUi(
  playlist: PlaylistDisplayItem,
  onSetSelectedPlaylist: (PlaylistDisplayItem?) -> Unit,
  onSetSelectedPlaylistId: (String?) -> Unit,
  onSetView: (MusicView) -> Unit,
  onLoadPlaylistDetail: suspend (PlaylistDisplayItem) -> Unit,
  scope: kotlinx.coroutines.CoroutineScope,
) {
  onSetSelectedPlaylist(playlist)
  onSetSelectedPlaylistId(playlist.id)
  onSetView(MusicView.PlaylistDetail)
  scope.launch {
    onLoadPlaylistDetail(playlist)
  }
}

internal suspend fun handleCreatePlaylistSuccessWithUi(
  playlistId: String,
  successMessage: String,
  displayPlaylists: List<PlaylistDisplayItem>,
  onLoadPlaylists: suspend () -> Unit,
  onSetSelectedPlaylistId: (String?) -> Unit,
  onSetSelectedPlaylist: (PlaylistDisplayItem?) -> Unit,
  onSetView: (MusicView) -> Unit,
  onLoadPlaylistDetail: suspend (PlaylistDisplayItem) -> Unit,
  onShowMessage: (String) -> Unit,
) {
  onLoadPlaylists()
  onSetSelectedPlaylistId(playlistId)
  val selected = findOnChainPlaylistById(playlistId = playlistId, displayPlaylists = displayPlaylists)
  onSetSelectedPlaylist(selected)
  if (selected != null) {
    onSetView(MusicView.PlaylistDetail)
    onLoadPlaylistDetail(selected)
  }
  onShowMessage(successMessage)
}

internal suspend fun handleAddToPlaylistSuccessWithUi(
  playlistId: String,
  currentView: MusicView,
  displayPlaylists: List<PlaylistDisplayItem>,
  onLoadPlaylists: suspend () -> Unit,
  onSetSelectedPlaylistId: (String?) -> Unit,
  onSetSelectedPlaylist: (PlaylistDisplayItem?) -> Unit,
  selectedPlaylistId: String?,
  onLoadPlaylistDetail: suspend (PlaylistDisplayItem) -> Unit,
) {
  onLoadPlaylists()
  onSetSelectedPlaylistId(playlistId)
  val selected = findOnChainPlaylistById(playlistId = playlistId, displayPlaylists = displayPlaylists)
  onSetSelectedPlaylist(selected)
  if (selected != null && currentView == MusicView.PlaylistDetail && selectedPlaylistId == selected.id) {
    onLoadPlaylistDetail(selected)
  }
}
