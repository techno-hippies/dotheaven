package com.pirate.app.scrobble

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.fragment.app.FragmentActivity
import com.pirate.app.BuildConfig
import com.pirate.app.arweave.ArweaveUploadApi
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.music.CoverRef
import com.pirate.app.music.PendingMediaSyncStore
import com.pirate.app.music.TrackIds
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoAccountFactory
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoSessionKeyApi
import com.pirate.app.player.PlayerController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.InputStream
import java.net.URL
import java.net.URLConnection

private const val TAG = "PirateScrobble"
private const val SESSION_KEY = "local"
private const val MAX_SOURCE_COVER_BYTES = 10 * 1024 * 1024
private val TICK_INTERVAL_MS = if (BuildConfig.DEBUG) 1_000L else 15_000L

class ScrobbleService(
  private val appContext: Context,
  private val activity: FragmentActivity?,
  private val player: PlayerController,
  private val getAuthState: () -> PirateAuthUiState,
  private val onShowMessage: (String) -> Unit,
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val submitMutex = Mutex()
  private var sessionKey: SessionKeyManager.SessionKey? = null
  private var sessionAuthBlockedForAddress: String? = null

  private val engine =
    ScrobbleEngine { scrobble ->
      if (BuildConfig.DEBUG) {
        Log.d(
          TAG,
          "Scrobble ready: artist='${scrobble.artist}' title='${scrobble.title}' playedAt=${scrobble.playedAtSec}",
        )
        onShowMessage("Scrobble queued: ${scrobble.title}")
      }
      scope.launch { submit(scrobble) }
    }

  private var tickJob: Job? = null
  private var trackJob: Job? = null
  private var playbackJob: Job? = null

  fun start() {
    if (tickJob != null) return

    tickJob =
      scope.launch {
        while (true) {
          delay(TICK_INTERVAL_MS)
          engine.tick()
        }
      }

    trackJob =
      scope.launch {
        player.currentTrack.collectLatest { track ->
          if (BuildConfig.DEBUG) {
            Log.d(
              TAG,
              "Track update: ${track?.artist ?: "<none>"} - ${track?.title ?: "<none>"} durationSec=${track?.durationSec ?: 0}",
            )
          }
          if (track == null) {
            engine.onSessionGone(SESSION_KEY)
            return@collectLatest
          }
          engine.onMetadata(
            SESSION_KEY,
            TrackMetadata(
              artist = track.artist,
              title = track.title,
              album = track.album.ifBlank { null },
              durationMs = track.durationSec.takeIf { it > 0 }?.toLong()?.times(1000L),
              artworkUri = track.artworkUri,
              artworkFallbackUri = track.artworkFallbackUri,
            ),
          )
        }
      }

    playbackJob =
      scope.launch {
        player.isPlaying.collectLatest { playing ->
          if (BuildConfig.DEBUG) {
            Log.d(TAG, "Playback update: isPlaying=$playing")
          }
          engine.onPlayback(SESSION_KEY, playing)
        }
      }
  }

  fun stop() {
    tickJob?.cancel()
    tickJob = null
    trackJob?.cancel()
    trackJob = null
    playbackJob?.cancel()
    playbackJob = null
    engine.onSessionGone(SESSION_KEY)
  }

  fun close() {
    stop()
    scope.coroutineContext.cancel()
  }

  private suspend fun submit(scrobble: ReadyScrobble) {
    submitMutex.withLock {
      val auth = getAuthState()
      val tempoAccount =
        TempoAccountFactory.fromSession(
          tempoAddress = auth.tempoAddress,
          tempoCredentialId = auth.tempoCredentialId,
          tempoPubKeyX = auth.tempoPubKeyX,
          tempoPubKeyY = auth.tempoPubKeyY,
          tempoRpId = auth.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
        )

      if (tempoAccount == null) {
        Log.d(TAG, "Scrobble skipped: no Tempo passkey account")
        if (BuildConfig.DEBUG) onShowMessage("Scrobble skipped (no Tempo account)")
        return
      }

      val normalizedAddress = tempoAccount.address.lowercase()
      if (sessionAuthBlockedForAddress != null && sessionAuthBlockedForAddress != normalizedAddress) {
        sessionAuthBlockedForAddress = null
      }

      val input =
        TempoScrobbleInput(
          artist = scrobble.artist,
          title = scrobble.title,
          album = scrobble.album,
          durationSec = ((scrobble.durationMs ?: 0L) / 1000L).toInt().coerceAtLeast(0),
          playedAtSec = scrobble.playedAtSec.coerceAtLeast(0L),
        )

      val hostActivity = activity
      var usedPasskeyPath = false
      var result: TempoScrobbleSubmitResult

      val activeSession = ensureSessionKey(tempoAccount)
      var mediaSyncSession: SessionKeyManager.SessionKey? = activeSession
      if (activeSession == null) {
        if (hostActivity == null) {
          Log.w(TAG, "Scrobble paused: session key unavailable and no activity for passkey prompt")
          return
        }
        usedPasskeyPath = true
        result =
          TempoScrobbleApi.submitScrobbleWithPasskey(
            activity = hostActivity,
            account = tempoAccount,
            input = input,
          )
        if (!result.success && shouldRetryPasskeySubmission(result.error)) {
          Log.w(TAG, "Passkey scrobble was not confirmed; retrying once")
          result =
            TempoScrobbleApi.submitScrobbleWithPasskey(
              activity = hostActivity,
              account = tempoAccount,
              input = input,
            )
        }
      } else {
        result =
          TempoScrobbleApi.submitScrobble(
            account = tempoAccount,
            sessionKey = activeSession,
            input = input,
          )

        if (!result.success && shouldRefreshSessionKey(result.error) && hostActivity != null) {
          Log.w(TAG, "Scrobble session submit failed (${result.error}); refreshing session key and retrying once")
          hostActivity?.let { SessionKeyManager.clear(it) }
          sessionKey = null
          sessionAuthBlockedForAddress = null
          val refreshedSession = ensureSessionKey(tempoAccount)
          if (refreshedSession != null) {
            mediaSyncSession = refreshedSession
            result =
              TempoScrobbleApi.submitScrobble(
                account = tempoAccount,
                sessionKey = refreshedSession,
                input = input,
              )
          }
        }

        if (!result.success && shouldUsePasskeyFallback(result.error) && hostActivity != null) {
          Log.w(TAG, "Session scrobble failed (${result.error}); switching to passkey fallback")
          usedPasskeyPath = true
          mediaSyncSession = null
          result =
            TempoScrobbleApi.submitScrobbleWithPasskey(
              activity = hostActivity,
              account = tempoAccount,
              input = input,
            )
        }
      }

      if (!result.success) {
        Log.w(TAG, "Scrobble submit failed: ${result.error}")
        if (BuildConfig.DEBUG) {
          onShowMessage("Scrobble failed: ${result.error ?: "unknown error"}")
        }
        return
      }

      val state = if (result.pendingConfirmation) "submitted-pending" else "confirmed"
      val mode =
        when {
          usedPasskeyPath -> "passkey"
          result.usedSelfPayFallback -> "self-fallback"
          else -> "relay"
        }
      Log.d(
        TAG,
        "Scrobble $state mode=$mode tx=${result.txHash} trackId=${result.trackId} registerPath=${result.usedRegisterPath}",
      )
      if (BuildConfig.DEBUG) {
        if (result.pendingConfirmation) {
          onShowMessage("Scrobble submitted (pending): ${input.title}")
        } else {
          onShowMessage("Scrobbled: ${input.title}")
        }
      }

      val resolvedTrackId =
        result.trackId ?: TrackIds.computeMetaTrackId(
          title = input.title,
          artist = input.artist,
          album = input.album.orEmpty(),
        )
      if (!usedPasskeyPath && SessionKeyManager.isValid(mediaSyncSession, ownerAddress = tempoAccount.address)) {
        val usableSession = mediaSyncSession?.takeIf { it.keyAuthorization?.isNotEmpty() == true }
        if (usableSession != null) {
          scope.launch(Dispatchers.IO) {
            syncTrackMediaBestEffort(
              account = tempoAccount,
              sessionKey = usableSession,
              trackId = resolvedTrackId,
              scrobble = scrobble,
            )
          }
        }
      }
    }
  }

  private suspend fun ensureSessionKey(
    account: TempoPasskeyManager.PasskeyAccount,
  ): SessionKeyManager.SessionKey? {
    val current = sessionKey
    if (
      SessionKeyManager.isValid(current, ownerAddress = account.address) &&
      current?.keyAuthorization?.isNotEmpty() == true
    ) {
      return current
    }
    sessionKey = null

    val hostActivity = activity
    if (hostActivity == null) {
      if (BuildConfig.DEBUG) {
        onShowMessage("Scrobble paused: missing activity for session key auth")
      }
      return null
    }

    val loaded = SessionKeyManager.load(hostActivity)
    if (
      SessionKeyManager.isValid(loaded, ownerAddress = account.address) &&
      loaded?.keyAuthorization?.isNotEmpty() == true
    ) {
      sessionKey = loaded
      return loaded
    }
    // Keep persisted session key when account mismatches; onboarding/account switching
    // can transiently present a different account and should not wipe a valid key.

    val normalizedAddress = account.address.lowercase()
    if (sessionAuthBlockedForAddress == normalizedAddress) {
      return null
    }

    if (BuildConfig.DEBUG) {
      onShowMessage("Authorize session key for background scrobbling")
    }
    val authResult =
      TempoSessionKeyApi.authorizeSessionKey(
        activity = hostActivity,
        account = account,
        rpId = account.rpId,
      )
    if (!authResult.success) {
      sessionAuthBlockedForAddress = normalizedAddress
      Log.w(TAG, "Session key authorization failed: ${authResult.error}")
      if (BuildConfig.DEBUG) {
        onShowMessage("Scrobble paused: session key auth failed")
      }
      return null
    }

    val authorized = authResult.sessionKey
    if (!SessionKeyManager.isValid(authorized, ownerAddress = account.address)) {
      sessionAuthBlockedForAddress = normalizedAddress
      Log.w(TAG, "Session key authorization returned invalid key")
      if (BuildConfig.DEBUG) {
        onShowMessage("Scrobble paused: invalid session key")
      }
      return null
    }

    sessionAuthBlockedForAddress = null
    sessionKey = authorized
    if (BuildConfig.DEBUG) {
      onShowMessage("Background scrobbling enabled")
    }
    return authorized
  }

  private fun shouldRetryPasskeySubmission(error: String?): Boolean {
    if (error.isNullOrBlank()) return false
    val message = error.lowercase()
    return message.contains("dropped before inclusion") ||
      message.contains("not confirmed before expiry") ||
      message.contains("timed out waiting for transaction receipt") ||
      (message.contains("not found") && message.contains("transaction"))
  }

  private fun shouldRefreshSessionKey(error: String?): Boolean {
    if (error.isNullOrBlank()) return false
    val message = error.lowercase()
    return message.contains("reverted on-chain") ||
      message.contains("invalid signature") ||
      message.contains("sender signature") ||
      message.contains("key authorization") ||
      message.contains("key_authorization") ||
      message.contains("keychain") ||
      message.contains("unknown key") ||
      message.contains("unauthorized")
  }

  private fun shouldUsePasskeyFallback(error: String?): Boolean {
    if (error.isNullOrBlank()) return false
    val message = error.lowercase()
    return message.contains("replacement transaction underpriced") ||
      message.contains("still pending") ||
      message.contains("timed out waiting for transaction receipt") ||
      message.contains("dropped before inclusion") ||
      message.contains("not confirmed before expiry") ||
      message.contains("nonce") ||
      message.contains("invalid signature") ||
      message.contains("sender signature") ||
      message.contains("key authorization") ||
      message.contains("key_authorization") ||
      message.contains("keychain") ||
      message.contains("unknown key") ||
      message.contains("unauthorized")
  }

  private suspend fun syncTrackMediaBestEffort(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    trackId: String,
    scrobble: ReadyScrobble,
  ) {
    val pending = runCatching { PendingMediaSyncStore.get(appContext, trackId) }.getOrNull()

    val coverSyncSupported =
      runCatching { TempoScrobbleApi.contractSupportsSetTrackCoverFor() }
        .onFailure { err -> Log.w(TAG, "Scrobble cover sync support check failed: ${err.message}") }
        .getOrDefault(false)
    if (!coverSyncSupported) {
      Log.d(TAG, "Scrobble cover sync unavailable for current ScrobbleV4")
    } else {
      val existingCoverRef =
        runCatching { TempoScrobbleApi.getTrackCoverRef(trackId) }
          .onFailure { err -> Log.w(TAG, "Scrobble cover read failed trackId=$trackId err=${err.message}") }
          .getOrNull()
      if (!existingCoverRef.isNullOrBlank()) {
        runCatching { PendingMediaSyncStore.markCoverSynced(appContext, trackId) }
        Log.d(TAG, "Scrobble cover already on-chain trackId=$trackId ref=$existingCoverRef")
      } else {
        var coverRef = pending?.coverRef
        if (coverRef.isNullOrBlank()) {
          coverRef = resolveCanonicalCoverRef(scrobble.artworkUri)
          if (coverRef.isNullOrBlank()) {
            coverRef = resolveCanonicalCoverRef(scrobble.artworkFallbackUri)
          }
          if (coverRef.isNullOrBlank()) {
            coverRef =
              uploadCoverFromArtwork(
                sessionKey = sessionKey,
                primaryArtwork = scrobble.artworkUri,
                fallbackArtwork = scrobble.artworkFallbackUri,
              )
          }
          if (!coverRef.isNullOrBlank()) {
            runCatching {
              PendingMediaSyncStore.upsertRefs(
                context = appContext,
                trackId = trackId,
                coverRef = coverRef,
              )
            }
          }
        }

        if (!coverRef.isNullOrBlank()) {
          runCatching {
            TempoScrobbleApi.ensureTrackCoverSynced(
              account = account,
              sessionKey = sessionKey,
              trackId = trackId,
              coverRef = coverRef,
            )
          }.onSuccess {
            runCatching { PendingMediaSyncStore.markCoverSynced(appContext, trackId) }
            Log.d(TAG, "Scrobble cover sync ok trackId=$trackId ref=$it")
          }.onFailure { err ->
            Log.w(TAG, "Scrobble cover sync skipped/failed trackId=$trackId err=${err.message}")
          }
        }
      }
    }

    val lyricsSyncSupported =
      runCatching { TempoScrobbleApi.contractSupportsSetTrackLyricsFor() }
        .onFailure { err -> Log.w(TAG, "Scrobble lyrics sync support check failed: ${err.message}") }
        .getOrDefault(false)
    if (!lyricsSyncSupported) {
      Log.d(TAG, "Scrobble lyrics sync unavailable for current ScrobbleV4")
      return
    }

    val existingLyricsRef =
      runCatching { TempoScrobbleApi.getTrackLyricsRef(trackId) }
        .onFailure { err -> Log.w(TAG, "Scrobble lyrics read failed trackId=$trackId err=${err.message}") }
        .getOrNull()
    if (!existingLyricsRef.isNullOrBlank()) {
      runCatching { PendingMediaSyncStore.markLyricsSynced(appContext, trackId) }
      Log.d(TAG, "Scrobble lyrics already on-chain trackId=$trackId ref=$existingLyricsRef")
      return
    }

    var lyricsRef = pending?.lyricsRef
    if (lyricsRef.isNullOrBlank()) {
      lyricsRef =
        uploadLyricsForTrack(
          sessionKey = sessionKey,
          trackId = trackId,
          scrobble = scrobble,
        )
      if (!lyricsRef.isNullOrBlank()) {
        runCatching {
          PendingMediaSyncStore.upsertRefs(
            context = appContext,
            trackId = trackId,
            lyricsRef = lyricsRef,
          )
        }
      }
    }

    if (!lyricsRef.isNullOrBlank()) {
      runCatching {
        TempoScrobbleApi.ensureTrackLyricsSynced(
          account = account,
          sessionKey = sessionKey,
          trackId = trackId,
          lyricsRef = lyricsRef,
        )
      }.onSuccess {
        runCatching { PendingMediaSyncStore.markLyricsSynced(appContext, trackId) }
        Log.d(TAG, "Scrobble lyrics sync ok trackId=$trackId ref=$it")
      }.onFailure { err ->
        Log.w(TAG, "Scrobble lyrics sync skipped/failed trackId=$trackId err=${err.message}")
      }
    }
  }

  private suspend fun uploadLyricsForTrack(
    sessionKey: SessionKeyManager.SessionKey,
    trackId: String,
    scrobble: ReadyScrobble,
  ): String? {
    val durationSec = scrobble.durationMs?.div(1000L)?.toInt()?.takeIf { it > 0 }
    val lookup =
      runCatching {
        LyricsLookupApi.fetchLyrics(
          title = scrobble.title,
          artist = scrobble.artist,
          album = scrobble.album,
          durationSec = durationSec,
        )
      }.onFailure { err ->
        Log.w(TAG, "Scrobble lyrics lookup failed trackId=$trackId err=${err.message}")
      }.getOrNull()

    if (lookup == null || !lookup.hasAnyLyrics()) {
      Log.d(TAG, "Scrobble lyrics lookup empty trackId=$trackId")
      return null
    }

    val payload =
      LyricsLookupApi.buildLyricsPayloadJson(
        trackId = trackId,
        trackName = scrobble.title,
        artistName = scrobble.artist,
        albumName = scrobble.album,
        durationSec = durationSec,
        result = lookup,
      )

    val uploaded =
      runCatching {
        ArweaveUploadApi.uploadLyrics(
          trackId = trackId,
          lyricsJson = payload,
          sessionKey = sessionKey,
        )
      }.onFailure { err ->
        Log.w(TAG, "Scrobble lyrics upload failed trackId=$trackId err=${err.message}")
      }.getOrNull()
    return uploaded?.arRef
  }

  private suspend fun uploadCoverFromArtwork(
    sessionKey: SessionKeyManager.SessionKey,
    primaryArtwork: String?,
    fallbackArtwork: String?,
  ): String? {
    val candidates =
      listOfNotNull(primaryArtwork?.trim(), fallbackArtwork?.trim())
        .filter { it.isNotBlank() }
        .distinct()
    for (candidate in candidates) {
      val payload = runCatching { readCoverPayload(candidate) }.getOrNull() ?: continue
      val uploaded =
        runCatching {
          ArweaveUploadApi.uploadCover(
            coverBytes = payload.bytes,
            filename = payload.filename,
            contentType = payload.contentType,
            sessionKey = sessionKey,
          )
        }.getOrNull()
      if (uploaded != null) return uploaded.arRef
    }
    return null
  }

  private data class CoverPayload(
    val bytes: ByteArray,
    val filename: String,
    val contentType: String,
  )

  private fun readCoverPayload(rawUri: String): CoverPayload {
    val uri = Uri.parse(rawUri)
    val scheme = uri.scheme?.trim()?.lowercase().orEmpty()
    val filename = resolveFilename(uri)
    val contentType = resolveContentType(uri, fallbackFilename = filename)
    val resolvedRemoteUrl =
      when {
        scheme == "http" || scheme == "https" -> rawUri
        else ->
          CoverRef.resolveCoverUrl(rawUri)
            ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
      }

    val bytes =
      when {
        !resolvedRemoteUrl.isNullOrBlank() -> {
          URL(resolvedRemoteUrl).openStream().use { readStreamWithLimit(it, MAX_SOURCE_COVER_BYTES) }
        }
        scheme == "content" || scheme == "file" || scheme == "android.resource" || scheme.isBlank() -> {
          val input = appContext.contentResolver.openInputStream(uri)
            ?: if (rawUri.startsWith("/")) File(rawUri).inputStream() else null
          input?.use { readStreamWithLimit(it, MAX_SOURCE_COVER_BYTES) }
            ?: throw IllegalStateException("Cannot read artwork URI: $rawUri")
        }
        else -> throw IllegalStateException("Unsupported artwork URI scheme: $scheme")
      }

    return CoverPayload(
      bytes = bytes,
      filename = filename,
      contentType = contentType,
    )
  }

  private fun resolveFilename(uri: Uri): String {
    val fromPath = uri.lastPathSegment?.substringAfterLast('/')?.trim().orEmpty()
    if (fromPath.isNotBlank()) return fromPath
    return "cover.jpg"
  }

  private fun resolveContentType(
    uri: Uri,
    fallbackFilename: String,
  ): String {
    val fromResolver = appContext.contentResolver.getType(uri)?.trim().orEmpty()
    if (fromResolver.startsWith("image/")) return fromResolver
    val guessed = URLConnection.guessContentTypeFromName(fallbackFilename)?.trim().orEmpty()
    if (guessed.startsWith("image/")) return guessed
    return "image/jpeg"
  }

  private fun readStreamWithLimit(
    input: InputStream,
    maxBytes: Int,
  ): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      total += read
      if (total > maxBytes) {
        throw IllegalStateException("Artwork exceeds max bytes ($total > $maxBytes)")
      }
      out.write(buffer, 0, read)
    }
    if (total == 0) throw IllegalStateException("Artwork payload is empty")
    return out.toByteArray()
  }

  private fun resolveCanonicalCoverRef(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return null
    if (value.startsWith("ar://")) {
      val id = value.removePrefix("ar://").trim()
      return if (id.isBlank()) null else "ar://$id"
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
      val uri = Uri.parse(value)
      val host = uri.host?.trim()?.lowercase().orEmpty()
      if (host == "arweave.net") {
        val id = uri.pathSegments.firstOrNull()?.trim().orEmpty()
        if (id.isNotBlank()) return "ar://$id"
      }
    }
    return null
  }
}
