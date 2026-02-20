package com.pirate.app.music

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import com.pirate.app.arweave.TurboCreditsApi
import com.pirate.app.music.ui.TrackMenuSheet
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.launch

@Composable
internal fun MusicTrackMenuOverlay(
  open: Boolean,
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
  onClose: () -> Unit,
  onPromptTurboTopUp: (String) -> Unit,
  onShowMessage: (String) -> Unit,
  onRescanAfterDownload: suspend () -> Unit,
  onOpenSongPage: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtistPage: ((String) -> Unit)? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  fun isTrackDownloaded(track: MusicTrack): Boolean {
    val key = track.contentId?.trim()?.lowercase().orEmpty()
    if (key.isBlank()) return false
    return downloadedTracksByContentId.containsKey(key)
  }

  val selectedTrackMenuPolicy =
    selectedTrack?.let { track ->
      TrackMenuPolicyResolver.resolve(
        track = track,
        ownerEthAddress = ownerEthAddress,
        alreadyDownloaded = isTrackDownloaded(track),
      )
    }

  TrackMenuSheet(
    open = open,
    track = selectedTrack,
    onClose = onClose,
    onUpload = { track ->
      val policy = TrackMenuPolicyResolver.resolve(track, ownerEthAddress)
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

      onUploadBusyChange(true)
      scope.launch {
        onShowMessage("Uploading to Load...")
        val result =
          runCatching {
            TrackUploadService.uploadEncrypted(
              context = context,
              ownerEthAddress = ownerEthAddress,
              track = track,
              hostActivity = hostActivity,
              tempoAccount = tempoAccount,
            )
          }
        onUploadBusyChange(false)

        result.onFailure { err ->
          onShowMessage("Upload failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val next =
            tracks.map { existing ->
              if (existing.id != track.id) existing
              else
                existing.copy(
                  contentId = ok.contentId,
                  pieceCid = ok.pieceCid,
                  datasetOwner = ok.datasetOwner,
                  algo = ok.algo,
                )
            }
          onTracksChange(next)
          MusicLibrary.saveCachedTracks(context, next)

          onShowMessage("Uploaded.")
        }
      }
    },
    onSaveForever = { track ->
      val policy = TrackMenuPolicyResolver.resolve(track, ownerEthAddress)
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
      if (!track.permanentRef.isNullOrBlank()) {
        onShowMessage("Already saved forever")
        return@TrackMenuSheet
      }

      onUploadBusyChange(true)
      scope.launch {
        val sessionKey = SessionKeyManager.load(context)?.takeIf {
          SessionKeyManager.isValid(it, ownerAddress = ownerEthAddress)
        }
        if (sessionKey == null) {
          onUploadBusyChange(false)
          onShowMessage("Session expired. Sign in again to save forever.")
          return@launch
        }

        val balanceResult = runCatching { TurboCreditsApi.fetchBalance(sessionKey.address) }
        val balanceError = balanceResult.exceptionOrNull()
        if (balanceError != null) {
          onUploadBusyChange(false)
          if (TurboCreditsApi.isLikelyInsufficientBalanceError(balanceError.message)) {
            onPromptTurboTopUp(turboCreditsCopy)
          } else {
            onShowMessage("Couldn't check Turbo balance. Try again.")
          }
          return@launch
        }
        val balance = balanceResult.getOrNull()
        if (balance == null || !balance.hasCredits) {
          onUploadBusyChange(false)
          onPromptTurboTopUp(turboCreditsCopy)
          return@launch
        }

        onShowMessage("Saving Forever...")
        val result =
          runCatching {
            TrackSaveForeverService.saveForever(
              context = context,
              ownerEthAddress = ownerEthAddress,
              track = track,
            )
          }
        onUploadBusyChange(false)

        result.onFailure { err ->
          if (TurboCreditsApi.isLikelyInsufficientBalanceError(err.message)) {
            onPromptTurboTopUp(turboCreditsCopy)
            return@onFailure
          }
          onShowMessage("Save Forever failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val next =
            tracks.map { existing ->
              if (existing.id != track.id) existing
              else {
                existing.copy(
                  contentId = ok.contentId,
                  datasetOwner = ok.datasetOwner,
                  algo = ok.algo,
                  permanentRef = ok.permanentRef,
                  permanentGatewayUrl = ok.permanentGatewayUrl,
                  permanentSavedAtMs = ok.permanentSavedAtMs,
                  savedForever = true,
                )
              }
            }
          onTracksChange(next)
          MusicLibrary.saveCachedTracks(context, next)

          onShowMessage("Saved forever on Arweave.")
        }
      }
    },
    onDownload = { track ->
      val policy =
        TrackMenuPolicyResolver.resolve(
          track = track,
          ownerEthAddress = ownerEthAddress,
          alreadyDownloaded = isTrackDownloaded(track),
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
            track = track,
            ownerAddress = owner ?: track.datasetOwner,
            granteeAddress = owner,
          )
        if (!result.success) {
          onShowMessage("Download failed: ${result.error ?: "unknown error"}")
          return@launch
        }
        onRescanAfterDownload()
        onShowMessage(if (result.alreadyDownloaded) "Already downloaded" else "Downloaded to device")
      }
    },
    onShare = { track ->
      val policy = TrackMenuPolicyResolver.resolve(track, ownerEthAddress)
      if (!policy.canShare) {
        onShowMessage("Share is only available for your uploaded tracks")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to share")
        return@TrackMenuSheet
      }
      onOpenShare(track)
    },
    onAddToPlaylist = { track ->
      onOpenAddToPlaylist(track)
    },
    onAddToQueue = { onShowMessage("Add to queue coming soon") },
    onGoToSong = { track ->
      val trackId = resolveSongTrackId(track)
      if (trackId.isNullOrBlank()) {
        onShowMessage("Song page unavailable for this track")
        return@TrackMenuSheet
      }
      val navigator = onOpenSongPage
      if (navigator == null) {
        onShowMessage("Song view coming soon")
        return@TrackMenuSheet
      }
      navigator(trackId, track.title, track.artist)
    },
    onGoToAlbum = { onShowMessage("Album view coming soon") },
    onGoToArtist = { track ->
      val artist = track.artist.trim()
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
    showUploadAction = selectedTrackMenuPolicy?.canUpload ?: false,
    showSaveAction = (selectedTrackMenuPolicy?.canSaveForever ?: false) || !selectedTrack?.permanentRef.isNullOrBlank(),
    showDownloadAction = selectedTrackMenuPolicy?.canDownload ?: false,
    showShareAction = selectedTrackMenuPolicy?.canShare ?: false,
    uploadLabel = "Upload to Load",
    saveActionLabel = "Save Forever",
    savedActionLabel = "Saved Forever",
    downloadLabel = "Download from Load",
  )
}
