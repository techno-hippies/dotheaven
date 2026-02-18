package com.pirate.app.music

import android.content.Context
import com.pirate.app.arweave.Ans104DataItem
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class UploadedTrackDownloadResult(
  val success: Boolean,
  val alreadyDownloaded: Boolean = false,
  val mediaUri: String? = null,
  val error: String? = null,
)

data class UploadedTrackShareResult(
  val success: Boolean,
  val recipientAddress: String? = null,
  val envelopeId: String? = null,
  val error: String? = null,
)

object UploadedTrackActions {
  private val addressRegex = Regex("^0x[a-fA-F0-9]{40}$")
  private val jsonMediaType = "application/json".toMediaType()

  private val http =
    OkHttpClient.Builder()
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(120, TimeUnit.SECONDS)
      .build()

  suspend fun downloadUploadedTrackToDevice(
    context: Context,
    track: MusicTrack,
    ownerAddress: String? = null,
    granteeAddress: String? = null,
  ): UploadedTrackDownloadResult = withContext(Dispatchers.IO) {
    val contentId = track.contentId?.trim()?.lowercase().orEmpty()
    if (contentId.isEmpty()) {
      return@withContext UploadedTrackDownloadResult(success = false, error = "Track has no contentId.")
    }
    val pieceCid = track.pieceCid?.trim().orEmpty()
    if (pieceCid.isEmpty()) {
      return@withContext UploadedTrackDownloadResult(success = false, error = "Track has no pieceCid.")
    }
    if (isUnsupportedAlgo(track.algo)) {
      return@withContext UploadedTrackDownloadResult(success = false, error = legacyUploadError())
    }

    val existing = DownloadedTracksStore.load(context)[contentId]
    if (existing != null && MediaStoreAudioDownloads.uriExists(context, existing.mediaUri)) {
      return@withContext UploadedTrackDownloadResult(
        success = true,
        alreadyDownloaded = true,
        mediaUri = existing.mediaUri,
      )
    }

    val contentKey = ContentKeyManager.load(context)
      ?: return@withContext UploadedTrackDownloadResult(
        success = false,
        error = "No content encryption key found on this device.",
      )

    var wrappedKey = ContentKeyManager.loadWrappedKey(context, contentId)
    if (wrappedKey == null) {
      val owner = ownerAddress?.trim().orEmpty()
      val grantee = granteeAddress?.trim().orEmpty()
      if (owner.isNotBlank() && grantee.isNotBlank()) {
        ensureWrappedKeyFromLs3(
          context = context,
          contentId = contentId,
          ownerAddress = owner,
          granteeAddress = grantee,
        )
        wrappedKey = ContentKeyManager.loadWrappedKey(context, contentId)
      }
    }
    if (wrappedKey == null) {
      return@withContext UploadedTrackDownloadResult(
        success = false,
        error = missingWrappedKeyError(),
      )
    }
    val resolvedWrappedKey = wrappedKey

    return@withContext runCatching {
      val blob = fetchBlob(pieceCid)
      if (blob.size < 13) {
        throw IllegalStateException("Encrypted payload too small (${blob.size} bytes).")
      }
      val iv = blob.copyOfRange(0, 12)
      val ciphertext = blob.copyOfRange(12, blob.size)

      val aesKey = EciesContentCrypto.eciesDecrypt(contentKey.privateKey, resolvedWrappedKey)
      val audio = try {
        EciesContentCrypto.decryptFile(aesKey, iv, ciphertext)
      } finally {
        aesKey.fill(0)
      }

      val ext = preferredExtension(track)
      val cacheDir = File(context.cacheDir, "heaven_download_tmp").also { it.mkdirs() }
      val tmp = File.createTempFile("content_", ".$ext", cacheDir)
      tmp.writeBytes(audio)

      val preferredName =
        listOf(track.artist.trim(), track.title.trim())
          .filter { it.isNotBlank() }
          .joinToString(" - ")
          .ifBlank { contentId.removePrefix("0x") }

      val mediaUri =
        MediaStoreAudioDownloads.saveAudio(
          context = context,
          sourceFile = tmp,
          title = track.title,
          artist = track.artist,
          album = track.album,
          mimeType = extToMime(ext),
          preferredName = preferredName,
        )
      runCatching { tmp.delete() }

      val entry =
        DownloadedTrackEntry(
          contentId = contentId,
          mediaUri = mediaUri,
          title = track.title,
          artist = track.artist,
          album = track.album,
          filename = tmp.name,
          mimeType = extToMime(ext),
          pieceCid = pieceCid,
          datasetOwner = track.datasetOwner,
          algo = track.algo,
          coverCid = null,
          downloadedAtMs = System.currentTimeMillis(),
        )
      DownloadedTracksStore.upsert(context, entry)

      UploadedTrackDownloadResult(success = true, mediaUri = mediaUri)
    }.getOrElse { err ->
      UploadedTrackDownloadResult(success = false, error = err.message ?: "Download failed.")
    }
  }

  suspend fun shareUploadedTrack(
    context: Context,
    track: MusicTrack,
    recipient: String,
    ownerAddress: String,
  ): UploadedTrackShareResult = withContext(Dispatchers.IO) {
    val contentId = track.contentId?.trim()?.lowercase().orEmpty()
    if (contentId.isEmpty()) {
      return@withContext UploadedTrackShareResult(success = false, error = "Track has no contentId.")
    }
    if (isUnsupportedAlgo(track.algo)) {
      return@withContext UploadedTrackShareResult(success = false, error = legacyUploadError())
    }
    val normalizedRecipientInput = recipient.trim().removePrefix("@").lowercase()
    val recipientAddress = resolveRecipientAddress(normalizedRecipientInput)
      ?: return@withContext UploadedTrackShareResult(
        success = false,
        error = "Recipient must be a wallet, .heaven, or .pirate name.",
      )
    if (recipientAddress.equals(ownerAddress, ignoreCase = true)) {
      return@withContext UploadedTrackShareResult(success = false, error = "Cannot share to your own address.")
    }

    val contentKey = ContentKeyManager.load(context)
      ?: return@withContext UploadedTrackShareResult(
        success = false,
        error = "No content encryption key found on this device.",
      )
    var wrappedKey = ContentKeyManager.loadWrappedKey(context, contentId)
    if (wrappedKey == null) {
      ensureWrappedKeyFromLs3(
        context = context,
        contentId = contentId,
        ownerAddress = ownerAddress,
        granteeAddress = ownerAddress,
      )
      wrappedKey = ContentKeyManager.loadWrappedKey(context, contentId)
    }
    if (wrappedKey == null) {
      return@withContext UploadedTrackShareResult(
        success = false,
        error = missingWrappedKeyError(),
      )
    }
    val resolvedWrappedKey = wrappedKey

    val recipientPub =
      if (addressRegex.matches(normalizedRecipientInput)) {
        TempoNameRecordsApi.getContentPubKeyForAddress(recipientAddress)
      } else {
        TempoNameRecordsApi.getContentPubKeyForName(normalizedRecipientInput)
          ?: TempoNameRecordsApi.getContentPubKeyForAddress(recipientAddress)
      }
      ?: return@withContext UploadedTrackShareResult(
        success = false,
        error = "Recipient has no published contentPubKey. They must set a primary name and upload once to publish encryption keys.",
      )

    val ownerSessionKey = SessionKeyManager.load(context)?.takeIf {
      SessionKeyManager.isValid(it, ownerAddress = ownerAddress)
    } ?: return@withContext UploadedTrackShareResult(
      success = false,
      error = "Missing valid Tempo session key. Please sign in again.",
    )

    return@withContext runCatching {
      val ownerAesKey = EciesContentCrypto.eciesDecrypt(contentKey.privateKey, resolvedWrappedKey)
      val envelope = try {
        EciesContentCrypto.eciesEncrypt(recipientPub, ownerAesKey)
      } finally {
        ownerAesKey.fill(0)
      }

      val payload =
        JSONObject()
          .put("version", 1)
          .put("contentId", contentId)
          .put("owner", ownerAddress.trim().lowercase())
          .put("grantee", recipientAddress)
          .put("algo", track.algo ?: ContentCryptoConfig.ALGO_AES_GCM_256)
          .put("ephemeralPub", P256Utils.bytesToHex(envelope.ephemeralPub))
          .put("iv", P256Utils.bytesToHex(envelope.iv))
          .put("ciphertext", P256Utils.bytesToHex(envelope.ciphertext))
          .toString()
          .toByteArray(Charsets.UTF_8)

      val signed =
        Ans104DataItem.buildAndSign(
          payload = payload,
          tags =
            listOf(
              Ans104DataItem.Tag(name = "Content-Type", value = "application/json"),
              Ans104DataItem.Tag(name = "App-Name", value = "Heaven"),
              Ans104DataItem.Tag(name = "Heaven-Type", value = "content-key-envelope"),
              Ans104DataItem.Tag(name = "Content-Id", value = contentId),
              Ans104DataItem.Tag(name = "Owner", value = ownerAddress.trim().lowercase()),
              Ans104DataItem.Tag(name = "Grantee", value = recipientAddress),
              Ans104DataItem.Tag(name = "Upload-Source", value = "heaven-android"),
            ),
          sessionKey = ownerSessionKey,
        )
      val envelopeId = Ans104DataItem.uploadSignedDataItem(signed.bytes).trim()
      if (envelopeId.isEmpty()) {
        throw IllegalStateException("Envelope upload returned empty id.")
      }

      UploadedTrackShareResult(
        success = true,
        recipientAddress = recipientAddress,
        envelopeId = envelopeId,
      )
    }.getOrElse { err ->
      UploadedTrackShareResult(
        success = false,
        recipientAddress = recipientAddress,
        error = err.message ?: "Share failed.",
      )
    }
  }

  private suspend fun resolveRecipientAddress(rawRecipient: String): String? {
    val clean = rawRecipient.trim().removePrefix("@")
    if (clean.isBlank()) return null
    if (addressRegex.matches(clean)) return clean.lowercase()
    val resolved = TempoNameRecordsApi.resolveAddressForName(clean.lowercase())
    return resolved?.lowercase()
  }

  internal suspend fun ensureWrappedKeyFromLs3(
    context: Context,
    contentId: String,
    ownerAddress: String,
    granteeAddress: String,
  ): Boolean = withContext(Dispatchers.IO) {
    val normalizedContentId = normalizeContentId(contentId)
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
        .toRequestBody(jsonMediaType)

    val req =
      Request.Builder()
        .url("${LoadTurboConfig.DEFAULT_AGENT_URL.trimEnd('/')}/tags/query")
        .post(body)
        .build()
    val res = http.newCall(req).execute()
    if (!res.isSuccessful) return emptyList()
    val raw = res.body?.string().orEmpty()
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
    val payloadContentId = normalizeContentId(rawContentId)
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

  private fun fetchResolveBytes(dataitemId: String): ByteArray {
    val gatewayUrl = "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/${dataitemId.trim()}"
    val request = Request.Builder().url(gatewayUrl).get().build()
    val response = http.newCall(request).execute()
    if (!response.isSuccessful) {
      throw IllegalStateException("Failed to fetch payload (HTTP ${response.code}).")
    }
    return response.body?.bytes() ?: throw IllegalStateException("Payload is empty.")
  }

  internal fun fetchResolvePayload(dataitemId: String): ByteArray {
    return fetchResolveBytes(dataitemId)
  }

  private fun fetchBlob(pieceCid: String): ByteArray {
    return fetchResolveBytes(pieceCid)
  }

  private fun normalizeContentId(raw: String): String {
    val clean = raw.trim().lowercase().removePrefix("0x")
    if (clean.isBlank()) return ""
    return "0x$clean"
  }

  private fun isUnsupportedAlgo(algo: Int?): Boolean {
    return algo != null && algo != ContentCryptoConfig.ALGO_AES_GCM_256
  }

  private fun legacyUploadError(): String {
    return "Legacy/plaintext upload is not supported. Re-upload encrypted to enable this action."
  }

  private fun missingWrappedKeyError(): String {
    return "Missing encrypted key for this track. It may be legacy/plaintext, or this wallet has no key copy."
  }

  private fun preferredExtension(track: MusicTrack): String {
    val fromFilename = track.filename.substringAfterLast('.', "").trim().lowercase()
    return when {
      fromFilename.isNotBlank() && fromFilename.length <= 10 -> fromFilename
      else -> "mp3"
    }
  }

  private fun extToMime(ext: String): String? {
    return when (ext.trim().lowercase()) {
      "mp3" -> "audio/mpeg"
      "flac" -> "audio/flac"
      "wav" -> "audio/wav"
      "aac" -> "audio/aac"
      "ogg" -> "audio/ogg"
      "m4a", "mp4" -> "audio/mp4"
      else -> null
    }
  }
}
