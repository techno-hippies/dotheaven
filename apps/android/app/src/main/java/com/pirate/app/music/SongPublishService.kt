package com.pirate.app.music

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID

/**
 * Song publish flow via heaven-api:
 * 1) Stage audio upload to Load
 * 2) Stage supporting artifacts to Load (cover + lyrics)
 * 3) Run preflight checks
 * 4) Finalize on Tempo (ScrobbleV4 + ContentRegistry)
 */
object SongPublishService {

  private const val TAG = "SongPublish"
  const val HEAVEN_API_URL = "https://heaven-api.deletion-backup782.workers.dev"
  private const val MAX_AUDIO_BYTES = 50 * 1024 * 1024 // Matches backend /api/music/publish/start limit.
  private const val PREFLIGHT_MAX_RETRIES = 3
  private const val PREFLIGHT_RETRY_DELAY_MS = 2_000L
  private const val RECENT_COVERS_DIR = "recent_release_covers"
  private const val MAX_COVER_BYTES = 10 * 1024 * 1024
  private const val MAX_LYRICS_BYTES = 256 * 1024

  data class SongFormData(
    val title: String = "",
    val artist: String = "",
    val genre: String = "pop",
    val primaryLanguage: String = "en",
    val secondaryLanguage: String = "",
    val lyrics: String = "",
    val coverUri: Uri? = null,
    val audioUri: Uri? = null,
    val vocalsUri: Uri? = null,
    val instrumentalUri: Uri? = null,
    val canvasUri: Uri? = null,
    val license: String = "non-commercial", // "non-commercial" | "commercial-use" | "commercial-remix"
    val revShare: Int = 0,
    val mintingFee: String = "0",
    val attestation: Boolean = false,
  )

  data class PublishResult(
    val jobId: String,
    val status: String,
    val stagedAudioId: String?,
    val stagedAudioUrl: String?,
    val audioSha256: String,
    val coverCid: String? = null,
  )

  private data class ApiResponse(
    val status: Int,
    val body: String,
    val json: JSONObject?,
  )

  private fun sha256Hex(data: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(data)
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun readUriWithMaxBytes(context: Context, uri: Uri, maxBytes: Int): ByteArray {
    // Fast-path when provider exposes content length.
    context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { afd ->
      val length = afd.length
      if (length > maxBytes) {
        throw IllegalStateException("Audio file exceeds 50MB limit ($length bytes)")
      }
    }

    val stream = context.contentResolver.openInputStream(uri)
      ?: throw IllegalStateException("Cannot open URI: $uri")

    stream.use { input ->
      val out = ByteArrayOutputStream()
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      var total = 0
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        total += read
        if (total > maxBytes) {
          throw IllegalStateException("Audio file exceeds 50MB limit ($total bytes)")
        }
        out.write(buffer, 0, read)
      }
      if (total == 0) throw IllegalStateException("Audio file is empty")
      return out.toByteArray()
    }
  }

  private fun readCoverUriWithMaxBytes(context: Context, uri: Uri, maxBytes: Int): ByteArray {
    // Fast-path when provider exposes content length.
    context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { afd ->
      val length = afd.length
      if (length > maxBytes) {
        throw IllegalStateException("Cover file exceeds 10MB limit ($length bytes)")
      }
    }

    val stream = context.contentResolver.openInputStream(uri)
      ?: throw IllegalStateException("Cannot open URI: $uri")

    stream.use { input ->
      val out = ByteArrayOutputStream()
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      var total = 0
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        total += read
        if (total > maxBytes) {
          throw IllegalStateException("Cover file exceeds 10MB limit ($total bytes)")
        }
        out.write(buffer, 0, read)
      }
      if (total == 0) throw IllegalStateException("Cover file is empty")
      return out.toByteArray()
    }
  }

  private fun getMimeType(context: Context, uri: Uri): String {
    return context.contentResolver.getType(uri) ?: "application/octet-stream"
  }

  private fun guessImageExtension(mimeType: String): String {
    val normalized = mimeType.trim().lowercase()
    return when {
      normalized.contains("png") -> "png"
      normalized.contains("webp") -> "webp"
      normalized.contains("gif") -> "gif"
      else -> "jpg"
    }
  }

  private fun cacheRecentCoverRef(
    context: Context,
    coverUri: Uri,
    audioSha256: String,
  ): String? {
    return runCatching {
      val mime = getMimeType(context, coverUri)
      val ext = guessImageExtension(mime)
      val dir = File(context.filesDir, RECENT_COVERS_DIR)
      if (!dir.exists()) dir.mkdirs()
      val file = File(dir, "${audioSha256.take(24)}.$ext")

      context.contentResolver.openInputStream(coverUri)?.use { input ->
        file.outputStream().use { out ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          var total = 0L
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            total += read
            if (total > MAX_COVER_BYTES) {
              throw IllegalStateException("Cover image exceeds 10MB local cache limit")
            }
            out.write(buffer, 0, read)
          }
          if (total == 0L) throw IllegalStateException("Cover image is empty")
        }
      } ?: throw IllegalStateException("Cannot open cover URI: $coverUri")

      Uri.fromFile(file).toString()
    }.getOrNull()
  }

  private fun parseJsonObject(raw: String): JSONObject? {
    if (raw.isBlank()) return null
    return runCatching { JSONObject(raw) }.getOrNull()
  }

  private fun readApiResponse(conn: HttpURLConnection): ApiResponse {
    val status = conn.responseCode
    val body = (if (status in 200..299) conn.inputStream else conn.errorStream)
      ?.bufferedReader()
      ?.use { it.readText() }
      .orEmpty()
    return ApiResponse(status = status, body = body, json = parseJsonObject(body))
  }

  private fun errorMessageFromApi(operation: String, response: ApiResponse): String {
    val base = response.json?.optString("error", "")
      ?.trim()
      ?.ifBlank { null }
      ?: response.json?.optString("details", "")
        ?.trim()
        ?.ifBlank { null }
      ?: response.body.trim().ifBlank { null }
      ?: "HTTP ${response.status}"
    return "$operation failed: $base"
  }

  private fun postJsonToMusicApi(
    path: String,
    userPkp: String,
    body: JSONObject,
  ): ApiResponse {
    val url = URL("$HEAVEN_API_URL$path")
    val conn = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      connectTimeout = 120_000
      readTimeout = 120_000
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("X-User-Pkp", userPkp)
    }
    conn.outputStream.use { out ->
      out.write(body.toString().toByteArray(Charsets.UTF_8))
    }
    return readApiResponse(conn)
  }

  private fun finalizeMusicPublish(
    jobId: String,
    userPkp: String,
    title: String,
    artist: String,
    album: String = "",
  ): ApiResponse {
    val body = JSONObject().apply {
      put("title", title.trim())
      put("artist", artist.trim())
      put("album", album.trim())
    }
    return postJsonToMusicApi(
      path = "/api/music/publish/$jobId/finalize",
      userPkp = userPkp,
      body = body,
    )
  }

  private fun stageAudioForMusicPublish(
    audioBytes: ByteArray,
    audioMime: String,
    audioSha256: String,
    userPkp: String,
    idempotencyKey: String,
  ): ApiResponse {
    val boundary = "----HeavenMusicStart${System.currentTimeMillis()}"
    val url = URL("$HEAVEN_API_URL/api/music/publish/start")
    val conn = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      connectTimeout = 120_000
      readTimeout = 120_000
      setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      setRequestProperty("X-User-Pkp", userPkp)
      setRequestProperty("Idempotency-Key", idempotencyKey)
    }

    val tags = """[{"key":"App-Name","value":"Heaven"},{"key":"Upload-Source","value":"android-song-publish"}]"""
    val fingerprint = "sha256:$audioSha256"

    conn.outputStream.use { out ->
      fun writeField(name: String, value: String) {
        out.write("--$boundary\r\n".toByteArray())
        out.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n".toByteArray())
        out.write(value.toByteArray(Charsets.UTF_8))
        out.write("\r\n".toByteArray())
      }

      out.write("--$boundary\r\n".toByteArray())
      out.write("Content-Disposition: form-data; name=\"file\"; filename=\"audio.bin\"\r\n".toByteArray())
      out.write("Content-Type: $audioMime\r\n\r\n".toByteArray())
      out.write(audioBytes)
      out.write("\r\n".toByteArray())

      writeField("publishType", "original")
      writeField("contentType", audioMime)
      writeField("audioSha256", audioSha256)
      writeField("fingerprint", fingerprint)
      writeField("idempotencyKey", idempotencyKey)
      writeField("tags", tags)
      out.write("--$boundary--\r\n".toByteArray())
    }

    return readApiResponse(conn)
  }

  private fun stageArtifactsForMusicPublish(
    jobId: String,
    userPkp: String,
    coverBytes: ByteArray,
    coverMime: String,
    lyricsText: String,
  ): ApiResponse {
    val boundary = "----HeavenMusicArtifacts${System.currentTimeMillis()}"
    val url = URL("$HEAVEN_API_URL/api/music/publish/$jobId/artifacts/stage")
    val conn = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      connectTimeout = 120_000
      readTimeout = 120_000
      setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      setRequestProperty("X-User-Pkp", userPkp)
    }

    conn.outputStream.use { out ->
      fun writeField(name: String, value: String) {
        out.write("--$boundary\r\n".toByteArray())
        out.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n".toByteArray())
        out.write(value.toByteArray(Charsets.UTF_8))
        out.write("\r\n".toByteArray())
      }

      out.write("--$boundary\r\n".toByteArray())
      out.write("Content-Disposition: form-data; name=\"cover\"; filename=\"cover.bin\"\r\n".toByteArray())
      out.write("Content-Type: $coverMime\r\n\r\n".toByteArray())
      out.write(coverBytes)
      out.write("\r\n".toByteArray())

      writeField("coverContentType", coverMime)
      writeField("lyricsText", lyricsText)
      out.write("--$boundary--\r\n".toByteArray())
    }

    return readApiResponse(conn)
  }

  private fun requireJobObject(operation: String, response: ApiResponse): JSONObject {
    val job = response.json?.optJSONObject("job")
    if (job != null) return job
    throw IllegalStateException("$operation failed: missing job in response")
  }

  private fun extractDataitemId(job: JSONObject): String? {
    val anchor = job.optJSONObject("anchor")
    if (anchor != null) {
      val explicitId = anchor.optString("dataitemId", "").trim()
      if (explicitId.isNotBlank()) return explicitId
      val ref = anchor.optString("ref", "").trim()
      if (ref.startsWith("ar://")) {
        return ref.removePrefix("ar://").trim().ifBlank { null }
      }
      val arweaveUrl = anchor.optString("arweaveUrl", "").trim()
      if (arweaveUrl.startsWith("http://") || arweaveUrl.startsWith("https://")) {
        return arweaveUrl.substringAfterLast('/').trim().ifBlank { null }
      }
    }
    val stagedId = job
      .optJSONObject("upload")
      ?.optString("stagedDataitemId", "")
      ?.trim()
      .orEmpty()
    return stagedId.ifBlank { null }
  }

  private fun extractStagedCoverGatewayUrl(job: JSONObject): String? {
    return job
      .optJSONObject("upload")
      ?.optJSONObject("cover")
      ?.optString("stagedGatewayUrl", "")
      ?.trim()
      ?.ifBlank { null }
  }

  private fun normalizeUserPkp(address: String): String {
    val clean = address.trim().lowercase()
    if (!Regex("^0x[a-f0-9]{40}$").matches(clean)) {
      throw IllegalStateException("Invalid user PKP address: $address")
    }
    return clean
  }

  suspend fun publish(
    context: Context,
    formData: SongFormData,
    ownerAddress: String,
    onProgress: (Int) -> Unit,
  ): PublishResult {
    val userPkp = normalizeUserPkp(ownerAddress)
    if (formData.title.isBlank()) throw IllegalStateException("Song title is required")
    if (formData.artist.isBlank()) throw IllegalStateException("Artist is required")
    if (formData.lyrics.isBlank()) throw IllegalStateException("Lyrics are required")

    onProgress(2)

    val audioUri = formData.audioUri ?: throw IllegalStateException("Audio file is required")
    val coverUri = formData.coverUri ?: throw IllegalStateException("Cover image is required")

    val audioBytes = readUriWithMaxBytes(context, audioUri, MAX_AUDIO_BYTES)
    val coverBytes = readCoverUriWithMaxBytes(context, coverUri, MAX_COVER_BYTES)

    val detectedAudioMime = getMimeType(context, audioUri)
    val audioMime = if (detectedAudioMime.startsWith("audio/")) detectedAudioMime else "audio/mpeg"
    val detectedCoverMime = getMimeType(context, coverUri)
    val coverMime = if (detectedCoverMime.startsWith("image/")) detectedCoverMime else "image/jpeg"
    val audioSha256 = sha256Hex(audioBytes)
    val lyricsBytes = formData.lyrics.toByteArray(Charsets.UTF_8)
    if (lyricsBytes.size > MAX_LYRICS_BYTES) {
      throw IllegalStateException("Lyrics exceed 256KB limit (${lyricsBytes.size} bytes)")
    }

    onProgress(15)

    val idempotencyKey = "music-android-${UUID.randomUUID()}"
    val startResponse = stageAudioForMusicPublish(
      audioBytes = audioBytes,
      audioMime = audioMime,
      audioSha256 = audioSha256,
      userPkp = userPkp,
      idempotencyKey = idempotencyKey,
    )
    if (startResponse.status !in 200..299) {
      throw IllegalStateException(errorMessageFromApi("Audio staging upload", startResponse))
    }

    val startJob = requireJobObject("Audio staging upload", startResponse)
    val jobId = startJob.optString("jobId", "").trim()
    if (jobId.isBlank()) throw IllegalStateException("Audio staging upload failed: missing jobId")

    onProgress(35)

    val artifactsResponse = stageArtifactsForMusicPublish(
      jobId = jobId,
      userPkp = userPkp,
      coverBytes = coverBytes,
      coverMime = coverMime,
      lyricsText = formData.lyrics,
    )
    if (artifactsResponse.status !in 200..299) {
      if (artifactsResponse.status == 404) {
        throw IllegalStateException(
          "Artifact staging endpoint not found. Backend is outdated; deploy latest heaven-api.",
        )
      }
      throw IllegalStateException(errorMessageFromApi("Artifact staging", artifactsResponse))
    }
    val artifactsJob = requireJobObject("Artifact staging", artifactsResponse)
    var stagedCoverGatewayUrl = extractStagedCoverGatewayUrl(artifactsJob)

    onProgress(50)

    var preflightResponse: ApiResponse? = null
    for (attempt in 1..PREFLIGHT_MAX_RETRIES) {
      val preflightBody = JSONObject().apply {
        put("jobId", jobId)
        put("publishType", "original")
        put("fingerprint", "sha256:$audioSha256")
      }
      val response = postJsonToMusicApi(
        path = "/api/music/preflight",
        userPkp = userPkp,
        body = preflightBody,
      )
      val policyReasonCode = response.json
        ?.optJSONObject("job")
        ?.optJSONObject("policy")
        ?.optString("reasonCode", "")
        ?.trim()
        .orEmpty()
      val retryable = response.status == 502 && (
        policyReasonCode == "hash_verification_unavailable" ||
          response.json?.optString("error", "")
            ?.lowercase()
            ?.contains("hash verification unavailable") == true
        )
      if (!retryable || attempt == PREFLIGHT_MAX_RETRIES) {
        preflightResponse = response
        break
      }
      delay(PREFLIGHT_RETRY_DELAY_MS)
    }

    val finalPreflight = preflightResponse ?: throw IllegalStateException("Preflight checks failed unexpectedly")
    if (finalPreflight.status !in 200..299) {
      throw IllegalStateException(errorMessageFromApi("Preflight checks", finalPreflight))
    }
    val preflightJob = requireJobObject("Preflight checks", finalPreflight)
    val preflightStatus = preflightJob.optString("status", "").trim()
    if (preflightStatus != "policy_passed") {
      val reason = preflightJob
        .optJSONObject("policy")
        ?.optString("reason", "")
        ?.trim()
        .orEmpty()
      val reasonCode = preflightJob
        .optJSONObject("policy")
        ?.optString("reasonCode", "")
        ?.trim()
        .orEmpty()
      throw IllegalStateException(
        "Upload policy did not pass (status=$preflightStatus${if (reasonCode.isNotBlank()) ", reasonCode=$reasonCode" else ""}${if (reason.isNotBlank()) ", reason=$reason" else ""})",
      )
    }

    val stagedAudioId = extractDataitemId(preflightJob)
    val stagedAudioUrl = preflightJob
      .optJSONObject("upload")
      ?.optString("stagedGatewayUrl", "")
      ?.trim()
      ?.ifBlank { null }
    if (stagedCoverGatewayUrl.isNullOrBlank()) {
      stagedCoverGatewayUrl = extractStagedCoverGatewayUrl(preflightJob)
    }
    if (stagedCoverGatewayUrl.isNullOrBlank()) {
      throw IllegalStateException("Artifact staging succeeded but staged cover URL is missing")
    }

    onProgress(88)

    val finalizeResponse = finalizeMusicPublish(
      jobId = jobId,
      userPkp = userPkp,
      title = formData.title,
      artist = formData.artist,
      album = "",
    )
    if (finalizeResponse.status !in 200..299) {
      if (finalizeResponse.status == 404) {
        throw IllegalStateException(
          "Finalize endpoint not found. Backend is outdated; deploy latest heaven-api.",
        )
      }
      throw IllegalStateException(errorMessageFromApi("Tempo finalize", finalizeResponse))
    }
    val finalizeJob = requireJobObject("Tempo finalize", finalizeResponse)
    val finalizedStatus = finalizeJob.optString("status", "").trim()
    if (finalizedStatus != "registered") {
      throw IllegalStateException("Tempo finalize did not complete (status=$finalizedStatus)")
    }

    onProgress(100)

    val cachedCoverRef = cacheRecentCoverRef(
      context = context,
      coverUri = coverUri,
      audioSha256 = audioSha256,
    )

    val canonicalCoverRef = stagedCoverGatewayUrl

    val result = PublishResult(
      jobId = jobId,
      status = finalizedStatus,
      stagedAudioId = stagedAudioId,
      stagedAudioUrl = stagedAudioUrl,
      audioSha256 = audioSha256,
      coverCid = canonicalCoverRef,
    )

    runCatching {
      RecentlyPublishedSongsStore.record(
        context = context,
        title = formData.title,
        artist = formData.artist,
        audioCid = result.stagedAudioUrl ?: result.stagedAudioId,
        coverCid = result.coverCid,
      )
    }.onFailure { err ->
      android.util.Log.w(TAG, "Failed to cache recently published song", err)
    }

    return result
  }
}
