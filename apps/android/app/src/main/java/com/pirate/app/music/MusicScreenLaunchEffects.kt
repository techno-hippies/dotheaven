package com.pirate.app.music

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.profile.ProfileMusicApi
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.util.shortAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun MusicScreenLaunchEffects(
  context: Context,
  newReleasesMax: Int,
  view: MusicView,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  hasPermission: Boolean,
  sharedSelectedPlaylist: PlaylistShareEntry?,
  sharedPlaylists: List<PlaylistShareEntry>,
  sharedItemIds: Set<String>,
  sharedSeenItemIds: Set<String>,
  sharedOwnerLabels: MutableMap<String, String>,
  onSetTracks: (List<MusicTrack>) -> Unit,
  onSetDownloadedTracksByContentId: (Map<String, DownloadedTrackEntry>) -> Unit,
  onSetSharedSeenItemIds: (Set<String>) -> Unit,
  onSetRecentPublishedReleases: (List<AlbumCardModel>) -> Unit,
  onSetRecentPublishedReleasesLoading: (Boolean) -> Unit,
  onSetRecentPublishedReleasesError: (String?) -> Unit,
  onLoadPlaylists: suspend () -> Unit,
  onLoadShared: suspend (Boolean) -> Unit,
  onLoadSharedPlaylistTracks: suspend (PlaylistShareEntry, Boolean) -> Unit,
  onRunSilentScan: suspend () -> Unit,
) {
  LaunchedEffect(Unit) {
    onSetTracks(MusicLibrary.loadCachedTracks(context))
    onSetDownloadedTracksByContentId(DownloadedTracksStore.load(context))
    onLoadPlaylists()
    if (hasPermission) {
      onRunSilentScan()
    }
  }

  LaunchedEffect(ownerEthAddress, isAuthenticated) {
    val seenItemIds =
      if (isAuthenticated && !ownerEthAddress.isNullOrBlank()) {
        withContext(Dispatchers.IO) { loadSeenSharedItemIds(context, ownerEthAddress) }
      } else {
        emptySet()
      }
    onSetSharedSeenItemIds(seenItemIds)
    onLoadPlaylists()
    onLoadShared(false)
  }

  LaunchedEffect(view, ownerEthAddress, isAuthenticated) {
    if (view != MusicView.Shared) return@LaunchedEffect
    onLoadShared(false)
  }

  LaunchedEffect(view) {
    if (view != MusicView.Home) return@LaunchedEffect
    val cached = runCatching { RecentlyPublishedSongsStore.load(context) }
      .getOrDefault(emptyList())
      .map {
        AlbumCardModel(
          title = it.title,
          artist = it.artist,
          audioRef = it.audioCid,
          coverRef = it.coverCid,
        )
      }
    if (cached.isNotEmpty()) onSetRecentPublishedReleases(cached)
    onSetRecentPublishedReleasesLoading(cached.isEmpty())
    onSetRecentPublishedReleasesError(null)

    runCatching { ProfileMusicApi.fetchLatestPublishedSongs(maxEntries = newReleasesMax) }
      .onSuccess { rows ->
        val releases =
          rows.map { row ->
            AlbumCardModel(
              title = row.title,
              artist = row.artist,
              audioRef = row.pieceCid,
              coverRef = row.coverCid,
            )
          }
        onSetRecentPublishedReleases(releases)
        onSetRecentPublishedReleasesLoading(false)
      }
      .onFailure { error ->
        if (cached.isEmpty()) {
          onSetRecentPublishedReleasesError(error.message ?: "Failed to load new releases")
        }
        onSetRecentPublishedReleasesLoading(false)
      }
  }

  LaunchedEffect(view, sharedSelectedPlaylist) {
    if (view != MusicView.SharedPlaylistDetail) return@LaunchedEffect
    val share = sharedSelectedPlaylist ?: return@LaunchedEffect
    onLoadSharedPlaylistTracks(share, false)
  }

  LaunchedEffect(view, sharedItemIds, ownerEthAddress, isAuthenticated) {
    if (view != MusicView.Shared || !isAuthenticated || ownerEthAddress.isNullOrBlank()) return@LaunchedEffect
    if (sharedItemIds.isEmpty()) return@LaunchedEffect
    val merged = sharedSeenItemIds + sharedItemIds
    if (merged.size == sharedSeenItemIds.size) return@LaunchedEffect
    onSetSharedSeenItemIds(merged)
    withContext(Dispatchers.IO) { saveSeenSharedItemIds(context, ownerEthAddress, merged) }
  }

  LaunchedEffect(sharedPlaylists) {
    val owners =
      sharedPlaylists
        .map { it.owner.trim().lowercase() }
        .filter { it.startsWith("0x") && it.length == 42 }
        .distinct()

    for (owner in owners) {
      if (sharedOwnerLabels.containsKey(owner)) continue
      sharedOwnerLabels[owner] = shortAddress(owner, minLengthToShorten = 10)
      val handle =
        runCatching {
          withContext(Dispatchers.IO) {
            TempoNameRecordsApi.getPrimaryName(owner)
              ?: OnboardingRpcHelpers.getPrimaryName(owner)?.trim()?.takeIf { it.isNotBlank() }?.let { "$it.heaven" }
          }
        }
          .getOrNull()
          ?.trim()
          .orEmpty()
      if (handle.isNotBlank()) {
        sharedOwnerLabels[owner] = handle
      }
    }
  }
}
