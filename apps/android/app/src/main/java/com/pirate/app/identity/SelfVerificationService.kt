package com.pirate.app.identity

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * HTTP client for Self.xyz verification endpoints on api-core.
 * All methods are blocking — call from Dispatchers.IO.
 */
object SelfVerificationService {

  private const val TAG = "SelfVerify"

  data class IdentityResult(
    val verified: Boolean,
    val age: Int? = null,
    val nationality: String? = null,
    val hasShortNameCredential: Boolean = true,
  )

  data class SessionResult(
    val sessionId: String,
    val deeplinkUrl: String,
    val expiresAt: Long,
  )

  data class SessionStatus(
    val status: String, // "pending" | "verified" | "failed" | "expired"
    val age: Int? = null,
    val nationality: String? = null,
    val reason: String? = null,
  )

  /** Check if user already has a verified identity. */
  fun checkIdentity(apiUrl: String, pkp: String): IdentityResult {
    val conn = URL("$apiUrl/api/self/identity/${pkp.lowercase()}").openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.connectTimeout = 10_000
    conn.readTimeout = 10_000
    try {
      val status = conn.responseCode
      if (status == 404) return IdentityResult(verified = false)
      if (status != 200) throw RuntimeException("Identity check failed: HTTP $status")
      val body = conn.inputStream.bufferedReader().readText()
      val json = JSONObject(body)
      return IdentityResult(
        verified = true,
        age = json.optInt("currentAge", -1).takeIf { it >= 0 },
        nationality = json.optString("nationality", "").takeIf { it.isNotEmpty() },
        hasShortNameCredential = json.optBoolean("hasShortNameCredential", true),
      )
    } finally {
      conn.disconnect()
    }
  }

  /** Create a new verification session. Returns deeplink URL to open. */
  fun createSession(apiUrl: String, pkp: String): SessionResult {
    val conn = URL("$apiUrl/api/self/session").openConnection() as HttpURLConnection
    conn.requestMethod = "POST"
    conn.setRequestProperty("Content-Type", "application/json")
    conn.connectTimeout = 10_000
    conn.readTimeout = 10_000
    conn.doOutput = true
    try {
      val payload = JSONObject().put("userAddress", pkp.lowercase()).toString()
      conn.outputStream.use { it.write(payload.toByteArray()) }
      val status = conn.responseCode
      val body = (if (status in 200..299) conn.inputStream else conn.errorStream).bufferedReader().readText()
      if (status != 200) throw RuntimeException("Create session failed: HTTP $status — $body")
      val json = JSONObject(body)
      return SessionResult(
        sessionId = json.getString("sessionId"),
        deeplinkUrl = json.getString("deeplinkUrl"),
        expiresAt = json.getLong("expiresAt"),
      )
    } finally {
      conn.disconnect()
    }
  }

  /** Poll session status. */
  fun pollSession(apiUrl: String, sessionId: String): SessionStatus {
    val conn = URL("$apiUrl/api/self/session/$sessionId").openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.connectTimeout = 10_000
    conn.readTimeout = 10_000
    try {
      val status = conn.responseCode
      if (status == 404) throw RuntimeException("Session not found")
      if (status != 200) throw RuntimeException("Poll failed: HTTP $status")
      val body = conn.inputStream.bufferedReader().readText()
      val json = JSONObject(body)
      return SessionStatus(
        status = json.getString("status"),
        age = json.optInt("age", -1).takeIf { it >= 0 },
        nationality = json.optString("nationality", "").takeIf { it.isNotEmpty() },
        reason = json.optString("reason", "").takeIf { it.isNotEmpty() },
      )
    } finally {
      conn.disconnect()
    }
  }
}
