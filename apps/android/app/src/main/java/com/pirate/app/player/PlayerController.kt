package com.pirate.app.player

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.util.Log
import com.pirate.app.music.MusicTrack
import com.pirate.app.widget.NowPlayingWidget
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
  private val tag = "PiratePlayer"
  private val mediaInfoNetworkBandwidth = 703
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
        startPlaybackService()
        syncWidgetState()
      }
      startProgressUpdates()
    }

    player.setOnCompletionListener {
      _isPlaying.value = false
      val q2 = _queue.value
      if (q2.isNotEmpty() && _queueIndex.value < q2.lastIndex) {
        _queueIndex.value = _queueIndex.value + 1
        loadAndPlay(index = _queueIndex.value, playWhenReady = true)
      } else {
        syncWidgetState()
      }
    }

    player.setOnErrorListener { _, _, _ ->
      _isPlaying.value = false
      Log.w(tag, "MediaPlayer onError for track=${track.id} uri=${track.uri}")
      true
    }

    player.setOnInfoListener { _, what, extra ->
      when (what) {
        MediaPlayer.MEDIA_INFO_BUFFERING_START -> Log.d(tag, "buffering_start track=${track.id}")
        MediaPlayer.MEDIA_INFO_BUFFERING_END -> Log.d(tag, "buffering_end track=${track.id}")
        mediaInfoNetworkBandwidth -> Log.d(tag, "network_bandwidth track=${track.id} kbps=$extra")
      }
      false
    }

    try {
      val parsed = Uri.parse(track.uri)
      val scheme = parsed.scheme?.lowercase()
      if (scheme == "http" || scheme == "https") {
        // Avoid ContentResolver probe path for network URLs (it throws and adds latency).
        player.setDataSource(track.uri)
      } else {
        player.setDataSource(context, parsed)
      }
      player.prepareAsync()
    } catch (error: Throwable) {
      Log.e(tag, "Failed to load track=${track.id} uri=${track.uri}", error)
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

  // -- Widget: push state into Glance DataStore so provideContent sees fresh data --

  private fun syncWidgetState() {
    val track = _currentTrack.value
    scope.launch(Dispatchers.IO) {
      if (track == null) {
        NowPlayingWidget.clearState(context)
      } else {
        NowPlayingWidget.pushState(
          context = context,
          title = track.title,
          artist = track.artist,
          artworkUri = track.artworkUri,
          isPlaying = _isPlaying.value,
        )
      }
    }
  }

  // -- Foreground PlaybackService (notification + MediaSession) --

  private var serviceStarted = false

  private fun startPlaybackService() {
    PlaybackService.playerRef = this
    val intent = Intent(context, PlaybackService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
    serviceStarted = true
  }

  private fun updatePlaybackService() {
    if (!serviceStarted) return
    val intent = Intent(context, PlaybackService::class.java).apply {
      action = PlaybackService.ACTION_UPDATE
    }
    context.startService(intent)
  }

  private fun stopPlaybackService() {
    if (!serviceStarted) return
    val intent = Intent(context, PlaybackService::class.java).apply {
      action = PlaybackService.ACTION_STOP
    }
    context.startService(intent)
    serviceStarted = false
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
          updatePlaybackService()
          delay(250)
        }
      }
  }
}
