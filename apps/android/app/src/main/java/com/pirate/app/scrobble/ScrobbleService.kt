package com.pirate.app.scrobble

import android.util.Log
import androidx.fragment.app.FragmentActivity
import com.pirate.app.BuildConfig
import com.pirate.app.auth.PirateAuthUiState
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

private const val TAG = "PirateScrobble"
private const val SESSION_KEY = "local"
private val TICK_INTERVAL_MS = if (BuildConfig.DEBUG) 1_000L else 15_000L

class ScrobbleService(
  private val activity: FragmentActivity?,
  private val player: PlayerController,
  private val getAuthState: () -> PirateAuthUiState,
  private val onShowMessage: (String) -> Unit,
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val submitMutex = Mutex()
  private var sessionKey: SessionKeyManager.SessionKey? = null
  private var sessionAuthBlockedForAddress: String? = null
  private var preferPasskeyForAddress: String? = null

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
      if (preferPasskeyForAddress != null && preferPasskeyForAddress != normalizedAddress) {
        preferPasskeyForAddress = null
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

      val activeSession =
        if (preferPasskeyForAddress == normalizedAddress) null else ensureSessionKey(tempoAccount)
      if (activeSession == null) {
        if (hostActivity == null) {
          Log.w(TAG, "Scrobble paused: session key unavailable and no activity for passkey prompt")
          return
        }
        usedPasskeyPath = true
        preferPasskeyForAddress = normalizedAddress
        result =
          TempoScrobbleApi.submitScrobbleWithPasskey(
            activity = hostActivity,
            account = tempoAccount,
            input = input,
          )
      } else {
        result =
          TempoScrobbleApi.submitScrobble(
            account = tempoAccount,
            sessionKey = activeSession,
            input = input,
          )

        if (!result.success && result.error?.contains("reverted on-chain", ignoreCase = true) == true) {
          Log.w(TAG, "Scrobble tx reverted; clearing session key and retrying once")
          hostActivity?.let { SessionKeyManager.clear(it) }
          sessionKey = null
          sessionAuthBlockedForAddress = null
          val refreshedSession = ensureSessionKey(tempoAccount)
          if (refreshedSession != null) {
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
          preferPasskeyForAddress = normalizedAddress
          usedPasskeyPath = true
          result =
            TempoScrobbleApi.submitScrobbleWithPasskey(
              activity = hostActivity,
              account = tempoAccount,
              input = input,
            )
        } else if (result.success) {
          preferPasskeyForAddress = null
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
    if (loaded != null) {
      SessionKeyManager.clear(hostActivity)
    }

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

  private fun shouldUsePasskeyFallback(error: String?): Boolean {
    if (error.isNullOrBlank()) return false
    val message = error.lowercase()
    return message.contains("replacement transaction underpriced") ||
      message.contains("still pending") ||
      message.contains("timed out waiting for transaction receipt") ||
      message.contains("nonce")
  }
}
