package com.pirate.app.scarlett

import android.content.Context
import android.util.Log
import io.agora.rtc2.ChannelMediaOptions
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class VoiceCallState { Idle, Connecting, Connected, Error }

class AgoraVoiceController(private val appContext: Context) {

  companion object {
    private const val TAG = "AgoraVoice"
    private const val AGORA_APP_ID = "3260ad15ace147c88a8bf32da798a114"
    private const val CHAT_WORKER_URL = "https://neodate-voice.deletion-backup782.workers.dev"
    private val JSON_MT = "application/json; charset=utf-8".toMediaType()
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

  private val _state = MutableStateFlow(VoiceCallState.Idle)
  val state: StateFlow<VoiceCallState> = _state

  private val _isMuted = MutableStateFlow(false)
  val isMuted: StateFlow<Boolean> = _isMuted

  private val _durationSeconds = MutableStateFlow(0)
  val durationSeconds: StateFlow<Int> = _durationSeconds

  private val _isBotSpeaking = MutableStateFlow(false)
  val isBotSpeaking: StateFlow<Boolean> = _isBotSpeaking

  private val _errorMessage = MutableStateFlow<String?>(null)
  val errorMessage: StateFlow<String?> = _errorMessage

  private var engine: RtcEngine? = null
  private var sessionId: String? = null
  private var timerJob: Job? = null
  private var botSilenceJob: Job? = null

  private val httpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()

  private val eventHandler = object : IRtcEngineEventHandler() {
    override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
      Log.d(TAG, "Joined channel $channel uid=$uid")
      scope.launch { _state.value = VoiceCallState.Connected }
    }

    override fun onUserJoined(uid: Int, elapsed: Int) {
      Log.d(TAG, "Remote user joined: $uid")
    }

    override fun onUserOffline(uid: Int, reason: Int) {
      Log.d(TAG, "Remote user offline: $uid reason=$reason")
    }

    override fun onError(err: Int) {
      Log.e(TAG, "Agora error: $err")
      if (_state.value == VoiceCallState.Connecting) {
        scope.launch {
          _errorMessage.value = "Voice connection failed (code $err)"
          _state.value = VoiceCallState.Error
        }
      }
    }

    override fun onAudioVolumeIndication(
      speakers: Array<out AudioVolumeInfo>?,
      totalVolume: Int,
    ) {
      // Detect bot speaking: any remote uid with volume > 25
      val remoteSpeaking = speakers?.any { it.uid != 0 && it.volume > 25 } == true
      if (remoteSpeaking) {
        scope.launch {
          _isBotSpeaking.value = true
          // Reset silence timer
          botSilenceJob?.cancel()
          botSilenceJob = scope.launch {
            delay(600)
            _isBotSpeaking.value = false
          }
        }
      }
    }
  }

  fun startCall(
    wallet: String,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ) {
    if (_state.value == VoiceCallState.Connecting || _state.value == VoiceCallState.Connected) return

    _state.value = VoiceCallState.Connecting
    _errorMessage.value = null
    _durationSeconds.value = 0
    _isMuted.value = false
    _isBotSpeaking.value = false

    scope.launch {
      try {
        // 1. Get JWT
        val token = getWorkerToken(
          workerUrl = CHAT_WORKER_URL,
          wallet = wallet,
          pkpPublicKey = pkpPublicKey,
          litNetwork = litNetwork,
          litRpcUrl = litRpcUrl,
        )

        // 2. POST /agent/start
        val startReq = Request.Builder()
          .url("$CHAT_WORKER_URL/agent/start")
          .post("{}".toRequestBody(JSON_MT))
          .header("Authorization", "Bearer $token")
          .build()

        val agentResp = withContext(Dispatchers.IO) {
          httpClient.newCall(startReq).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw IllegalStateException("Agent start failed (${resp.code}): $body")
            JSONObject(body)
          }
        }

        val sid = agentResp.getString("session_id")
        val channel = agentResp.getString("channel")
        val agoraToken = agentResp.getString("agora_token")
        val userUid = agentResp.getInt("user_uid")

        sessionId = sid

        // 3. Create RtcEngine
        val config = RtcEngineConfig().apply {
          mContext = appContext
          mAppId = AGORA_APP_ID
          mEventHandler = eventHandler
        }
        val rtc = RtcEngine.create(config)
        rtc.enableAudioVolumeIndication(200, 3, true)
        rtc.setChannelProfile(Constants.CHANNEL_PROFILE_LIVE_BROADCASTING)
        rtc.setClientRole(Constants.CLIENT_ROLE_BROADCASTER)
        engine = rtc

        // 4. Join channel
        val options = ChannelMediaOptions().apply {
          autoSubscribeAudio = true
          publishMicrophoneTrack = true
        }
        val joinResult = rtc.joinChannel(agoraToken, channel, userUid, options)
        if (joinResult != 0) {
          throw IllegalStateException("joinChannel returned $joinResult")
        }

        // 5. Start duration timer
        timerJob = scope.launch {
          while (true) {
            delay(1000)
            _durationSeconds.value++
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "startCall failed", e)
        _errorMessage.value = e.message ?: "Unknown error"
        _state.value = VoiceCallState.Error
        cleanup()
      }
    }
  }

  fun endCall() {
    val sid = sessionId
    cleanup()
    _state.value = VoiceCallState.Idle

    if (sid != null) {
      // Fire-and-forget stop agent
      scope.launch {
        try {
          // We don't have auth params here, but the token should still be cached
          // Just try to stop — if it fails, the server will time it out
          val stopReq = Request.Builder()
            .url("$CHAT_WORKER_URL/agent/$sid/stop")
            .post("{}".toRequestBody(JSON_MT))
            .build()
          withContext(Dispatchers.IO) {
            httpClient.newCall(stopReq).execute().close()
          }
        } catch (e: Exception) {
          Log.w(TAG, "Failed to stop agent session $sid", e)
        }
      }
    }
  }

  fun toggleMute() {
    val muted = !_isMuted.value
    _isMuted.value = muted
    engine?.muteLocalAudioStream(muted)
  }

  fun release() {
    cleanup()
  }

  private fun cleanup() {
    timerJob?.cancel()
    timerJob = null
    botSilenceJob?.cancel()
    botSilenceJob = null
    try {
      engine?.leaveChannel()
      engine?.let { RtcEngine.destroy() }
    } catch (e: Exception) {
      Log.w(TAG, "cleanup error", e)
    }
    engine = null
    sessionId = null
    _isBotSpeaking.value = false
  }
}
