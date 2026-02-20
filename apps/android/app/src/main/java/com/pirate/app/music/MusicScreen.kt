package com.pirate.app.music

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.pirate.app.player.PlayerController
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@Composable
fun MusicScreen(
  player: PlayerController,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  onShowMessage: (String) -> Unit,
  onOpenPlayer: () -> Unit,
  onOpenDrawer: () -> Unit,
  onOpenSongPage: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtistPage: ((artistName: String) -> Unit)? = null,
  hostActivity: androidx.fragment.app.FragmentActivity? = null,
  tempoAccount: com.pirate.app.tempo.TempoPasskeyManager.PasskeyAccount? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  val currentTrack by player.currentTrack.collectAsState()
  val isPlaying by player.isPlaying.collectAsState()

  var view by rememberSaveable { mutableStateOf(MusicView.Home) }
  var searchQuery by rememberSaveable { mutableStateOf("") }
  var recentPublishedReleases by remember { mutableStateOf<List<AlbumCardModel>>(emptyList()) }
  var recentPublishedReleasesLoading by remember { mutableStateOf(true) }
  var recentPublishedReleasesError by remember { mutableStateOf<String?>(null) }

  val permission = if (Build.VERSION.SDK_INT >= 33) {
    Manifest.permission.READ_MEDIA_AUDIO
  } else {
    @Suppress("DEPRECATION")
    Manifest.permission.READ_EXTERNAL_STORAGE
  }

  fun computeHasPermission(): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == android.content.pm.PackageManager.PERMISSION_GRANTED
  }

  var hasPermission by remember { mutableStateOf(computeHasPermission()) }
  var tracks by remember { mutableStateOf<List<MusicTrack>>(emptyList()) }
  var scanning by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  var playlistsLoading by remember { mutableStateOf(false) }
  var localPlaylists by remember { mutableStateOf<List<LocalPlaylist>>(emptyList()) }
  var onChainPlaylists by remember { mutableStateOf<List<OnChainPlaylist>>(emptyList()) }
  var selectedPlaylist by remember { mutableStateOf<PlaylistDisplayItem?>(null) }
  var selectedPlaylistId by rememberSaveable { mutableStateOf<String?>(null) }
  var playlistDetailLoading by remember { mutableStateOf(false) }
  var playlistDetailError by remember { mutableStateOf<String?>(null) }
  var playlistDetailTracks by remember { mutableStateOf<List<MusicTrack>>(emptyList()) }

  var sharedLoading by remember { mutableStateOf(false) }
  var sharedError by remember { mutableStateOf<String?>(null) }
  var sharedPlaylists by remember { mutableStateOf(SharedWithYouCache.playlists) }
  var sharedTracks by remember { mutableStateOf(SharedWithYouCache.tracks) }

  var sharedSelectedPlaylist by remember { mutableStateOf<PlaylistShareEntry?>(null) }
  var sharedPlaylistLoading by remember { mutableStateOf(false) }
  var sharedPlaylistRefreshing by remember { mutableStateOf(false) }
  var sharedPlaylistError by remember { mutableStateOf<String?>(null) }
  var sharedPlaylistTracks by remember { mutableStateOf<List<SharedCloudTrack>>(emptyList()) }
  var sharedPlaylistKey by remember { mutableStateOf<String?>(null) }
  var sharedPlaylistMenuOpen by remember { mutableStateOf(false) }

  var cloudPlayBusy by remember { mutableStateOf(false) }
  var cloudPlayLabel by remember { mutableStateOf<String?>(null) }

  var trackMenuOpen by remember { mutableStateOf(false) }
  var selectedTrack by remember { mutableStateOf<MusicTrack?>(null) }

  var addToPlaylistOpen by remember { mutableStateOf(false) }
  var createPlaylistOpen by remember { mutableStateOf(false) }
  var shareTrack by remember { mutableStateOf<MusicTrack?>(null) }

  var uploadBusy by remember { mutableStateOf(false) }
  var turboCreditsSheetOpen by remember { mutableStateOf(false) }
  var turboCreditsSheetMessage by remember {
    mutableStateOf(TURBO_CREDITS_COPY)
  }

  var autoSyncJob by remember { mutableStateOf<Job?>(null) }

  var sharedLastFetchAtMs by remember { mutableStateOf(SharedWithYouCache.lastFetchAtMs) }
  val sharedOwnerLabels = remember { mutableStateMapOf<String, String>() }
  var sharedSeenItemIds by remember { mutableStateOf<Set<String>>(emptySet()) }
  var downloadedTracksByContentId by remember { mutableStateOf<Map<String, DownloadedTrackEntry>>(emptyMap()) }
  val sharedItemIds = remember(sharedPlaylists, sharedTracks) { computeSharedItemIds(sharedPlaylists, sharedTracks) }
  val sharedUnreadCount = remember(sharedItemIds, sharedSeenItemIds) { sharedItemIds.count { !sharedSeenItemIds.contains(it) } }

  suspend fun runLibraryScan(silent: Boolean) {
    runScan(
      context = context,
      onShowMessage = onShowMessage,
      silent = silent,
      setScanning = { scanning = it },
      setTracks = { tracks = it },
      setError = { error = it },
    )
  }

  suspend fun downloadSharedTrackToDevice(
    t: SharedCloudTrack,
    notify: Boolean = true,
  ): Boolean {
    return downloadSharedTrackToDeviceWithUi(
      context = context,
      track = t,
      notify = notify,
      isAuthenticated = isAuthenticated,
      ownerEthAddress = ownerEthAddress,
      downloadedEntries = downloadedTracksByContentId,
      cloudPlayBusy = cloudPlayBusy,
      onSetCloudPlayBusy = { cloudPlayBusy = it },
      onSetCloudPlayLabel = { cloudPlayLabel = it },
      onSetDownloadedEntries = { downloadedTracksByContentId = it },
      onShowMessage = onShowMessage,
      onRunScan = {
        runLibraryScan(silent = true)
      },
    )
  }

  val requestPermission = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.RequestPermission(),
    onResult = { ok ->
      hasPermission = ok
      if (ok) {
        scope.launch { runLibraryScan(silent = true) }
      }
    },
  )

  suspend fun loadPlaylists() {
    playlistsLoading = true
    val result = loadPlaylistsData(
      context = context,
      isAuthenticated = isAuthenticated,
      ownerEthAddress = ownerEthAddress,
    )
    localPlaylists = result.localPlaylists
    onChainPlaylists = result.onChainPlaylists
    playlistsLoading = false
  }

  suspend fun loadPlaylistDetail(playlist: PlaylistDisplayItem) {
    playlistDetailLoading = true
    playlistDetailError = null
    val result = loadPlaylistDetailTracks(
      playlist = playlist,
      localPlaylists = localPlaylists,
      libraryTracks = tracks,
    )
    playlistDetailTracks = result.tracks
    playlistDetailError = result.error
    playlistDetailLoading = false
  }

  suspend fun loadShared(force: Boolean) {
    refreshSharedLibraryWithUi(
      force = force,
      isAuthenticated = isAuthenticated,
      ownerEthAddress = ownerEthAddress,
      sharedLoading = sharedLoading,
      sharedPlaylists = sharedPlaylists,
      sharedTracks = sharedTracks,
      sharedLastFetchAtMs = sharedLastFetchAtMs,
      ttlMs = SHARED_REFRESH_TTL_MS,
      onSetSharedError = { sharedError = it },
      onSetSharedLoading = { sharedLoading = it },
      onSetSharedPlaylists = { sharedPlaylists = it },
      onSetSharedTracks = { sharedTracks = it },
      onSetSharedLastFetchAtMs = { sharedLastFetchAtMs = it },
    )
  }

  suspend fun loadSharedPlaylistTracks(share: PlaylistShareEntry, force: Boolean) {
    refreshSharedPlaylistTracksWithUi(
      share = share,
      force = force,
      sharedPlaylistLoading = sharedPlaylistLoading,
      sharedPlaylistRefreshing = sharedPlaylistRefreshing,
      ttlMs = SHARED_REFRESH_TTL_MS,
      currentSharedPlaylistKey = { sharedPlaylistKey },
      onSetSharedPlaylistError = { sharedPlaylistError = it },
      onSetSharedPlaylistKey = { sharedPlaylistKey = it },
      onSetSharedPlaylistTracks = { sharedPlaylistTracks = it },
      onSetSharedPlaylistLoading = { sharedPlaylistLoading = it },
      onSetSharedPlaylistRefreshing = { sharedPlaylistRefreshing = it },
    )
  }

  val displayPlaylists = remember(localPlaylists, onChainPlaylists) { toDisplayItems(localPlaylists, onChainPlaylists) }
  MusicScreenLaunchEffects(
    context = context,
    newReleasesMax = HOME_NEW_RELEASES_MAX,
    view = view,
    ownerEthAddress = ownerEthAddress,
    isAuthenticated = isAuthenticated,
    hasPermission = hasPermission,
    sharedSelectedPlaylist = sharedSelectedPlaylist,
    sharedPlaylists = sharedPlaylists,
    sharedItemIds = sharedItemIds,
    sharedSeenItemIds = sharedSeenItemIds,
    sharedOwnerLabels = sharedOwnerLabels,
    onSetTracks = { tracks = it },
    onSetDownloadedTracksByContentId = { downloadedTracksByContentId = it },
    onSetSharedSeenItemIds = { sharedSeenItemIds = it },
    onSetRecentPublishedReleases = { recentPublishedReleases = it },
    onSetRecentPublishedReleasesLoading = { recentPublishedReleasesLoading = it },
    onSetRecentPublishedReleasesError = { recentPublishedReleasesError = it },
    onLoadPlaylists = { loadPlaylists() },
    onLoadShared = { force -> loadShared(force) },
    onLoadSharedPlaylistTracks = { share, force -> loadSharedPlaylistTracks(share, force) },
    onRunSilentScan = { runLibraryScan(silent = true) },
  )

  MusicScreenMediaObserverEffect(
    context = context,
    scope = scope,
    hasPermission = hasPermission,
    autoSyncJob = autoSyncJob,
    onSetAutoSyncJob = { autoSyncJob = it },
    onRunSilentScan = {
      runLibraryScan(silent = true)
    },
  )

  MusicScreenRouteHost(
    view = view,
    onViewChange = { view = it },
    sharedPlaylists = sharedPlaylists,
    sharedTracks = sharedTracks,
    sharedUnreadCount = sharedUnreadCount,
    displayPlaylists = displayPlaylists,
    newReleases = mergedNewReleases(recentPublishedReleases),
    newReleasesLoading = recentPublishedReleasesLoading,
    newReleasesError = recentPublishedReleasesError,
    onOpenDrawer = onOpenDrawer,
    onShowMessage = onShowMessage,
    onPlayRelease = { release ->
      playNewReleaseWithUi(
        release = release,
        player = player,
        onOpenPlayer = onOpenPlayer,
        onShowMessage = onShowMessage,
      )
    },
    player = player,
    currentTrackId = currentTrack?.id,
    isPlaying = isPlaying,
    onOpenPlayer = onOpenPlayer,
    hasPermission = hasPermission,
    tracks = tracks,
    scanning = scanning,
    libraryError = error,
    onRequestPermission = { requestPermission.launch(permission) },
    onScan = {
      scope.launch {
        runLibraryScan(silent = false)
      }
    },
    onOpenTrackMenu = { track ->
      selectedTrack = track
      trackMenuOpen = true
    },
    searchQuery = searchQuery,
    onSearchQueryChange = { searchQuery = it },
    sharedLoading = sharedLoading,
    sharedError = sharedError,
    isAuthenticated = isAuthenticated,
    ownerLabelFor = { owner -> sharedOwnerLabel(ownerAddress = owner, sharedOwnerLabels = sharedOwnerLabels) },
    onRefreshShared = { scope.launch { loadShared(force = true) } },
    onOpenSharedPlaylist = { playlist ->
      sharedSelectedPlaylist = playlist
      view = MusicView.SharedPlaylistDetail
    },
    onPlaySharedTrack = { track ->
      scope.launch {
        playSharedCloudTrackWithUi(
          context = context,
          ownerEthAddress = ownerEthAddress,
          track = track,
          isAuthenticated = isAuthenticated,
          downloadedEntries = downloadedTracksByContentId,
          cloudPlayBusy = cloudPlayBusy,
          onSetCloudPlayBusy = { cloudPlayBusy = it },
          onSetCloudPlayLabel = { cloudPlayLabel = it },
          onSetDownloadedEntries = { downloadedTracksByContentId = it },
          onShowMessage = onShowMessage,
          onPlayTrack = { selected ->
            player.playTrack(selected, listOf(selected))
            onOpenPlayer()
          },
        )
      }
    },
    onDownloadSharedTrack = { track -> scope.launch { downloadSharedTrackToDevice(track, notify = true) } },
    playlistsLoading = playlistsLoading,
    onCreatePlaylist = { createPlaylistOpen = true },
    onOpenPlaylist = { playlist ->
      openPlaylistDetailWithUi(
        playlist = playlist,
        onSetSelectedPlaylist = { selectedPlaylist = it },
        onSetSelectedPlaylistId = { selectedPlaylistId = it },
        onSetView = { view = it },
        onLoadPlaylistDetail = { selected ->
          loadPlaylistDetail(selected)
        },
        scope = scope,
      )
    },
    selectedPlaylist = selectedPlaylist,
    selectedPlaylistId = selectedPlaylistId,
    onSelectedPlaylistChange = { selectedPlaylist = it },
    playlistDetailLoading = playlistDetailLoading,
    playlistDetailError = playlistDetailError,
    playlistDetailTracks = playlistDetailTracks,
    onLoadPlaylistDetail = { playlist -> loadPlaylistDetail(playlist) },
    onChangePlaylistCover = { playlist, coverUri ->
      changePlaylistCoverWithUi(
        context = context,
        hostActivity = hostActivity,
        playlist = playlist,
        coverUri = coverUri,
        ownerEthAddress = ownerEthAddress,
        isAuthenticated = isAuthenticated,
        tempoAccount = tempoAccount,
        onChainPlaylists = onChainPlaylists,
        selectedPlaylistId = selectedPlaylistId,
        selectedPlaylist = selectedPlaylist,
        onSetOnChainPlaylists = { onChainPlaylists = it },
        onSetSelectedPlaylist = { selectedPlaylist = it },
        onShowMessage = onShowMessage,
      )
    },
    onSharePlaylistToWallet = { playlist, recipient ->
      sharePlaylistToWalletWithUi(
        context = context,
        hostActivity = hostActivity,
        playlist = playlist,
        recipientInput = recipient,
        ownerEthAddress = ownerEthAddress,
        isAuthenticated = isAuthenticated,
        tempoAccount = tempoAccount,
        onShowMessage = onShowMessage,
      )
    },
    onDeletePlaylist = { playlist ->
      deletePlaylistWithUi(
        context = context,
        hostActivity = hostActivity,
        playlist = playlist,
        ownerEthAddress = ownerEthAddress,
        isAuthenticated = isAuthenticated,
        tempoAccount = tempoAccount,
        onChainPlaylists = onChainPlaylists,
        selectedPlaylistId = selectedPlaylistId,
        onSetOnChainPlaylists = { onChainPlaylists = it },
        onSelectedPlaylistDeleted = {
          selectedPlaylist = null
          selectedPlaylistId = null
          playlistDetailTracks = emptyList()
          playlistDetailError = null
          playlistDetailLoading = false
          view = MusicView.Playlists
        },
        onShowMessage = onShowMessage,
      )
    },
    sharedSelectedPlaylist = sharedSelectedPlaylist,
    sharedPlaylistMenuOpen = sharedPlaylistMenuOpen,
    onSharedPlaylistMenuOpenChange = { sharedPlaylistMenuOpen = it },
    sharedPlaylistTracks = sharedPlaylistTracks,
    sharedPlaylistLoading = sharedPlaylistLoading,
    sharedPlaylistRefreshing = sharedPlaylistRefreshing,
    sharedPlaylistError = sharedPlaylistError,
    sharedByLabel = sharedSelectedPlaylist?.let { sharedOwnerLabel(ownerAddress = it.owner, sharedOwnerLabels = sharedOwnerLabels) },
    onRefreshSharedPlaylist = { share -> scope.launch { loadSharedPlaylistTracks(share, force = true) } },
    onDownloadAllSharedPlaylist = {
      downloadAllSharedPlaylistTracksWithUi(
        tracks = sharedPlaylistTracks,
        onSetCloudPlayLabel = { cloudPlayLabel = it },
        onDownloadTrack = { track ->
          downloadSharedTrackToDevice(track, notify = false)
        },
        onShowMessage = onShowMessage,
      )
    },
    cloudPlayBusy = cloudPlayBusy,
    cloudPlayLabel = cloudPlayLabel,
  )

  MusicScreenOverlayHost(
    trackMenuOpen = trackMenuOpen,
    selectedTrack = selectedTrack,
    ownerEthAddress = ownerEthAddress,
    isAuthenticated = isAuthenticated,
    hostActivity = hostActivity,
    tempoAccount = tempoAccount,
    tracks = tracks,
    downloadedTracksByContentId = downloadedTracksByContentId,
    uploadBusy = uploadBusy,
    turboCreditsCopy = TURBO_CREDITS_COPY,
    onUploadBusyChange = { uploadBusy = it },
    onTracksChange = { tracks = it },
    onOpenShare = { shareTrack = it },
    onOpenAddToPlaylist = {
      selectedTrack = it
      addToPlaylistOpen = true
    },
    onCloseTrackMenu = { trackMenuOpen = false },
    onPromptTurboTopUp = {
      turboCreditsSheetMessage = it
      turboCreditsSheetOpen = true
    },
    onShowMessage = onShowMessage,
    onRescanAfterDownload = {
      runLibraryScan(silent = true)
    },
    onOpenSongPage = onOpenSongPage,
    onOpenArtistPage = onOpenArtistPage,
    createPlaylistOpen = createPlaylistOpen,
    addToPlaylistOpen = addToPlaylistOpen,
    onCreatePlaylistOpenChange = { createPlaylistOpen = it },
    onAddToPlaylistOpenChange = { addToPlaylistOpen = it },
    onCreatePlaylistSuccess = { playlistId, successMessage ->
      scope.launch {
        handleCreatePlaylistSuccessWithUi(
          playlistId = playlistId,
          successMessage = successMessage,
          displayPlaylists = displayPlaylists,
          onLoadPlaylists = { loadPlaylists() },
          onSetSelectedPlaylistId = { selectedPlaylistId = it },
          onSetSelectedPlaylist = { selectedPlaylist = it },
          onSetView = { view = it },
          onLoadPlaylistDetail = { selected ->
            loadPlaylistDetail(selected)
          },
          onShowMessage = onShowMessage,
        )
      }
    },
    onAddToPlaylistSuccess = { playlistId ->
      scope.launch {
        handleAddToPlaylistSuccessWithUi(
          playlistId = playlistId,
          currentView = view,
          displayPlaylists = displayPlaylists,
          onLoadPlaylists = { loadPlaylists() },
          onSetSelectedPlaylistId = { selectedPlaylistId = it },
          onSetSelectedPlaylist = { selectedPlaylist = it },
          selectedPlaylistId = selectedPlaylistId,
          onLoadPlaylistDetail = { selected ->
            loadPlaylistDetail(selected)
          },
        )
      }
    },
    shareTrack = shareTrack,
    onDismissShare = { shareTrack = null },
    turboCreditsSheetOpen = turboCreditsSheetOpen,
    turboCreditsSheetMessage = turboCreditsSheetMessage,
    onDismissTurboCredits = { turboCreditsSheetOpen = false },
    onGetTurboCredits = {
      turboCreditsSheetOpen = false
      openTurboTopUpUrl(
        context = context,
        onShowMessage = onShowMessage,
      )
    },
  )
}
