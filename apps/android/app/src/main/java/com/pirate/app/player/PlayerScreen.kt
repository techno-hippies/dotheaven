package com.pirate.app.player

import android.content.Intent
import android.content.Context
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.arweave.ArweaveTurboConfig
import com.pirate.app.arweave.TurboCreditsApi
import com.pirate.app.music.DownloadedTracksStore
import com.pirate.app.music.MusicLibrary
import com.pirate.app.music.TrackMenuPolicyResolver
import com.pirate.app.music.TrackSaveForeverService
import com.pirate.app.music.TrackUploadService
import com.pirate.app.music.UploadedTrackActions
import com.pirate.app.music.ui.AddToPlaylistSheet
import com.pirate.app.music.ui.TrackMenuSheet
import com.pirate.app.music.ui.TurboCreditsSheet
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.launch

private const val TURBO_CREDITS_COPY = "Save this song forever on Arweave for ~\$0.03."

@Composable
fun PlayerScreen(
  player: PlayerController,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
  onOpenSongPage: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtistPage: ((String) -> Unit)? = null,
  hostActivity: androidx.fragment.app.FragmentActivity? = null,
  tempoAccount: com.pirate.app.tempo.TempoPasskeyManager.PasskeyAccount? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  val currentTrack by player.currentTrack.collectAsState()
  val isPlaying by player.isPlaying.collectAsState()
  val progress by player.progress.collectAsState()

  val track = currentTrack
  if (track == null) {
    LaunchedEffect(Unit) { onClose() }
    return
  }

  var menuOpen by remember { mutableStateOf(false) }
  var addToPlaylistOpen by remember { mutableStateOf(false) }
  var uploadBusy by remember { mutableStateOf(false) }
  var shareOpen by remember { mutableStateOf(false) }
  var shareRecipientInput by remember { mutableStateOf("") }
  var shareBusy by remember { mutableStateOf(false) }
  var downloadedByContentId by remember { mutableStateOf<Map<String, com.pirate.app.music.DownloadedTrackEntry>>(emptyMap()) }
  var turboCreditsSheetOpen by remember { mutableStateOf(false) }
  var turboCreditsSheetMessage by remember {
    mutableStateOf(TURBO_CREDITS_COPY)
  }

  var artworkUri by remember(track.id) { mutableStateOf(track.artworkUri) }
  var artworkFailed by remember(track.id) { mutableStateOf(false) }

  fun handleArtworkError() {
    if (
      artworkUri == track.artworkUri &&
      !track.artworkFallbackUri.isNullOrBlank() &&
      track.artworkFallbackUri != artworkUri
    ) {
      artworkUri = track.artworkFallbackUri
      return
    }
    artworkFailed = true
  }

  val screenWidth = LocalConfiguration.current.screenWidthDp.dp
  val coverSize = minOf(screenWidth - 80.dp, 400.dp).coerceAtLeast(220.dp)

  LaunchedEffect(Unit) {
    downloadedByContentId = DownloadedTracksStore.load(context)
  }

  fun isTrackDownloaded(t: com.pirate.app.music.MusicTrack): Boolean {
    val key = t.contentId?.trim()?.lowercase().orEmpty()
    if (key.isBlank()) return false
    return downloadedByContentId.containsKey(key)
  }

  fun resolveSongTrackId(t: com.pirate.app.music.MusicTrack): String? {
    val bytes32Regex = Regex("^0x[a-fA-F0-9]{64}$")
    val fromId = t.id.trim()
    if (bytes32Regex.matches(fromId)) return fromId
    val fromContentId = t.contentId?.trim().orEmpty()
    if (bytes32Regex.matches(fromContentId)) return fromContentId
    return null
  }

  fun promptTurboTopUp(message: String) {
    turboCreditsSheetMessage = message
    turboCreditsSheetOpen = true
  }

  fun openTurboTopUp() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(ArweaveTurboConfig.TOP_UP_URL))
    runCatching { context.startActivity(intent) }
      .onFailure {
        onShowMessage("Unable to open browser. Visit ${ArweaveTurboConfig.TOP_UP_URL}")
      }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .statusBarsPadding()
      .navigationBarsPadding()
      .padding(horizontal = 24.dp),
  ) {
    // Header
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .height(56.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      IconButton(onClick = onClose) {
        Icon(
          Icons.Rounded.KeyboardArrowDown,
          contentDescription = "Close player",
          tint = MaterialTheme.colorScheme.onBackground,
          modifier = Modifier.size(28.dp),
        )
      }

      IconButton(onClick = { menuOpen = true }) {
        Icon(
          Icons.Rounded.MoreHoriz,
          contentDescription = "Track menu",
          tint = MaterialTheme.colorScheme.onBackground,
          modifier = Modifier.size(28.dp),
        )
      }
    }

    // Album cover
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .weight(1f),
      contentAlignment = Alignment.Center,
    ) {
      Box(
        modifier = Modifier
          .size(coverSize)
          .clip(RoundedCornerShape(12.dp))
          .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
      ) {
        if (!artworkUri.isNullOrBlank() && !artworkFailed) {
          AsyncImage(
            model = artworkUri,
            contentDescription = "Album art",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onError = { handleArtworkError() },
          )
        } else {
          Icon(
            Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(80.dp),
          )
        }
      }
    }

    // Track info
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(top = 8.dp, bottom = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      Text(
        track.title,
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        maxLines = 2,
      )
      Text(
        track.artist,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        maxLines = 1,
      )
      if (track.album.isNotBlank()) {
        Text(
          track.album,
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          textAlign = TextAlign.Center,
          maxLines = 1,
        )
      }
    }

    // Scrubber
    PlayerScrubber(
      positionSec = progress.positionSec,
      durationSec = progress.durationSec,
      onSeek = { player.seekTo(it) },
    )

    // Controls
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(top = 18.dp),
      horizontalArrangement = Arrangement.Center,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      SoftIconButton(onClick = { player.skipPrevious() }) {
        Icon(
          Icons.Rounded.SkipPrevious,
          contentDescription = "Previous track",
          tint = MaterialTheme.colorScheme.onSurface,
          modifier = Modifier.size(28.dp),
        )
      }

      Spacer(modifier = Modifier.size(24.dp))

      Surface(
        modifier = Modifier.size(80.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary,
      ) {
        IconButton(onClick = { player.togglePlayPause() }) {
          Icon(
            if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            contentDescription = if (isPlaying) "Pause" else "Play",
            tint = MaterialTheme.colorScheme.background,
            modifier = Modifier.size(40.dp),
          )
        }
      }

      Spacer(modifier = Modifier.size(24.dp))

      SoftIconButton(onClick = { player.skipNext() }) {
        Icon(
          Icons.Rounded.SkipNext,
          contentDescription = "Next track",
          tint = MaterialTheme.colorScheme.onSurface,
          modifier = Modifier.size(28.dp),
        )
      }
    }

    Spacer(modifier = Modifier.height(32.dp))
  }

  val trackMenuPolicy =
    track?.let {
      TrackMenuPolicyResolver.resolve(
        track = it,
        ownerEthAddress = ownerEthAddress,
        alreadyDownloaded = isTrackDownloaded(it),
      )
    }

  TrackMenuSheet(
    open = menuOpen,
    track = track,
    onClose = { menuOpen = false },
    onUpload = { t ->
      val policy = TrackMenuPolicyResolver.resolve(t, ownerEthAddress)
      if (!policy.canUpload) {
        onShowMessage("Upload is only available for local tracks")
        return@TrackMenuSheet
      }
      if (uploadBusy) {
        onShowMessage("Upload already in progress")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to upload")
        return@TrackMenuSheet
      }

      uploadBusy = true
      scope.launch {
        onShowMessage("Uploading to Load...")
        val result =
          runCatching {
            TrackUploadService.uploadEncrypted(
              context = context,
              ownerEthAddress = ownerEthAddress,
              track = t,
              hostActivity = hostActivity,
              tempoAccount = tempoAccount,
            )
          }
        uploadBusy = false

        result.onFailure { err ->
          onShowMessage("Upload failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val updated =
            t.copy(
              contentId = ok.contentId,
              pieceCid = ok.pieceCid,
              datasetOwner = ok.datasetOwner,
              algo = ok.algo,
            )
          player.updateTrack(updated)

          val cached = MusicLibrary.loadCachedTracks(context)
          val next =
            if (cached.any { it.id == updated.id }) cached.map { if (it.id == updated.id) updated else it }
            else cached + updated
          MusicLibrary.saveCachedTracks(context, next)

          onShowMessage("Uploaded.")
        }
      }
    },
    onSaveForever = { t ->
      val policy = TrackMenuPolicyResolver.resolve(t, ownerEthAddress)
      if (!policy.canSaveForever) {
        onShowMessage("This track can't be saved forever")
        return@TrackMenuSheet
      }
      if (uploadBusy) {
        onShowMessage("Upload already in progress")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to save forever")
        return@TrackMenuSheet
      }
      if (!t.permanentRef.isNullOrBlank()) {
        onShowMessage("Already saved forever")
        return@TrackMenuSheet
      }

      uploadBusy = true
      scope.launch {
        val sessionKey = SessionKeyManager.load(context)?.takeIf {
          SessionKeyManager.isValid(it, ownerAddress = ownerEthAddress)
        }
        if (sessionKey == null) {
          uploadBusy = false
          onShowMessage("Session expired. Sign in again to save forever.")
          return@launch
        }

        val balanceResult = runCatching { TurboCreditsApi.fetchBalance(sessionKey.address) }
        val balanceError = balanceResult.exceptionOrNull()
        if (balanceError != null) {
          uploadBusy = false
          if (TurboCreditsApi.isLikelyInsufficientBalanceError(balanceError.message)) {
            promptTurboTopUp(TURBO_CREDITS_COPY)
          } else {
            onShowMessage("Couldn't check Turbo balance. Try again.")
          }
          return@launch
        }
        val balance = balanceResult.getOrNull()
        if (balance == null || !balance.hasCredits) {
          uploadBusy = false
          promptTurboTopUp(TURBO_CREDITS_COPY)
          return@launch
        }

        onShowMessage("Saving Forever...")
        val result =
          runCatching {
            TrackSaveForeverService.saveForever(
              context = context,
              ownerEthAddress = ownerEthAddress,
              track = t,
            )
          }
        uploadBusy = false

        result.onFailure { err ->
          if (TurboCreditsApi.isLikelyInsufficientBalanceError(err.message)) {
            promptTurboTopUp(TURBO_CREDITS_COPY)
            return@onFailure
          }
          onShowMessage("Save Forever failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val updated =
            t.copy(
              contentId = ok.contentId,
              datasetOwner = ok.datasetOwner,
              algo = ok.algo,
              permanentRef = ok.permanentRef,
              permanentGatewayUrl = ok.permanentGatewayUrl,
              permanentSavedAtMs = ok.permanentSavedAtMs,
              savedForever = true,
            )

          player.updateTrack(updated)

          val cached = MusicLibrary.loadCachedTracks(context)
          val next =
            if (cached.any { it.id == updated.id }) cached.map { if (it.id == updated.id) updated else it }
            else cached + updated
          MusicLibrary.saveCachedTracks(context, next)

          onShowMessage("Saved forever on Arweave.")
        }
      }
    },
    onDownload = { t ->
      val policy =
        TrackMenuPolicyResolver.resolve(
          track = t,
          ownerEthAddress = ownerEthAddress,
          alreadyDownloaded = isTrackDownloaded(t),
        )
      if (!policy.canDownload) {
        onShowMessage("Already on device")
        return@TrackMenuSheet
      }
      scope.launch {
        val owner = ownerEthAddress?.trim()
        val result =
          UploadedTrackActions.downloadUploadedTrackToDevice(
            context = context,
            track = t,
            ownerAddress = owner ?: t.datasetOwner,
            granteeAddress = owner,
          )
        if (!result.success) {
          onShowMessage("Download failed: ${result.error ?: "unknown error"}")
          return@launch
        }
        downloadedByContentId = DownloadedTracksStore.load(context)
        onShowMessage(if (result.alreadyDownloaded) "Already downloaded" else "Downloaded to device")
      }
    },
    onShare = { _ ->
      val current = track ?: return@TrackMenuSheet
      val policy = TrackMenuPolicyResolver.resolve(current, ownerEthAddress)
      if (!policy.canShare) {
        onShowMessage("Share is only available for your uploaded tracks")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to share")
        return@TrackMenuSheet
      }
      shareRecipientInput = ""
      shareOpen = true
    },
    onAddToPlaylist = {
      addToPlaylistOpen = true
    },
    onAddToQueue = { onShowMessage("Add to queue coming soon") },
    onGoToSong = { t ->
      val trackId = resolveSongTrackId(t)
      if (trackId.isNullOrBlank()) {
        onShowMessage("Song page unavailable for this track")
        return@TrackMenuSheet
      }
      val navigator = onOpenSongPage
      if (navigator == null) {
        onShowMessage("Song view coming soon")
        return@TrackMenuSheet
      }
      navigator(trackId, t.title, t.artist)
    },
    onGoToAlbum = { onShowMessage("Album view coming soon") },
    onGoToArtist = { t ->
      val artist = t.artist.trim()
      if (artist.isBlank() || artist.equals("Unknown Artist", ignoreCase = true)) {
        onShowMessage("Artist unavailable for this track")
        return@TrackMenuSheet
      }
      val navigator = onOpenArtistPage
      if (navigator == null) {
        onShowMessage("Artist view coming soon")
        return@TrackMenuSheet
      }
      navigator(artist)
    },
    showUploadAction = trackMenuPolicy?.canUpload ?: false,
    showSaveAction = (trackMenuPolicy?.canSaveForever ?: false) || !track?.permanentRef.isNullOrBlank(),
    showDownloadAction = trackMenuPolicy?.canDownload ?: false,
    showShareAction = trackMenuPolicy?.canShare ?: false,
    uploadLabel = "Upload to Load",
    saveActionLabel = "Save Forever",
    savedActionLabel = "Saved Forever",
    downloadLabel = "Download from Load",
  )

  if (shareOpen) {
    AlertDialog(
      onDismissRequest = {
        if (!shareBusy) {
          shareOpen = false
          shareRecipientInput = ""
        }
      },
      title = { Text("Share Track") },
      text = {
        OutlinedTextField(
          value = shareRecipientInput,
          onValueChange = { if (!shareBusy) shareRecipientInput = it },
          singleLine = true,
          label = { Text("Recipient") },
          placeholder = { Text("0x..., alice.heaven, bob.pirate") },
          enabled = !shareBusy,
          modifier = Modifier.fillMaxWidth(),
        )
      },
      confirmButton = {
        TextButton(
          enabled = !shareBusy && shareRecipientInput.trim().isNotEmpty(),
          onClick = {
            val owner = ownerEthAddress
            if (owner.isNullOrBlank()) {
              onShowMessage("Missing share credentials")
              return@TextButton
            }
            shareBusy = true
            scope.launch {
              val result =
                UploadedTrackActions.shareUploadedTrack(
                  context = context,
                  track = track,
                  recipient = shareRecipientInput,
                  ownerAddress = owner,
                )
              shareBusy = false
              if (!result.success) {
                onShowMessage("Share failed: ${result.error ?: "unknown error"}")
                return@launch
              }
              shareOpen = false
              shareRecipientInput = ""
              onShowMessage("Shared successfully")
            }
          },
        ) {
          Text(if (shareBusy) "Sharing..." else "Share")
        }
      },
      dismissButton = {
        TextButton(
          enabled = !shareBusy,
          onClick = {
            shareOpen = false
            shareRecipientInput = ""
          },
        ) { Text("Cancel") }
      },
    )
  }

  TurboCreditsSheet(
    open = turboCreditsSheetOpen,
    message = turboCreditsSheetMessage,
    onDismiss = { turboCreditsSheetOpen = false },
    onGetCredits = {
      turboCreditsSheetOpen = false
      openTurboTopUp()
    },
  )

  // TODO: AddToPlaylistSheet needs Tempo migration of PlaylistV1 contract
  // AddToPlaylistSheet(...)
}

@Composable
private fun PlayerScrubber(
  positionSec: Float,
  durationSec: Float,
  onSeek: (Float) -> Unit,
) {
  var isSeeking by remember { mutableStateOf(false) }
  var seekValue by remember { mutableStateOf(0f) }

  val safeDuration = if (durationSec > 0f) durationSec else 1f
  val sliderValue = (if (isSeeking) seekValue else positionSec).coerceIn(0f, safeDuration)

  Column(modifier = Modifier.fillMaxWidth()) {
    Slider(
      value = sliderValue,
      onValueChange = { v ->
        if (durationSec <= 0f) return@Slider
        isSeeking = true
        seekValue = v
      },
      onValueChangeFinished = {
        if (durationSec <= 0f) return@Slider
        onSeek(seekValue)
        isSeeking = false
      },
      valueRange = 0f..safeDuration,
      enabled = durationSec > 0f,
    )

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Text(
        formatTime(if (isSeeking) seekValue else positionSec),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Text(
        formatTime(durationSec),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
  }
}

@Composable
private fun SoftIconButton(
  onClick: () -> Unit,
  content: @Composable () -> Unit,
) {
  Surface(
    shape = CircleShape,
    color = MaterialTheme.colorScheme.surfaceVariant,
  ) {
    IconButton(
      modifier = Modifier.size(56.dp),
      onClick = onClick,
    ) {
      content()
    }
  }
}

private fun formatTime(seconds: Float): String {
  val safe = seconds.coerceAtLeast(0f).toInt()
  val mins = safe / 60
  val secs = safe % 60
  return "${mins}:${secs.toString().padStart(2, '0')}"
}
