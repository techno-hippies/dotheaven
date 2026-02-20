package com.pirate.app.music

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.pirate.app.player.PlayerController
import kotlinx.coroutines.launch

@Composable
internal fun MusicScreenRouteHost(
  view: MusicView,
  onViewChange: (MusicView) -> Unit,
  sharedPlaylists: List<PlaylistShareEntry>,
  sharedTracks: List<SharedCloudTrack>,
  sharedUnreadCount: Int,
  displayPlaylists: List<PlaylistDisplayItem>,
  newReleases: List<AlbumCardModel>,
  newReleasesLoading: Boolean,
  newReleasesError: String?,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
  onPlayRelease: (AlbumCardModel) -> Unit,
  player: PlayerController,
  currentTrackId: String?,
  isPlaying: Boolean,
  onOpenPlayer: () -> Unit,
  hasPermission: Boolean,
  tracks: List<MusicTrack>,
  scanning: Boolean,
  libraryError: String?,
  onRequestPermission: () -> Unit,
  onScan: () -> Unit,
  onOpenTrackMenu: (MusicTrack) -> Unit,
  searchQuery: String,
  onSearchQueryChange: (String) -> Unit,
  sharedLoading: Boolean,
  sharedError: String?,
  isAuthenticated: Boolean,
  ownerLabelFor: (String) -> String,
  onRefreshShared: () -> Unit,
  onOpenSharedPlaylist: (PlaylistShareEntry) -> Unit,
  onPlaySharedTrack: (SharedCloudTrack) -> Unit,
  onDownloadSharedTrack: (SharedCloudTrack) -> Unit,
  playlistsLoading: Boolean,
  onCreatePlaylist: () -> Unit,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
  selectedPlaylist: PlaylistDisplayItem?,
  selectedPlaylistId: String?,
  onSelectedPlaylistChange: (PlaylistDisplayItem?) -> Unit,
  playlistDetailLoading: Boolean,
  playlistDetailError: String?,
  playlistDetailTracks: List<MusicTrack>,
  onLoadPlaylistDetail: suspend (PlaylistDisplayItem) -> Unit,
  onChangePlaylistCover: suspend (PlaylistDisplayItem, Uri) -> Boolean,
  onSharePlaylistToWallet: suspend (PlaylistDisplayItem, String) -> Boolean,
  onDeletePlaylist: suspend (PlaylistDisplayItem) -> Boolean,
  sharedSelectedPlaylist: PlaylistShareEntry?,
  sharedPlaylistMenuOpen: Boolean,
  onSharedPlaylistMenuOpenChange: (Boolean) -> Unit,
  sharedPlaylistTracks: List<SharedCloudTrack>,
  sharedPlaylistLoading: Boolean,
  sharedPlaylistRefreshing: Boolean,
  sharedPlaylistError: String?,
  sharedByLabel: String?,
  onRefreshSharedPlaylist: (PlaylistShareEntry) -> Unit,
  onDownloadAllSharedPlaylist: suspend () -> Unit,
  cloudPlayBusy: Boolean,
  cloudPlayLabel: String?,
) {
  val scope = rememberCoroutineScope()

  Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
      when (view) {
        MusicView.Home -> {
          MusicHomeRoute(
            sharedPlaylistCount = sharedPlaylists.size,
            sharedTrackCount = sharedTracks.size,
            sharedUnreadCount = sharedUnreadCount,
            playlistCount = displayPlaylists.size,
            playlists = displayPlaylists,
            newReleases = newReleases,
            newReleasesLoading = newReleasesLoading,
            newReleasesError = newReleasesError,
            onOpenDrawer = onOpenDrawer,
            onNavigateSearch = { onViewChange(MusicView.Search) },
            onNavigateLibrary = { onViewChange(MusicView.Library) },
            onNavigateShared = { onViewChange(MusicView.Shared) },
            onNavigatePlaylists = { onViewChange(MusicView.Playlists) },
            onOpenPlaylist = onOpenPlaylist,
            onPlayRelease = onPlayRelease,
          )
        }

        MusicView.Library -> {
          MusicLibraryRoute(
            hasPermission = hasPermission,
            tracks = tracks,
            scanning = scanning,
            error = libraryError,
            currentTrackId = currentTrackId,
            isPlaying = isPlaying,
            onBack = { onViewChange(MusicView.Home) },
            onNavigateSearch = { onViewChange(MusicView.Search) },
            onRequestPermission = onRequestPermission,
            onScan = onScan,
            onPlayTrack = { track ->
              if (currentTrackId == track.id) {
                player.togglePlayPause()
              } else {
                player.playTrack(track, tracks)
              }
              onOpenPlayer()
            },
            onTrackMenu = onOpenTrackMenu,
          )
        }

        MusicView.Search -> {
          MusicSearchRoute(
            query = searchQuery,
            onQueryChange = onSearchQueryChange,
            tracks = tracks,
            currentTrackId = currentTrackId,
            isPlaying = isPlaying,
            onBack = {
              onSearchQueryChange("")
              onViewChange(MusicView.Home)
            },
            onPlayTrack = { track ->
              if (currentTrackId == track.id) {
                player.togglePlayPause()
              } else {
                player.playTrack(track, tracks)
              }
              onOpenPlayer()
            },
            onTrackMenu = onOpenTrackMenu,
          )
        }

        MusicView.Shared -> {
          SharedLibraryRoute(
            cloudPlayBusy = cloudPlayBusy,
            sharedLoading = sharedLoading,
            sharedError = sharedError,
            sharedPlaylists = sharedPlaylists,
            sharedTracks = sharedTracks,
            isAuthenticated = isAuthenticated,
            ownerLabelFor = ownerLabelFor,
            onBack = { onViewChange(MusicView.Home) },
            onRefresh = onRefreshShared,
            onOpenPlaylist = onOpenSharedPlaylist,
            onPlayTrack = onPlaySharedTrack,
            onDownloadTrack = onDownloadSharedTrack,
          )
        }

        MusicView.Playlists -> {
          PlaylistsRoute(
            loading = playlistsLoading,
            playlists = displayPlaylists,
            onBack = { onViewChange(MusicView.Home) },
            onCreatePlaylist = onCreatePlaylist,
            onOpenPlaylist = onOpenPlaylist,
          )
        }

        MusicView.PlaylistDetail -> {
          val playlist =
            selectedPlaylist
              ?: displayPlaylists.find { it.id == selectedPlaylistId }?.also { onSelectedPlaylistChange(it) }
          LaunchedEffect(playlist) {
            if (playlist != null && playlistDetailTracks.isEmpty() && !playlistDetailLoading) {
              onLoadPlaylistDetail(playlist)
            }
          }
          PlaylistDetailRoute(
            playlist = playlist,
            loading = playlistDetailLoading,
            error = playlistDetailError,
            tracks = playlistDetailTracks,
            currentTrackId = currentTrackId,
            isPlaying = isPlaying,
            onBack = { onViewChange(MusicView.Playlists) },
            onPlayTrack = { track ->
              if (track.uri.isBlank()) {
                onShowMessage("This playlist track isn't available for playback on this device yet")
                return@PlaylistDetailRoute
              }
              val playable = playlistDetailTracks.filter { it.uri.isNotBlank() }
              if (currentTrackId == track.id) {
                player.togglePlayPause()
              } else {
                player.playTrack(track, playable)
              }
              onOpenPlayer()
            },
            onTrackMenu = { track ->
              if (track.uri.isBlank()) {
                onShowMessage("Track actions unavailable for this item")
                return@PlaylistDetailRoute
              }
              onOpenTrackMenu(track)
            },
            onShowMessage = onShowMessage,
            onChangeCover = onChangePlaylistCover,
            onShareToWallet = onSharePlaylistToWallet,
            onDeletePlaylist = onDeletePlaylist,
          )
        }

        MusicView.SharedPlaylistDetail -> {
          val share = sharedSelectedPlaylist
          SharedPlaylistDetailRoute(
            share = share,
            sharedPlaylistMenuOpen = sharedPlaylistMenuOpen,
            onSharedPlaylistMenuOpenChange = onSharedPlaylistMenuOpenChange,
            sharedPlaylistTracks = sharedPlaylistTracks,
            sharedPlaylistLoading = sharedPlaylistLoading,
            sharedPlaylistRefreshing = sharedPlaylistRefreshing,
            sharedPlaylistError = sharedPlaylistError,
            sharedByLabel = sharedByLabel,
            currentTrackId = currentTrackId,
            isPlaying = isPlaying,
            onBack = { onViewChange(MusicView.Shared) },
            onRefresh = {
              if (share != null) {
                onRefreshSharedPlaylist(share)
              }
            },
            onDownloadAll = {
              scope.launch { onDownloadAllSharedPlaylist() }
            },
            onPlayTrack = onPlaySharedTrack,
            onDownloadTrack = onDownloadSharedTrack,
            onShowMessage = onShowMessage,
          )
        }
      }
    }

    Box(modifier = Modifier.align(Alignment.BottomCenter)) {
      CloudPlayBusyBanner(
        cloudPlayBusy = cloudPlayBusy,
        cloudPlayLabel = cloudPlayLabel,
      )
    }
  }
}

@Composable
internal fun MusicScreenOverlayHost(
  trackMenuOpen: Boolean,
  selectedTrack: MusicTrack?,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  hostActivity: androidx.fragment.app.FragmentActivity?,
  tempoAccount: com.pirate.app.tempo.TempoPasskeyManager.PasskeyAccount?,
  tracks: List<MusicTrack>,
  downloadedTracksByContentId: Map<String, DownloadedTrackEntry>,
  uploadBusy: Boolean,
  turboCreditsCopy: String,
  onUploadBusyChange: (Boolean) -> Unit,
  onTracksChange: (List<MusicTrack>) -> Unit,
  onOpenShare: (MusicTrack) -> Unit,
  onOpenAddToPlaylist: (MusicTrack) -> Unit,
  onCloseTrackMenu: () -> Unit,
  onPromptTurboTopUp: (String) -> Unit,
  onShowMessage: (String) -> Unit,
  onRescanAfterDownload: suspend () -> Unit,
  onOpenSongPage: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtistPage: ((artistName: String) -> Unit)? = null,
  createPlaylistOpen: Boolean,
  addToPlaylistOpen: Boolean,
  onCreatePlaylistOpenChange: (Boolean) -> Unit,
  onAddToPlaylistOpenChange: (Boolean) -> Unit,
  onCreatePlaylistSuccess: (playlistId: String, successMessage: String) -> Unit,
  onAddToPlaylistSuccess: (playlistId: String) -> Unit,
  shareTrack: MusicTrack?,
  onDismissShare: () -> Unit,
  turboCreditsSheetOpen: Boolean,
  turboCreditsSheetMessage: String,
  onDismissTurboCredits: () -> Unit,
  onGetTurboCredits: () -> Unit,
) {
  MusicTrackMenuOverlay(
    open = trackMenuOpen,
    selectedTrack = selectedTrack,
    ownerEthAddress = ownerEthAddress,
    isAuthenticated = isAuthenticated,
    hostActivity = hostActivity,
    tempoAccount = tempoAccount,
    tracks = tracks,
    downloadedTracksByContentId = downloadedTracksByContentId,
    uploadBusy = uploadBusy,
    turboCreditsCopy = turboCreditsCopy,
    onUploadBusyChange = onUploadBusyChange,
    onTracksChange = onTracksChange,
    onOpenShare = onOpenShare,
    onOpenAddToPlaylist = onOpenAddToPlaylist,
    onClose = onCloseTrackMenu,
    onPromptTurboTopUp = onPromptTurboTopUp,
    onShowMessage = onShowMessage,
    onRescanAfterDownload = onRescanAfterDownload,
    onOpenSongPage = onOpenSongPage,
    onOpenArtistPage = onOpenArtistPage,
  )

  MusicPlaylistSheets(
    createPlaylistOpen = createPlaylistOpen,
    addToPlaylistOpen = addToPlaylistOpen,
    selectedTrack = selectedTrack,
    isAuthenticated = isAuthenticated,
    ownerEthAddress = ownerEthAddress,
    tempoAccount = tempoAccount,
    hostActivity = hostActivity,
    onShowMessage = onShowMessage,
    onCreatePlaylistOpenChange = onCreatePlaylistOpenChange,
    onAddToPlaylistOpenChange = onAddToPlaylistOpenChange,
    onCreatePlaylistSuccess = onCreatePlaylistSuccess,
    onAddToPlaylistSuccess = onAddToPlaylistSuccess,
  )

  MusicShareDialog(
    shareTrack = shareTrack,
    ownerEthAddress = ownerEthAddress,
    onDismiss = onDismissShare,
    onShowMessage = onShowMessage,
  )

  com.pirate.app.music.ui.TurboCreditsSheet(
    open = turboCreditsSheetOpen,
    message = turboCreditsSheetMessage,
    onDismiss = onDismissTurboCredits,
    onGetCredits = onGetTurboCredits,
  )
}
