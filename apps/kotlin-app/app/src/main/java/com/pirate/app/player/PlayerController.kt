package com.pirate.app.player

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
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
  private var mediaPlayer: MediaPlayer? = null
  private var progressJob: Job? = null

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

    // If we're meaningfully into the song, restart instead of skipping back.
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
    val player = mediaPlayer ?: return
    val dur = _progress.value.durationSec
    val safe = positionSec.coerceIn(0f, if (dur > 0f) dur else positionSec.absoluteValue)
    runCatching { player.seekTo((safe * 1000f).toInt()) }
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

    val player = MediaPlayer()
    mediaPlayer = player

    player.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build(),
    )

    player.setOnPreparedListener {
      val durationMs = runCatching { it.duration }.getOrDefault(0).coerceAtLeast(0)
      _progress.value = _progress.value.copy(durationSec = durationMs / 1000f)

      if (playWhenReady) {
        runCatching { it.start() }
        _isPlaying.value = true
      }
      startProgressUpdates()
    }

    player.setOnCompletionListener {
      _isPlaying.value = false
      val q2 = _queue.value
      if (q2.isNotEmpty() && _queueIndex.value < q2.lastIndex) {
        _queueIndex.value = _queueIndex.value + 1
        loadAndPlay(index = _queueIndex.value, playWhenReady = true)
      }
    }

    player.setOnErrorListener { _, _, _ ->
      _isPlaying.value = false
      true
    }

    try {
      player.setDataSource(context, Uri.parse(track.uri))
      player.prepareAsync()
    } catch (_: Throwable) {
      stopInternal(resetPosition = true)
      _currentTrack.value = null
      _isPlaying.value = false
    }
  }

  fun togglePlayPause() {
    val player = mediaPlayer ?: return
    try {
      if (player.isPlaying) {
        player.pause()
        _isPlaying.value = false
      } else {
        player.start()
        _isPlaying.value = true
      }
    } catch (_: Throwable) {
      _isPlaying.value = false
    }
  }

  fun stop() {
    stopInternal(resetPosition = true)
    _currentTrack.value = null
    _isPlaying.value = false
    _queue.value = emptyList()
    _queueIndex.value = 0
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

    val player = mediaPlayer
    mediaPlayer = null
    if (player != null) {
      runCatching { player.stop() }
      runCatching { player.reset() }
      runCatching { player.release() }
    }

    if (resetPosition) {
      _progress.value = PlayerProgress(positionSec = 0f, durationSec = 0f)
    }
  }

  private fun startProgressUpdates() {
    progressJob?.cancel()
    progressJob =
      scope.launch {
        while (true) {
          val player = mediaPlayer ?: break
          val durationMs = runCatching { player.duration }.getOrDefault(0).coerceAtLeast(0)
          val positionMs = runCatching { player.currentPosition }.getOrDefault(0).coerceAtLeast(0)
          _progress.value = PlayerProgress(
            positionSec = positionMs / 1000f,
            durationSec = durationMs / 1000f,
          )
          delay(250)
        }
      }
  }
}
