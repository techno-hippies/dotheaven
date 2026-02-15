package com.pirate.app.music

import android.Manifest
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import com.pirate.app.music.ui.AddToPlaylistSheet
import com.pirate.app.music.ui.CreatePlaylistSheet
import com.pirate.app.music.ui.TrackItemRow
import com.pirate.app.music.ui.TrackMenuSheet
import com.pirate.app.player.PlayerController
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class MusicView { Home, Library, Shared, Playlists, Search }

private data class SharedTrack(
  val title: String,
  val artist: String,
  val album: String,
  val sharedFrom: String,
)

private val SHARED_TRACKS = listOf(
  SharedTrack(title = "Breathe", artist = "Telepopmusik", album = "Angel Milk", sharedFrom = "alice.pirate"),
  SharedTrack(title = "Midnight City", artist = "M83", album = "Hurry Up, We Are Dreaming", sharedFrom = "bob.pirate"),
)

private data class AlbumCardModel(
  val title: String,
  val artist: String,
)

private val TRENDING = listOf(
  AlbumCardModel(title = "Midnight Dreams", artist = "Luna Sky"),
  AlbumCardModel(title = "Electric Hearts", artist = "Neon Pulse"),
  AlbumCardModel(title = "Summer Waves", artist = "Golden Ray"),
  AlbumCardModel(title = "Starlight", artist = "Cosmos"),
)

private val NEW_RELEASES = listOf(
  AlbumCardModel(title = "Electric Bloom", artist = "Galaxy Ray"),
  AlbumCardModel(title = "Pulse Drive", artist = "Hyper Flux"),
  AlbumCardModel(title = "Neon Rain", artist = "Drift Wave"),
)

private val TOP_ARTISTS = listOf(
  "Luna Sky",
  "Neon Pulse",
  "Ocean Skin",
  "Sunset Crew",
)

private const val IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs/"

@Composable
fun MusicScreen(
  player: PlayerController,
  litNetwork: String,
  litRpcUrl: String,
  pkpPublicKey: String?,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  onShowMessage: (String) -> Unit,
  onOpenPlayer: () -> Unit,
  onOpenDrawer: () -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  val currentTrack by player.currentTrack.collectAsState()
  val isPlaying by player.isPlaying.collectAsState()

  var view by rememberSaveable { mutableStateOf(MusicView.Home) }
  var searchQuery by rememberSaveable { mutableStateOf("") }

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

  var trackMenuOpen by remember { mutableStateOf(false) }
  var selectedTrack by remember { mutableStateOf<MusicTrack?>(null) }

  var addToPlaylistOpen by remember { mutableStateOf(false) }
  var createPlaylistOpen by remember { mutableStateOf(false) }

  var uploadBusy by remember { mutableStateOf(false) }

  var autoSyncJob by remember { mutableStateOf<Job?>(null) }

  val requestPermission = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.RequestPermission(),
    onResult = { ok ->
      hasPermission = ok
      if (ok) {
        scope.launch { runScan(context, onShowMessage, silent = true, setScanning = { scanning = it }, setTracks = { tracks = it }, setError = { error = it }) }
      }
    },
  )

  suspend fun loadPlaylists() {
    playlistsLoading = true
    val local = runCatching { LocalPlaylistsStore.getLocalPlaylists(context) }.getOrElse { emptyList() }
    localPlaylists = local

    onChainPlaylists =
      if (isAuthenticated && !ownerEthAddress.isNullOrBlank()) {
        runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ownerEthAddress) }.getOrElse { emptyList() }
      } else {
        emptyList()
      }

    playlistsLoading = false
  }

  fun toDisplayItems(local: List<LocalPlaylist>, onChain: List<OnChainPlaylist>): List<PlaylistDisplayItem> {
    val out = ArrayList<PlaylistDisplayItem>(local.size + onChain.size)
    for (lp in local) {
      out.add(
        PlaylistDisplayItem(
          id = lp.id,
          name = lp.name,
          trackCount = lp.tracks.size,
          coverUri = lp.coverUri ?: lp.tracks.firstOrNull()?.artworkUri,
          isLocal = true,
        ),
      )
    }
    for (p in onChain) {
      out.add(
        PlaylistDisplayItem(
          id = p.id,
          name = p.name,
          trackCount = p.trackCount,
          coverUri = p.coverCid.ifBlank { null }?.let { cid ->
            "${IPFS_GATEWAY}${cid}?img-width=140&img-height=140&img-format=webp&img-quality=80"
          },
          isLocal = false,
        ),
      )
    }
    return out
  }

  val displayPlaylists = remember(localPlaylists, onChainPlaylists) { toDisplayItems(localPlaylists, onChainPlaylists) }

  LaunchedEffect(Unit) {
    tracks = MusicLibrary.loadCachedTracks(context)
    loadPlaylists()
    // Background refresh once on open when permitted.
    if (hasPermission) {
      scope.launch { runScan(context, onShowMessage, silent = true, setScanning = { scanning = it }, setTracks = { tracks = it }, setError = { error = it }) }
    }
  }

  LaunchedEffect(ownerEthAddress, isAuthenticated) {
    loadPlaylists()
  }

  DisposableEffect(hasPermission) {
    if (!hasPermission) {
      return@DisposableEffect onDispose {}
    }

    val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        autoSyncJob?.cancel()
        autoSyncJob = scope.launch {
          delay(1200)
          runScan(context, onShowMessage, silent = true, setScanning = { scanning = it }, setTracks = { tracks = it }, setError = { error = it })
        }
      }
    }
    context.contentResolver.registerContentObserver(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true, observer)
    onDispose {
      runCatching { context.contentResolver.unregisterContentObserver(observer) }
      autoSyncJob?.cancel()
      autoSyncJob = null
    }
  }

  Column(modifier = Modifier.fillMaxSize()) {
    when (view) {
      MusicView.Home -> {
        PirateMobileHeader(
          title = "Music",
          isAuthenticated = isAuthenticated,
          onAvatarPress = onOpenDrawer,
          rightSlot = {
            IconButton(
              onClick = { view = MusicView.Search },
            ) {
              Icon(
                Icons.Rounded.Search,
                contentDescription = "Search",
                tint = MaterialTheme.colorScheme.onBackground,
              )
            }
          },
        )
        MusicHomeView(
          sharedCount = SHARED_TRACKS.size,
          playlistCount = displayPlaylists.size,
          playlists = displayPlaylists,
          onNavigateLibrary = { view = MusicView.Library },
          onNavigateShared = { view = MusicView.Shared },
          onNavigatePlaylists = { view = MusicView.Playlists },
          onOpenPlaylist = { onShowMessage("Open playlist coming soon") },
        )
      }

      MusicView.Library -> {
        PirateMobileHeader(
          title = "Library",
          onBackPress = { view = MusicView.Home },
          rightSlot = {
            IconButton(onClick = { view = MusicView.Search }) {
              Icon(
                Icons.Rounded.Search,
                contentDescription = "Search",
                tint = MaterialTheme.colorScheme.onBackground,
              )
            }
          },
        )
        LibraryView(
          hasPermission = hasPermission,
          requestPermission = { requestPermission.launch(permission) },
          tracks = tracks,
          scanning = scanning,
          error = error,
          currentTrackId = currentTrack?.id,
          isPlaying = isPlaying,
          onScan = {
            scope.launch {
              runScan(
                context,
                onShowMessage,
                silent = false,
                setScanning = { scanning = it },
                setTracks = { tracks = it },
                setError = { error = it },
              )
            }
          },
          onPlayTrack = { t ->
            if (currentTrack?.id == t.id) {
              player.togglePlayPause()
            } else {
              player.playTrack(t, tracks)
            }
            onOpenPlayer()
          },
          onTrackMenu = { t ->
            selectedTrack = t
            trackMenuOpen = true
          },
        )
      }

      MusicView.Search -> {
        PirateMobileHeader(
          title = "Search",
          onBackPress = {
            searchQuery = ""
            view = MusicView.Home
          },
        )
        SearchView(
          query = searchQuery,
          onQueryChange = { searchQuery = it },
          tracks = tracks,
          currentTrackId = currentTrack?.id,
          isPlaying = isPlaying,
          onPlayTrack = { t ->
            if (currentTrack?.id == t.id) {
              player.togglePlayPause()
            } else {
              player.playTrack(t, tracks)
            }
            onOpenPlayer()
          },
          onTrackMenu = { t ->
            selectedTrack = t
            trackMenuOpen = true
          },
        )
      }

      MusicView.Shared -> {
        PirateMobileHeader(
          title = "Shared With You",
          onBackPress = { view = MusicView.Home },
          rightSlot = {
            if (SHARED_TRACKS.isNotEmpty()) {
              Surface(
                color = MaterialTheme.colorScheme.primary,
                shape = MaterialTheme.shapes.extraLarge,
              ) {
                Text(
                  text = "${SHARED_TRACKS.size} new",
                  modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                  color = MaterialTheme.colorScheme.onPrimary,
                  style = MaterialTheme.typography.labelMedium,
                  fontWeight = FontWeight.SemiBold,
                )
              }
            }
          },
        )
        SharedView(
          sharedTracks = SHARED_TRACKS,
          onShowMessage = onShowMessage,
        )
      }

      MusicView.Playlists -> {
        PirateMobileHeader(
          title = "Playlists",
          onBackPress = { view = MusicView.Home },
          rightSlot = {
            IconButton(onClick = { createPlaylistOpen = true }) {
              Icon(
                Icons.Rounded.Add,
                contentDescription = "Create playlist",
                tint = MaterialTheme.colorScheme.onBackground,
              )
            }
          },
        )
        PlaylistsView(
          loading = playlistsLoading,
          playlists = displayPlaylists,
          onOpenPlaylist = { onShowMessage("Open playlist coming soon") },
        )
      }
    }
  }

  TrackMenuSheet(
    open = trackMenuOpen,
    track = selectedTrack,
    onClose = { trackMenuOpen = false },
    onUpload = { t ->
      if (uploadBusy) {
        onShowMessage("Upload already in progress")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || pkpPublicKey.isNullOrBlank() || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to upload")
        return@TrackMenuSheet
      }

      uploadBusy = true
      scope.launch {
        onShowMessage("Uploading...")
        val result =
          runCatching {
            TrackUploadService.uploadAndRegisterEncrypted(
              context = context,
              litNetwork = litNetwork,
              litRpcUrl = litRpcUrl,
              userPkpPublicKey = pkpPublicKey,
              ownerEthAddress = ownerEthAddress,
              track = t,
            )
          }
        uploadBusy = false

        result.onFailure { err ->
          onShowMessage("Upload failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val next =
            tracks.map { tr ->
              if (tr.id != t.id) tr
              else
                tr.copy(
                  contentId = ok.contentId,
                  pieceCid = ok.pieceCid,
                  datasetOwner = ok.datasetOwner,
                  algo = ok.algo,
                )
            }
          tracks = next
          MusicLibrary.saveCachedTracks(context, next)

          if (ok.register.success) {
            onShowMessage("Uploaded.")
          } else {
            onShowMessage("Uploaded, but on-chain register failed: ${ok.register.error ?: "unknown error"}")
          }
        }
      }
    },
    onSaveForever = { t ->
      if (uploadBusy) {
        onShowMessage("Upload already in progress")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || pkpPublicKey.isNullOrBlank() || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to save forever")
        return@TrackMenuSheet
      }
      if (t.savedForever) {
        onShowMessage("Already saved forever")
        return@TrackMenuSheet
      }

      uploadBusy = true
      scope.launch {
        if (!t.pieceCid.isNullOrBlank()) {
          uploadBusy = false
          val next = tracks.map { tr -> if (tr.id == t.id) tr.copy(savedForever = true) else tr }
          tracks = next
          MusicLibrary.saveCachedTracks(context, next)
          onShowMessage("Marked Saved Forever (already uploaded).")
          return@launch
        }

        onShowMessage("Saving Forever...")
        val result =
          runCatching {
            TrackUploadService.uploadAndRegisterEncrypted(
              context = context,
              litNetwork = litNetwork,
              litRpcUrl = litRpcUrl,
              userPkpPublicKey = pkpPublicKey,
              ownerEthAddress = ownerEthAddress,
              track = t,
            )
          }
        uploadBusy = false

        result.onFailure { err ->
          onShowMessage("Save Forever failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val next =
            tracks.map { tr ->
              if (tr.id != t.id) tr
              else {
                val base =
                  tr.copy(
                    contentId = ok.contentId,
                    pieceCid = ok.pieceCid,
                    datasetOwner = ok.datasetOwner,
                    algo = ok.algo,
                  )

                if (ok.register.success) base.copy(savedForever = true) else base
              }
            }
          tracks = next
          MusicLibrary.saveCachedTracks(context, next)

          if (ok.register.success) {
            onShowMessage("Upload complete and saved forever.")
          } else {
            onShowMessage("Upload complete, but on-chain register failed: ${ok.register.error ?: "unknown error"}")
          }
        }
      }
    },
    onAddToPlaylist = { t ->
      selectedTrack = t
      addToPlaylistOpen = true
    },
    onAddToQueue = { onShowMessage("Add to queue coming soon") },
    onGoToAlbum = { onShowMessage("Album view coming soon") },
    onGoToArtist = { onShowMessage("Artist view coming soon") },
  )

  CreatePlaylistSheet(
    open = createPlaylistOpen,
    isAuthenticated = isAuthenticated,
    ownerEthAddress = ownerEthAddress,
    pkpPublicKey = pkpPublicKey,
    litNetwork = litNetwork,
    litRpcUrl = litRpcUrl,
    onClose = { createPlaylistOpen = false },
    onShowMessage = onShowMessage,
    onSuccess = { _, _ -> scope.launch { loadPlaylists() } },
  )

  AddToPlaylistSheet(
    open = addToPlaylistOpen,
    track = selectedTrack,
    isAuthenticated = isAuthenticated,
    ownerEthAddress = ownerEthAddress,
    pkpPublicKey = pkpPublicKey,
    litNetwork = litNetwork,
    litRpcUrl = litRpcUrl,
    onClose = { addToPlaylistOpen = false },
    onShowMessage = onShowMessage,
    onSuccess = { _, _ ->
      scope.launch {
        loadPlaylists()
        view = MusicView.Playlists
      }
    },
  )
}

@Composable
private fun MusicHomeView(
  sharedCount: Int,
  playlistCount: Int,
  playlists: List<PlaylistDisplayItem>,
  onNavigateLibrary: () -> Unit,
  onNavigateShared: () -> Unit,
  onNavigatePlaylists: () -> Unit,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 16.dp),
  ) {
    item {
      Column(modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)) {
        EntryRow(
          icon = Icons.AutoMirrored.Rounded.List,
          iconTint = MaterialTheme.colorScheme.onSecondaryContainer,
          iconBg = MaterialTheme.colorScheme.secondaryContainer,
          title = "Library",
          subtitle = "Local + Cloud",
          badge = null,
          onClick = onNavigateLibrary,
        )
        EntryRow(
          icon = Icons.Rounded.Inbox,
          iconTint = MaterialTheme.colorScheme.onPrimaryContainer,
          iconBg = MaterialTheme.colorScheme.primaryContainer,
          title = "Shared With You",
          subtitle = "$sharedCount song${if (sharedCount == 1) "" else "s"}",
          badge = if (sharedCount > 0) "$sharedCount new" else null,
          onClick = onNavigateShared,
        )
        EntryRow(
          icon = Icons.AutoMirrored.Rounded.PlaylistPlay,
          iconTint = MaterialTheme.colorScheme.onTertiary,
          iconBg = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.18f),
          title = "Playlists",
          subtitle = "$playlistCount playlist${if (playlistCount == 1) "" else "s"}",
          badge = null,
          onClick = onNavigatePlaylists,
        )
      }
    }

    item {
      SectionHeader(title = "Trending", action = "See all", onAction = { /* TODO */ })
      LazyRow(
        contentPadding = PaddingValues(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(TRENDING) { item ->
          AlbumCard(title = item.title, artist = item.artist)
        }
      }
      Spacer(modifier = Modifier.height(28.dp))
    }

    item {
      SectionHeader(title = "New Releases", action = "See all", onAction = { /* TODO */ })
      LazyRow(
        contentPadding = PaddingValues(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(NEW_RELEASES) { item ->
          AlbumCard(title = item.title, artist = item.artist)
        }
      }
      Spacer(modifier = Modifier.height(28.dp))
    }

    item {
      SectionHeader(title = "Top Artists", action = "See all", onAction = { /* TODO */ })
      LazyRow(
        contentPadding = PaddingValues(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(TOP_ARTISTS) { name ->
          ArtistCircle(name = name)
        }
      }
      Spacer(modifier = Modifier.height(28.dp))
    }

    if (playlists.isNotEmpty()) {
      item {
        SectionHeader(title = "Your Playlists", action = "See all", onAction = onNavigatePlaylists)
        LazyRow(
          contentPadding = PaddingValues(horizontal = 20.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          items(playlists.take(6)) { pl ->
            PlaylistCard(playlist = pl, onClick = { onOpenPlaylist(pl) })
          }
        }
        Spacer(modifier = Modifier.height(12.dp))
      }
    }
  }
}

@Composable
private fun EntryRow(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  iconTint: Color,
  iconBg: Color,
  title: String,
  subtitle: String,
  badge: String?,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      modifier = Modifier
        .size(48.dp)
        .clip(MaterialTheme.shapes.medium)
        .padding(0.dp),
      contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
      Surface(
        modifier = Modifier.fillMaxSize(),
        color = iconBg,
        shape = MaterialTheme.shapes.medium,
      ) {
        Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
          Icon(icon, contentDescription = null, tint = iconTint)
        }
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Text(title, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onBackground)
      Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }

    if (!badge.isNullOrBlank()) {
      Surface(
        color = MaterialTheme.colorScheme.primary,
        shape = MaterialTheme.shapes.extraLarge,
      ) {
        Text(
          badge,
          modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
          color = MaterialTheme.colorScheme.onPrimary,
          style = MaterialTheme.typography.labelMedium,
          fontWeight = FontWeight.SemiBold,
        )
      }
    } else {
      Icon(
        Icons.Rounded.ChevronRight,
        contentDescription = null,
        tint = PiratePalette.TextMuted,
      )
    }
  }
}

@Composable
private fun SectionHeader(
  title: String,
  action: String? = null,
  onAction: (() -> Unit)? = null,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 20.dp, vertical = 14.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
  ) {
    Text(
      title,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onBackground,
      style = MaterialTheme.typography.titleMedium,
    )
    if (!action.isNullOrBlank() && onAction != null) {
      Text(
        action,
        modifier = Modifier.clickable(onClick = onAction),
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.SemiBold,
      )
    }
  }
}

@Composable
private fun AlbumCard(
  title: String,
  artist: String,
  imageUri: String? = null,
) {
  Column(modifier = Modifier.width(140.dp)) {
    Surface(
      modifier = Modifier.size(140.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.large,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (imageUri.isNullOrBlank()) {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        } else {
          // Keeping this simple for now; covers will be wired when we have real artwork sources.
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        }
      }
    }
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      title,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Medium,
    )
    Text(
      artist,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = PiratePalette.TextMuted,
    )
  }
}

@Composable
private fun ArtistCircle(
  name: String,
  imageUri: String? = null,
) {
  Column(
    modifier = Modifier.width(84.dp),
    horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
  ) {
    Surface(
      modifier = Modifier.size(56.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.extraLarge,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
      }
    }
    Spacer(modifier = Modifier.height(8.dp))
    Text(
      name,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
    )
  }
}

@Composable
private fun PlaylistCard(
  playlist: PlaylistDisplayItem,
  onClick: () -> Unit,
) {
  Column(
    modifier = Modifier
      .width(140.dp)
      .clickable(onClick = onClick),
  ) {
    Surface(
      modifier = Modifier.size(140.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.large,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!playlist.coverUri.isNullOrBlank()) {
          AsyncImage(
            model = playlist.coverUri,
            contentDescription = "Playlist cover",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        }
      }
    }
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      playlist.name,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Medium,
    )
    Text(
      "${playlist.trackCount} track${if (playlist.trackCount == 1) "" else "s"}",
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = PiratePalette.TextMuted,
    )
  }
}

@Composable
private fun LibraryView(
  hasPermission: Boolean,
  requestPermission: () -> Unit,
  tracks: List<MusicTrack>,
  scanning: Boolean,
  error: String?,
  currentTrackId: String?,
  isPlaying: Boolean,
  onScan: () -> Unit,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  if (!hasPermission) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Permission required to read your music library.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      Button(onClick = requestPermission) { Text("Grant Permission") }
    }
    return
  }

  Column(modifier = Modifier.fillMaxSize()) {
    FilterSortBar(
      left = "Filter: All",
      right = "Sort: Recent",
      onLeft = { /* TODO */ },
      onRight = { /* TODO */ },
    )

    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }

    if (tracks.isEmpty() && !scanning) {
      EmptyState(
        title = "No songs in your library yet",
        actionLabel = "Scan device",
        onAction = onScan,
      )
      return
    }

    if (scanning && tracks.isEmpty()) {
      EmptyState(
        title = "Scanning your device...",
        actionLabel = null,
        onAction = null,
      )
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(tracks, key = { it.id }) { t ->
        TrackItemRow(
          track = t,
          isActive = currentTrackId == t.id,
          isPlaying = currentTrackId == t.id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
private fun SearchView(
  query: String,
  onQueryChange: (String) -> Unit,
  tracks: List<MusicTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  val focusRequester = remember { FocusRequester() }
  LaunchedEffect(Unit) { focusRequester.requestFocus() }

  val q = query.trim()
  val results =
    remember(tracks, q) {
      if (q.isBlank()) {
        tracks
      } else {
        val needle = q.lowercase()
        tracks.filter { t ->
          t.title.lowercase().contains(needle) ||
            t.artist.lowercase().contains(needle) ||
            t.album.lowercase().contains(needle)
        }
      }
    }

  Column(modifier = Modifier.fillMaxSize()) {
    OutlinedTextField(
      value = query,
      onValueChange = onQueryChange,
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 10.dp)
        .focusRequester(focusRequester),
      singleLine = true,
      placeholder = { Text("Search your library") },
    )

    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(results, key = { it.id }) { t ->
        TrackItemRow(
          track = t,
          isActive = currentTrackId == t.id,
          isPlaying = currentTrackId == t.id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
private fun FilterSortBar(
  left: String,
  right: String,
  onLeft: () -> Unit,
  onRight: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp, vertical = 10.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
  ) {
    FilterSortPill(label = left, onClick = onLeft)
    FilterSortPill(label = right, onClick = onRight)
  }
}

@Composable
private fun FilterSortPill(
  label: String,
  onClick: () -> Unit,
) {
  Surface(
    modifier = Modifier.clickable(onClick = onClick),
    color = MaterialTheme.colorScheme.surfaceVariant,
    shape = MaterialTheme.shapes.extraLarge,
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
      verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Icon(Icons.Rounded.ArrowDropDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun EmptyState(
  title: String,
  actionLabel: String?,
  onAction: (() -> Unit)?,
) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 20.dp, vertical = 28.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text(title, color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold)
    if (!actionLabel.isNullOrBlank() && onAction != null) {
      OutlinedButton(onClick = onAction) {
        Icon(Icons.Rounded.FolderOpen, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.width(8.dp))
        Text(actionLabel, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
      }
    }
  }
}

@Composable
private fun SharedView(
  sharedTracks: List<SharedTrack>,
  onShowMessage: (String) -> Unit,
) {
  Column(modifier = Modifier.fillMaxSize()) {
    FilterSortBar(
      left = "${sharedTracks.size} songs",
      right = "Sort: Recent",
      onLeft = { /* noop */ },
      onRight = { /* TODO */ },
    )

    if (sharedTracks.isEmpty()) {
      EmptyState(title = "Songs shared to you appear here", actionLabel = null, onAction = null)
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(sharedTracks) { t ->
        SharedTrackRow(track = t, onSave = { onShowMessage("Save coming soon") })
      }
      item {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
          text = "Songs shared to you appear here",
          modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
          color = PiratePalette.TextMuted,
        )
      }
    }
  }
}

@Composable
private fun SharedTrackRow(
  track: SharedTrack,
  onSave: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Surface(
      modifier = Modifier.size(48.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.medium,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(18.dp))
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Text(
          track.title,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          fontWeight = FontWeight.Medium,
          color = MaterialTheme.colorScheme.onBackground,
        )
        Surface(color = MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.extraLarge) {
          Text(
            "NEW",
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            color = MaterialTheme.colorScheme.onPrimary,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
          )
        }
      }
      Text(
        "${track.artist} · from ${track.sharedFrom}",
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        color = PiratePalette.TextMuted,
      )
    }

    IconButton(onClick = onSave) {
      Icon(Icons.Rounded.AddCircle, contentDescription = "Save", tint = MaterialTheme.colorScheme.primary)
    }
    IconButton(onClick = { /* TODO */ }) {
      Icon(Icons.Rounded.MoreVert, contentDescription = "Menu", tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun PlaylistsView(
  loading: Boolean,
  playlists: List<PlaylistDisplayItem>,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
) {
  if (loading) {
    EmptyState(title = "Loading playlists...", actionLabel = null, onAction = null)
    return
  }

  if (playlists.isEmpty()) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 20.dp, vertical = 28.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Text("No playlists yet", color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold)
      Text("Add tracks to a playlist from the track menu", color = PiratePalette.TextMuted)
    }
    return
  }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 12.dp),
  ) {
    items(playlists, key = { it.id }) { pl ->
      PlaylistRow(playlist = pl, onClick = { onOpenPlaylist(pl) })
    }
  }
}

@Composable
private fun PlaylistRow(
  playlist: PlaylistDisplayItem,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Surface(
      modifier = Modifier.size(48.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.medium,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!playlist.coverUri.isNullOrBlank()) {
          AsyncImage(
            model = playlist.coverUri,
            contentDescription = "Playlist cover",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(20.dp))
        }
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Text(
        playlist.name,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onBackground,
      )
      Text(
        "${playlist.trackCount} track${if (playlist.trackCount == 1) "" else "s"}",
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        color = PiratePalette.TextMuted,
      )
    }

    if (!playlist.isLocal) {
      Text("on-chain", color = PiratePalette.TextMuted)
    }
  }
}

private suspend fun runScan(
  context: android.content.Context,
  onShowMessage: (String) -> Unit,
  silent: Boolean,
  setScanning: (Boolean) -> Unit,
  setTracks: (List<MusicTrack>) -> Unit,
  setError: (String?) -> Unit,
) {
  // Guard against overlapping scans; `scope` is stable per composition, but callers can still spam.
  // Use the UI state lock for now.
  // (If this becomes flaky, move scanning to a ViewModel with an atomic guard.)
  setScanning(true)
  setError(null)
  val result = runCatching { MusicLibrary.scanDeviceTracks(context) }
  result.onFailure { err ->
    setScanning(false)
    setError(err.message ?: "Failed to scan")
    if (!silent) onShowMessage(err.message ?: "Scan failed")
  }
  result.onSuccess { list ->
    val cached = runCatching { MusicLibrary.loadCachedTracks(context) }.getOrElse { emptyList() }
    val cachedById = cached.associateBy { it.id }
    val merged =
      list.map { scanned ->
        val prior = cachedById[scanned.id] ?: return@map scanned
        scanned.copy(
          contentId = prior.contentId,
          pieceCid = prior.pieceCid,
          datasetOwner = prior.datasetOwner,
          algo = prior.algo,
          savedForever = prior.savedForever,
        )
      }

    setTracks(merged)
    MusicLibrary.saveCachedTracks(context, merged)
    setScanning(false)
  }
}
