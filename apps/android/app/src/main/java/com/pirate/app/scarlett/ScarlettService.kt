package com.pirate.app.scarlett

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

data class ScarlettMessage(
  val id: String,
  val role: String, // "user" or "assistant"
  val content: String,
  val timestamp: Long,
)

class ScarlettService(private val appContext: Context) {

  companion object {
    private const val TAG = "ScarlettService"
    private const val PREFS_NAME = "scarlett_prefs"
    private const val KEY_MESSAGES = "messages"
    private const val CHAT_WORKER_URL = "https://neodate-voice.deletion-backup782.workers.dev"
    private const val MAX_HISTORY = 20
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val _messages = MutableStateFlow<List<ScarlettMessage>>(emptyList())
  val messages: StateFlow<List<ScarlettMessage>> = _messages

  private val _sending = MutableStateFlow(false)
  val sending: StateFlow<Boolean> = _sending

  private val httpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()

  init {
    loadMessages()
  }

  /**
   * Send a message to Scarlett and get her response.
   */
  suspend fun sendMessage(
    text: String,
    wallet: String,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): Result<String> {
    if (text.isBlank()) return Result.failure(IllegalArgumentException("Empty message"))

    val userMsg = ScarlettMessage(
      id = UUID.randomUUID().toString(),
      role = "user",
      content = text.trim(),
      timestamp = System.currentTimeMillis(),
    )
    _messages.value = _messages.value + userMsg
    saveMessages()

    _sending.value = true

    return try {
      val token = getWorkerToken(
        appContext = appContext,
        workerUrl = CHAT_WORKER_URL,
        wallet = wallet,
        pkpPublicKey = pkpPublicKey,
        litNetwork = litNetwork,
        litRpcUrl = litRpcUrl,
      )

      val history = _messages.value.takeLast(MAX_HISTORY).map { msg ->
        JSONObject().put("role", msg.role).put("content", msg.content)
      }
      val historyArray = JSONArray().apply { history.forEach { put(it) } }

      val payload = JSONObject()
        .put("message", text.trim())
        .put("history", historyArray)
        .put("activityWallet", wallet.lowercase())
        .toString()
        .toRequestBody(JSON_MEDIA_TYPE)

      val req = Request.Builder()
        .url("${CHAT_WORKER_URL}/chat/send")
        .post(payload)
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer $token")
        .build()

      val responseText = withContext(Dispatchers.IO) {
        httpClient.newCall(req).execute().use { resp ->
          val body = resp.body?.string().orEmpty()
          if (!resp.isSuccessful) {
            val err = runCatching { JSONObject(body).optString("error", body) }.getOrDefault(body)
            throw IllegalStateException("Chat request failed (${resp.code}): $err")
          }
          val msg = JSONObject(body).optString("message", "")
          sanitizeChatMessage(msg)
        }
      }

      val assistantMsg = ScarlettMessage(
        id = UUID.randomUUID().toString(),
        role = "assistant",
        content = responseText,
        timestamp = System.currentTimeMillis(),
      )
      _messages.value = _messages.value + assistantMsg
      saveMessages()

      Result.success(responseText)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to send message", e)
      Result.failure(e)
    } finally {
      _sending.value = false
    }
  }

  fun clearHistory() {
    _messages.value = emptyList()
    saveMessages()
    clearWorkerAuthCache()
  }

  // --- Persistence ---

  private fun loadMessages() {
    try {
      val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val json = prefs.getString(KEY_MESSAGES, null) ?: return
      val arr = JSONArray(json)
      val list = mutableListOf<ScarlettMessage>()
      for (i in 0 until arr.length()) {
        val obj = arr.getJSONObject(i)
        list.add(
          ScarlettMessage(
            id = obj.getString("id"),
            role = obj.getString("role"),
            content = obj.getString("content"),
            timestamp = obj.getLong("timestamp"),
          ),
        )
      }
      _messages.value = list
    } catch (e: Exception) {
      Log.e(TAG, "Failed to load messages", e)
    }
  }

  private fun saveMessages() {
    scope.launch {
      try {
        val arr = JSONArray()
        // Keep last 100 messages in storage
        _messages.value.takeLast(100).forEach { msg ->
          arr.put(
            JSONObject()
              .put("id", msg.id)
              .put("role", msg.role)
              .put("content", msg.content)
              .put("timestamp", msg.timestamp),
          )
        }
        val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_MESSAGES, arr.toString()).apply()
      } catch (e: Exception) {
        Log.e(TAG, "Failed to save messages", e)
      }
    }
  }

  // --- Message sanitization (port from GPUI) ---

  private fun stripThinkSections(input: String): String {
    val output = StringBuilder(input.length)
    var cursor = 0
    val lower = input.lowercase()

    while (true) {
      val startRel = lower.indexOf("<think>", cursor)
      if (startRel == -1) break
      output.append(input, cursor, startRel)
      val bodyStart = startRel + "<think>".length
      val endRel = lower.indexOf("</think>", bodyStart)
      cursor = if (endRel != -1) endRel + "</think>".length else input.length
    }

    if (cursor < input.length) output.append(input, cursor, input.length)
    return output.toString()
  }

  private fun sanitizeChatMessage(raw: String): String {
    val stripped = stripThinkSections(raw)
    // Remove any leftover tags
    val cleaned = stripped
      .replace(Regex("</?think>", RegexOption.IGNORE_CASE), "")
      .trim()

    return cleaned.ifEmpty { "Sorry, I could not generate a response." }
  }
}
