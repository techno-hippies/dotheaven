package com.pirate.app.player

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import com.pirate.app.music.MusicTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.math.absoluteValue

class PlayerController(private val context: Context) {
  data class PlayerProgress(
    val positionSec: Float,
    val durationSec: Float,
  )

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val widgetSyncBridge = WidgetSyncBridge(context = context, scope = scope)
  private val playbackServiceBridge = PlaybackServiceBridge(context = context) { this }
  private val tag = "PiratePlayer"
  private val mediaInfoNetworkBandwidth = 703
  private var mediaPlayer: MediaPlayer? = null
  private var exoPlayer: ExoPlayer? = null
  private var progressJob: Job? = null

  private enum class PlaybackEngine {
    MEDIA,
    EXO,
  }

  private var activeEngine: PlaybackEngine? = null

  private val _currentTrack = MutableStateFlow<MusicTrack?>(null)
  val currentTrack: StateFlow<MusicTrack?> = _currentTrack.asStateFlow()

  private val _isPlaying = MutableStateFlow(false)
  val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

  private val _queue = MutableStateFlow<List<MusicTrack>>(emptyList())
  val queue: StateFlow<List<MusicTrack>> = _queue.asStateFlow()

  private val _queueIndex = MutableStateFlow(0)
  val queueIndex: StateFlow<Int> = _queueIndex.asStateFlow()

  private val _progress = MutableStateFlow(PlayerProgress(positionSec = 0f, durationSec = 0f))
  val progress: StateFlow<PlayerProgress> = _progress.asStateFlow()

  fun playTrack(track: MusicTrack, allTracks: List<MusicTrack>) {
    val idx = allTracks.indexOfFirst { it.id == track.id }
    if (idx >= 0) {
      playQueue(queue = allTracks, startIndex = idx)
    } else {
      playQueue(queue = listOf(track), startIndex = 0)
    }
  }

  fun playQueue(queue: List<MusicTrack>, startIndex: Int) {
    val safeQueue = queue.filter { it.uri.isNotBlank() }
    if (safeQueue.isEmpty()) {
      stop()
      return
    }

    _queue.value = safeQueue
    _queueIndex.value = startIndex.coerceIn(0, safeQueue.lastIndex)
    loadAndPlay(index = _queueIndex.value, playWhenReady = true)
  }

  fun skipNext() {
    val q = _queue.value
    if (q.isEmpty()) return
    val next = (_queueIndex.value + 1).coerceAtMost(q.lastIndex)
    if (next == _queueIndex.value) return
    _queueIndex.value = next
    loadAndPlay(index = next, playWhenReady = true)
  }

  fun skipPrevious() {
    val q = _queue.value
    if (q.isEmpty()) return

    if (_progress.value.positionSec >= 3f) {
      seekTo(0f)
      return
    }

    val prev = (_queueIndex.value - 1).coerceAtLeast(0)
    if (prev == _queueIndex.value) return
    _queueIndex.value = prev
    loadAndPlay(index = prev, playWhenReady = true)
  }

  fun seekTo(positionSec: Float) {
    val dur = _progress.value.durationSec
    val safe = positionSec.coerceIn(0f, if (dur > 0f) dur else positionSec.absoluteValue)
    val targetMs = (safe * 1000f).toLong().coerceAtLeast(0L)
    when (activeEngine) {
      PlaybackEngine.EXO -> runCatching { exoPlayer?.seekTo(targetMs) }
      PlaybackEngine.MEDIA -> runCatching { mediaPlayer?.seekTo(targetMs.toInt()) }
      null -> return
    }
    _progress.value = _progress.value.copy(positionSec = safe)
  }

  private fun loadAndPlay(index: Int, playWhenReady: Boolean) {
    val q = _queue.value
    if (q.isEmpty()) return
    val track = q.getOrNull(index) ?: return

    if (_currentTrack.value?.id == track.id && playWhenReady && !_isPlaying.value) {
      togglePlayPause()
      return
    }

    stopInternal(resetPosition = true)

    _currentTrack.value = track
    _isPlaying.value = false
    val parsed = Uri.parse(track.uri)
    val scheme = parsed.scheme?.lowercase()
    if (scheme == "http" || scheme == "https") {
      loadAndPlayExo(track, playWhenReady)
    } else {
      loadAndPlayMedia(track, playWhenReady, parsed)
    }
  }

  private fun setDurationSec(durationSec: Float) {
    _progress.value = _progress.value.copy(durationSec = durationSec)
  }

  private fun handleTrackEnded() {
    val q2 = _queue.value
    if (q2.isNotEmpty() && _queueIndex.value < q2.lastIndex) {
      _queueIndex.value = _queueIndex.value + 1
      loadAndPlay(index = _queueIndex.value, playWhenReady = true)
    } else {
      syncWidgetState()
    }
  }

  private fun handleTrackLoadFailed() {
    stopInternal(resetPosition = true)
    _currentTrack.value = null
    _isPlaying.value = false
  }

  private fun loadAndPlayMedia(track: MusicTrack, playWhenReady: Boolean, parsedUri: Uri) {
    activeEngine = PlaybackEngine.MEDIA
    loadAndPlayMediaEngine(
      context = context,
      track = track,
      playWhenReady = playWhenReady,
      parsedUri = parsedUri,
      tag = tag,
      mediaInfoNetworkBandwidth = mediaInfoNetworkBandwidth,
      onSetMediaPlayer = { mediaPlayer = it },
      onSetIsPlaying = { _isPlaying.value = it },
      onSetDurationSec = { durationSec -> setDurationSec(durationSec) },
      onStartPlaybackService = { startPlaybackService() },
      onSyncWidgetState = { syncWidgetState() },
      onStartProgressUpdates = { startProgressUpdates() },
      onTrackEnded = { handleTrackEnded() },
      onTrackLoadFailed = { handleTrackLoadFailed() },
    )
  }

  private fun loadAndPlayExo(track: MusicTrack, playWhenReady: Boolean) {
    activeEngine = PlaybackEngine.EXO
    loadAndPlayExoEngine(
      context = context,
      track = track,
      playWhenReady = playWhenReady,
      tag = tag,
      onGetOrCreateExoCache = { ctx -> getOrCreateExoCache(ctx) },
      onSetExoPlayer = { exoPlayer = it },
      onSetIsPlaying = { _isPlaying.value = it },
      onSetDurationSec = { durationSec -> setDurationSec(durationSec) },
      onStartPlaybackService = { startPlaybackService() },
      onSyncWidgetState = { syncWidgetState() },
      onStartProgressUpdates = { startProgressUpdates() },
      onTrackEnded = { handleTrackEnded() },
      onTrackLoadFailed = { handleTrackLoadFailed() },
    )
  }

  fun togglePlayPause() {
    try {
      when (activeEngine) {
        PlaybackEngine.EXO -> {
          val player = exoPlayer ?: return
          val next = !player.isPlaying
          player.playWhenReady = next
          _isPlaying.value = next
        }
        PlaybackEngine.MEDIA -> {
          val player = mediaPlayer ?: return
          if (player.isPlaying) {
            player.pause()
            _isPlaying.value = false
          } else {
            player.start()
            _isPlaying.value = true
          }
        }
        null -> return
      }
    } catch (_: Throwable) {
      _isPlaying.value = false
    }
    syncWidgetState()
    updatePlaybackService()
  }

  fun stop() {
    stopInternal(resetPosition = true)
    _currentTrack.value = null
    _isPlaying.value = false
    _queue.value = emptyList()
    _queueIndex.value = 0
    syncWidgetState()
    stopPlaybackService()
  }

  fun release() {
    stop()
    scope.coroutineContext.cancel()
  }

  fun updateTrack(updated: MusicTrack) {
    val current = _currentTrack.value
    if (current != null && current.id == updated.id) {
      _currentTrack.value = updated
    }

    val q = _queue.value
    if (q.isNotEmpty() && q.any { it.id == updated.id }) {
      _queue.value = q.map { if (it.id == updated.id) updated else it }
    }
  }

  private fun stopInternal(resetPosition: Boolean = false) {
    progressJob?.cancel()
    progressJob = null

    val mp = mediaPlayer
    mediaPlayer = null
    if (mp != null) {
      runCatching { mp.stop() }
      runCatching { mp.reset() }
      runCatching { mp.release() }
    }

    val exo = exoPlayer
    exoPlayer = null
    if (exo != null) {
      runCatching { exo.stop() }
      runCatching { exo.release() }
    }
    activeEngine = null

    if (resetPosition) {
      _progress.value = PlayerProgress(positionSec = 0f, durationSec = 0f)
    }
  }

  // -- Widget: push state into Glance DataStore so provideContent sees fresh data --

  private fun syncWidgetState() {
    widgetSyncBridge.sync(track = _currentTrack.value, isPlaying = _isPlaying.value)
  }

  // -- Foreground PlaybackService (notification + MediaSession) --

  private fun startPlaybackService() {
    playbackServiceBridge.start()
  }

  private fun updatePlaybackService() {
    playbackServiceBridge.update()
  }

  private fun stopPlaybackService() {
    playbackServiceBridge.stop()
  }

  private fun getOrCreateExoCache(context: Context): SimpleCache {
    return ExoCacheStore.getOrCreate(context)
  }

  private fun startProgressUpdates() {
    progressJob?.cancel()
    progressJob =
      scope.launch {
        while (true) {
          val (durationMs, positionMs) = when (activeEngine) {
            PlaybackEngine.EXO -> {
              val player = exoPlayer ?: break
              val duration = runCatching { player.duration }.getOrDefault(C.TIME_UNSET)
              val safeDuration = if (duration == C.TIME_UNSET || duration < 0L) 0L else duration
              val safePosition = runCatching { player.currentPosition }.getOrDefault(0L).coerceAtLeast(0L)
              safeDuration to safePosition
            }
            PlaybackEngine.MEDIA -> {
              val player = mediaPlayer ?: break
              val duration = runCatching { player.duration }.getOrDefault(0).coerceAtLeast(0).toLong()
              val position = runCatching { player.currentPosition }.getOrDefault(0).coerceAtLeast(0).toLong()
              duration to position
            }
            null -> break
          }
          _progress.value = PlayerProgress(
            positionSec = positionMs / 1000f,
            durationSec = durationMs / 1000f,
          )
          updatePlaybackService()
          delay(250)
        }
      }
  }
}
