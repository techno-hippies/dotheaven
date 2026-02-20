package com.pirate.app.music

import android.content.Context
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.tempo.P256Utils
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

internal val uploadedTrackAddressRegex = Regex("^0x[a-fA-F0-9]{40}$")
internal val uploadedTrackJsonMediaType = "application/json".toMediaType()
internal val uploadedTrackHttp: OkHttpClient =
  OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(120, TimeUnit.SECONDS)
    .build()

internal suspend fun resolveUploadedTrackRecipientAddress(rawRecipient: String): String? {
  val clean = rawRecipient.trim().removePrefix("@")
  if (clean.isBlank()) return null
  if (uploadedTrackAddressRegex.matches(clean)) return clean.lowercase()
  val resolved = TempoNameRecordsApi.resolveAddressForName(clean.lowercase())
  return resolved?.lowercase()
}

internal suspend fun ensureWrappedKeyFromLs3Internal(
  context: Context,
  contentId: String,
  ownerAddress: String,
  granteeAddress: String,
): Boolean = withContext(Dispatchers.IO) {
  val normalizedContentId = normalizeUploadedContentId(contentId)
  val normalizedOwner = ownerAddress.trim().lowercase()
  val normalizedGrantee = granteeAddress.trim().lowercase()
  if (normalizedContentId.isEmpty() || normalizedOwner.isEmpty() || normalizedGrantee.isEmpty()) {
    return@withContext false
  }
  if (ContentKeyManager.loadWrappedKey(context, normalizedContentId) != null) {
    return@withContext true
  }

  val envelopeIds =
    runCatching {
      queryEnvelopeIds(
        contentId = normalizedContentId,
        ownerAddress = normalizedOwner,
        granteeAddress = normalizedGrantee,
      )
    }.getOrElse { emptyList() }

  if (envelopeIds.isEmpty()) return@withContext false

  for (envelopeId in envelopeIds) {
    val payload = runCatching { fetchResolveBytes(envelopeId) }.getOrNull() ?: continue
    val envelope =
      parseEnvelopePayload(
        payload = payload,
        expectedContentId = normalizedContentId,
        expectedOwner = normalizedOwner,
        expectedGrantee = normalizedGrantee,
      ) ?: continue
    ContentKeyManager.saveWrappedKey(context, normalizedContentId, envelope)
    return@withContext true
  }
  false
}

private fun queryEnvelopeIds(
  contentId: String,
  ownerAddress: String,
  granteeAddress: String,
): List<String> {
  val filters =
    JSONArray()
      .put(JSONObject().put("key", "App-Name").put("value", "Heaven"))
      .put(JSONObject().put("key", "Heaven-Type").put("value", "content-key-envelope"))
      .put(JSONObject().put("key", "Content-Id").put("value", contentId))
      .put(JSONObject().put("key", "Owner").put("value", ownerAddress))
      .put(JSONObject().put("key", "Grantee").put("value", granteeAddress))

  val body =
    JSONObject()
      .put("filters", filters)
      .put("first", 8)
      .put("include_tags", false)
      .toString()
      .toRequestBody(uploadedTrackJsonMediaType)

  val request =
    Request.Builder()
      .url("${LoadTurboConfig.DEFAULT_AGENT_URL.trimEnd('/')}/tags/query")
      .post(body)
      .build()
  val response = uploadedTrackHttp.newCall(request).execute()
  if (!response.isSuccessful) return emptyList()
  val raw = response.body?.string().orEmpty()
  if (raw.isBlank()) return emptyList()
  val json = runCatching { JSONObject(raw) }.getOrNull() ?: return emptyList()
  val items = json.optJSONArray("items") ?: return emptyList()
  if (items.length() == 0) return emptyList()

  val out = ArrayList<String>(items.length())
  for (i in 0 until items.length()) {
    val row = items.optJSONObject(i) ?: continue
    val id =
      row.optString("dataitem_id", "").trim()
        .ifBlank { row.optString("dataitemId", "").trim() }
        .ifBlank { row.optString("id", "").trim() }
    if (id.isNotBlank()) out.add(id)
  }
  return out
}

private fun parseEnvelopePayload(
  payload: ByteArray,
  expectedContentId: String,
  expectedOwner: String,
  expectedGrantee: String,
): EciesContentCrypto.EciesEnvelope? {
  val raw = payload.toString(Charsets.UTF_8).trim()
  if (raw.isBlank()) return null
  val json = runCatching { JSONObject(raw) }.getOrNull() ?: return null
  if (json.optInt("version", -1) != 1) return null

  val rawContentId = json.optString("contentId", "").trim()
  if (rawContentId.isEmpty()) return null
  val payloadContentId = normalizeUploadedContentId(rawContentId)
  if (payloadContentId != expectedContentId) return null

  val payloadOwner = json.optString("owner", "").trim().lowercase()
  if (payloadOwner.isEmpty() || payloadOwner != expectedOwner) return null

  val payloadGrantee = json.optString("grantee", "").trim().lowercase()
  if (payloadGrantee.isEmpty() || payloadGrantee != expectedGrantee) return null

  val ephemeralHex = json.optString("ephemeralPub", "").trim()
  val ivHex = json.optString("iv", "").trim()
  val ciphertextHex = json.optString("ciphertext", "").trim()
  if (ephemeralHex.isEmpty() || ivHex.isEmpty() || ciphertextHex.isEmpty()) return null

  val ephemeral = runCatching { P256Utils.hexToBytes(ephemeralHex) }.getOrNull() ?: return null
  val iv = runCatching { P256Utils.hexToBytes(ivHex) }.getOrNull() ?: return null
  val ciphertext = runCatching { P256Utils.hexToBytes(ciphertextHex) }.getOrNull() ?: return null
  if (ephemeral.size != 65 || iv.size != 12 || ciphertext.isEmpty()) return null

  return EciesContentCrypto.EciesEnvelope(
    ephemeralPub = ephemeral,
    iv = iv,
    ciphertext = ciphertext,
  )
}

internal fun fetchUploadedResolvePayload(dataitemId: String): ByteArray {
  return fetchResolveBytes(dataitemId)
}

internal fun fetchUploadedBlob(pieceCid: String): ByteArray {
  return fetchResolveBytes(pieceCid)
}

private fun fetchResolveBytes(dataitemId: String): ByteArray {
  val gatewayUrl = "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/${dataitemId.trim()}"
  val request = Request.Builder().url(gatewayUrl).get().build()
  val response = uploadedTrackHttp.newCall(request).execute()
  if (!response.isSuccessful) {
    throw IllegalStateException("Failed to fetch payload (HTTP ${response.code}).")
  }
  return response.body?.bytes() ?: throw IllegalStateException("Payload is empty.")
}

internal fun normalizeUploadedContentId(raw: String): String {
  val clean = raw.trim().lowercase().removePrefix("0x")
  if (clean.isBlank()) return ""
  return "0x$clean"
}

internal fun isUnsupportedUploadedTrackAlgo(algo: Int?): Boolean {
  return algo != null && algo != ContentCryptoConfig.ALGO_AES_GCM_256
}

internal fun uploadedTrackLegacyUploadError(): String {
  return "Legacy/plaintext upload is not supported. Re-upload encrypted to enable this action."
}

internal fun uploadedTrackMissingWrappedKeyError(): String {
  return "Missing encrypted key for this track. It may be legacy/plaintext, or this wallet has no key copy."
}

internal fun uploadedTrackPreferredExtension(track: MusicTrack): String {
  val fromFilename = track.filename.substringAfterLast('.', "").trim().lowercase()
  return when {
    fromFilename.isNotBlank() && fromFilename.length <= 10 -> fromFilename
    else -> "mp3"
  }
}
