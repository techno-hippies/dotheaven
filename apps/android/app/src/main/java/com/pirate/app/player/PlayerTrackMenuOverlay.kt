package com.pirate.app.player

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.pirate.app.arweave.ArweaveTurboConfig
import com.pirate.app.arweave.TurboCreditsApi
import com.pirate.app.music.DownloadedTrackEntry
import com.pirate.app.music.DownloadedTracksStore
import com.pirate.app.music.MusicLibrary
import com.pirate.app.music.MusicTrack
import com.pirate.app.music.TrackMenuPolicyResolver
import com.pirate.app.music.TrackSaveForeverService
import com.pirate.app.music.TrackUploadService
import com.pirate.app.music.UploadedTrackActions
import com.pirate.app.music.resolveSongTrackId
import com.pirate.app.music.ui.TrackMenuSheet
import com.pirate.app.music.ui.TurboCreditsSheet
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import kotlinx.coroutines.launch

private const val TURBO_CREDITS_COPY = "Save this song forever on Arweave for ~\$0.03."

@Composable
internal fun PlayerTrackMenuOverlay(
  track: MusicTrack,
  player: PlayerController,
  menuOpen: Boolean,
  onMenuOpenChange: (Boolean) -> Unit,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  onShowMessage: (String) -> Unit,
  onOpenSongPage: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtistPage: ((String) -> Unit)? = null,
  hostActivity: androidx.fragment.app.FragmentActivity? = null,
  tempoAccount: TempoPasskeyManager.PasskeyAccount? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  var addToPlaylistOpen by remember { mutableStateOf(false) }
  var uploadBusy by remember { mutableStateOf(false) }
  var shareOpen by remember { mutableStateOf(false) }
  var shareRecipientInput by remember { mutableStateOf("") }
  var shareBusy by remember { mutableStateOf(false) }
  var downloadedByContentId by remember { mutableStateOf<Map<String, DownloadedTrackEntry>>(emptyMap()) }
  var turboCreditsSheetOpen by remember { mutableStateOf(false) }
  var turboCreditsSheetMessage by remember { mutableStateOf(TURBO_CREDITS_COPY) }

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

  fun isTrackDownloaded(t: MusicTrack): Boolean {
    val key = t.contentId?.trim()?.lowercase().orEmpty()
    if (key.isBlank()) return false
    return downloadedByContentId.containsKey(key)
  }

  LaunchedEffect(Unit) {
    downloadedByContentId = DownloadedTracksStore.load(context)
  }

  LaunchedEffect(addToPlaylistOpen) {
    if (addToPlaylistOpen) {
      onShowMessage("Add to playlist coming soon")
      addToPlaylistOpen = false
    }
  }

  val trackMenuPolicy =
    TrackMenuPolicyResolver.resolve(
      track = track,
      ownerEthAddress = ownerEthAddress,
      alreadyDownloaded = isTrackDownloaded(track),
    )

  TrackMenuSheet(
    open = menuOpen,
    track = track,
    onClose = { onMenuOpenChange(false) },
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
      val policy = TrackMenuPolicyResolver.resolve(track, ownerEthAddress)
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
    showUploadAction = trackMenuPolicy.canUpload,
    showSaveAction = trackMenuPolicy.canSaveForever || !track.permanentRef.isNullOrBlank(),
    showDownloadAction = trackMenuPolicy.canDownload,
    showShareAction = trackMenuPolicy.canShare,
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
        ) {
          Text("Cancel")
        }
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
