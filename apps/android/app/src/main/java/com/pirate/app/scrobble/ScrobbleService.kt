package com.pirate.app.scrobble

import android.util.Log
import com.pirate.app.BuildConfig
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.player.PlayerController
import com.pirate.app.scrobble.aa.AAScrobbleClient
import com.pirate.app.scrobble.aa.SubmitScrobbleInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "PirateScrobble"
private const val SESSION_KEY = "local"
private val TICK_INTERVAL_MS = if (BuildConfig.DEBUG) 1_000L else 15_000L

class ScrobbleService(
  private val player: PlayerController,
  private val getAuthState: () -> PirateAuthUiState,
  private val onShowMessage: (String) -> Unit,
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val aa = AAScrobbleClient()

  private val engine =
    ScrobbleEngine { scrobble ->
      scope.launch { submit(scrobble) }
    }

  private var tickJob: Job? = null
  private var trackJob: Job? = null
  private var playbackJob: Job? = null
  private var expiredAuthFingerprint: String? = null

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
            ),
          )
        }
      }

    playbackJob =
      scope.launch {
        player.isPlaying.collectLatest { playing ->
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
    val auth = getAuthState()
    val authFingerprint =
      listOf(
        auth.authMethodType?.toString().orEmpty(),
        auth.authMethodId.orEmpty(),
        auth.accessToken?.hashCode()?.toString().orEmpty(),
        auth.pkpPublicKey.orEmpty(),
      ).joinToString("|")
    if (expiredAuthFingerprint != null && expiredAuthFingerprint != authFingerprint) {
      expiredAuthFingerprint = null
    }
    if (expiredAuthFingerprint == authFingerprint) {
      Log.d(TAG, "Skipping scrobble; auth session marked expired until re-login")
      return
    }

    val isAuthed = auth.hasLitAuthCredentials()
    if (!isAuthed) {
      Log.d(TAG, "Not authenticated; skipping scrobble")
      if (BuildConfig.DEBUG) {
        onShowMessage("Scrobble skipped (not authenticated)")
      }
      return
    }

    val track =
      SubmitScrobbleInput(
        artist = scrobble.artist,
        title = scrobble.title,
        album = scrobble.album,
        durationSec = ((scrobble.durationMs ?: 0L) / 1000L).toInt(),
        playedAtSec = scrobble.playedAtSec,
      )

    if (BuildConfig.DEBUG) {
      onShowMessage("Scrobbling: ${track.title} \u00b7 ${track.artist}")
    }

    suspend fun submitOnce() =
      withContext(Dispatchers.IO) {
        aa.submitScrobble(
          input = track,
          userEthAddress = auth.pkpEthAddress!!,
          userPkpPublicKey = auth.pkpPublicKey!!,
          litNetwork = auth.litNetwork,
          litRpcUrl = auth.litRpcUrl,
          authState = auth,
        )
      }

    val result = runCatching { submitOnce() }

    result.onFailure { err ->
      Log.w(TAG, "Scrobble submit failed", err)
      if (LitAuthContextManager.isExpiredAuthChallengeError(err)) {
        expiredAuthFingerprint = authFingerprint
        onShowMessage("Scrobble paused: session expired. Please sign in again.")
      } else {
        onShowMessage("Scrobble failed: ${err.message ?: "unknown error"}")
      }
    }

    result.onSuccess { ok ->
      expiredAuthFingerprint = null
      Log.d(TAG, "Scrobbled! userOpHash=${ok.userOpHash} sender=${ok.sender}")
      if (BuildConfig.DEBUG) {
        onShowMessage("Scrobbled: ${track.title}")
      }
    }
  }
}
