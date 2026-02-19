package com.pirate.app.player

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
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
import java.io.File
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
  private var exoPlayer: ExoPlayer? = null
  private var progressJob: Job? = null

  private enum class PlaybackEngine {
    MEDIA,
    EXO,
  }

  private var activeEngine: PlaybackEngine? = null

  companion object {
    private const val EXO_CACHE_DIR = "exo_audio_cache"
    private const val EXO_CACHE_MAX_BYTES = 64L * 1024 * 1024
    private val cacheLock = Any()
    @Volatile private var sharedExoCache: SimpleCache? = null
    @Volatile private var sharedDbProvider: StandaloneDatabaseProvider? = null
  }

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

  private fun loadAndPlayMedia(track: MusicTrack, playWhenReady: Boolean, parsedUri: Uri) {
    val player = MediaPlayer()
    mediaPlayer = player
    activeEngine = PlaybackEngine.MEDIA

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
      player.setDataSource(context, parsedUri)
      player.prepareAsync()
    } catch (error: Throwable) {
      Log.e(tag, "Failed to load local track=${track.id} uri=${track.uri}", error)
      stopInternal(resetPosition = true)
      _currentTrack.value = null
      _isPlaying.value = false
    }
  }

  private fun loadAndPlayExo(track: MusicTrack, playWhenReady: Boolean) {
    val loadControl = DefaultLoadControl.Builder()
      .setBufferDurationsMs(
        15_000, // min buffer before/while playback
        60_000, // max buffer
        1_500,  // buffer required for initial start
        5_000,  // buffer required after rebuffer
      )
      .build()
    val player = ExoPlayer.Builder(context)
      .setLoadControl(loadControl)
      .build()
    exoPlayer = player
    activeEngine = PlaybackEngine.EXO

    var buffering = false
    player.addListener(
      object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
          _isPlaying.value = isPlaying
          if (isPlaying) {
            startPlaybackService()
          }
          syncWidgetState()
        }

        override fun onPlaybackStateChanged(state: Int) {
          when (state) {
            Player.STATE_BUFFERING -> {
              if (!buffering) {
                buffering = true
                Log.d(tag, "buffering_start track=${track.id}")
              }
            }
            Player.STATE_READY -> {
              val durationMs = player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: 0L
              _progress.value = _progress.value.copy(durationSec = durationMs / 1000f)
              if (buffering) {
                buffering = false
                Log.d(tag, "buffering_end track=${track.id}")
              }
              startProgressUpdates()
            }
            Player.STATE_ENDED -> {
              _isPlaying.value = false
              val q2 = _queue.value
              if (q2.isNotEmpty() && _queueIndex.value < q2.lastIndex) {
                _queueIndex.value = _queueIndex.value + 1
                loadAndPlay(index = _queueIndex.value, playWhenReady = true)
              } else {
                syncWidgetState()
              }
            }
          }
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
          _isPlaying.value = false
          Log.e(tag, "ExoPlayer error track=${track.id} uri=${track.uri}", error)
        }
      },
    )

    try {
      val upstreamFactory = DefaultDataSource.Factory(
        context,
        DefaultHttpDataSource.Factory()
          .setAllowCrossProtocolRedirects(true)
          .setConnectTimeoutMs(15_000)
          .setReadTimeoutMs(30_000),
      )

      val mediaSource = runCatching {
        val cache = getOrCreateExoCache(context)
        val cacheFactory = CacheDataSource.Factory()
          .setCache(cache)
          .setUpstreamDataSourceFactory(upstreamFactory)
          .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        ProgressiveMediaSource.Factory(cacheFactory).createMediaSource(MediaItem.fromUri(track.uri))
      }.getOrElse {
        Log.w(tag, "Falling back to uncached Exo stream for ${track.id}: ${it.message}")
        ProgressiveMediaSource.Factory(upstreamFactory).createMediaSource(MediaItem.fromUri(track.uri))
      }

      player.setMediaSource(mediaSource)
      player.playWhenReady = playWhenReady
      player.prepare()
    } catch (error: Throwable) {
      Log.e(tag, "Failed to load remote track=${track.id} uri=${track.uri}", error)
      stopInternal(resetPosition = true)
      _currentTrack.value = null
      _isPlaying.value = false
    }
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

  private fun getOrCreateExoCache(context: Context): SimpleCache {
    synchronized(cacheLock) {
      sharedExoCache?.let { return it }
      val dbProvider = sharedDbProvider ?: StandaloneDatabaseProvider(context.applicationContext).also {
        sharedDbProvider = it
      }
      val cacheDir = File(context.cacheDir, EXO_CACHE_DIR).apply { mkdirs() }
      return SimpleCache(cacheDir, LeastRecentlyUsedCacheEvictor(EXO_CACHE_MAX_BYTES), dbProvider).also {
        sharedExoCache = it
      }
    }
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
