package com.pirate.app.music

import android.content.Context
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

internal data class SongPublishApiResponse(
  val status: Int,
  val body: String,
  val json: JSONObject?,
)

internal fun songPublishSha256Hex(data: ByteArray): String {
  val digest = MessageDigest.getInstance("SHA-256").digest(data)
  return digest.joinToString("") { "%02x".format(it) }
}

internal fun songPublishReadUriWithMaxBytes(context: Context, uri: Uri, maxBytes: Int): ByteArray {
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

internal fun songPublishReadCoverUriWithMaxBytes(context: Context, uri: Uri, maxBytes: Int): ByteArray {
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

internal fun songPublishGetMimeType(context: Context, uri: Uri): String =
  context.contentResolver.getType(uri) ?: "application/octet-stream"

internal fun songPublishGuessImageExtension(mimeType: String): String {
  val normalized = mimeType.trim().lowercase()
  return when {
    normalized.contains("png") -> "png"
    normalized.contains("webp") -> "webp"
    normalized.contains("gif") -> "gif"
    else -> "jpg"
  }
}

internal fun songPublishCacheRecentCoverRef(
  context: Context,
  coverUri: Uri,
  audioSha256: String,
  recentCoversDir: String,
  maxCoverBytes: Int,
): String? {
  return runCatching {
    val mime = songPublishGetMimeType(context, coverUri)
    val ext = songPublishGuessImageExtension(mime)
    val dir = File(context.filesDir, recentCoversDir)
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
          if (total > maxCoverBytes) {
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

private fun songPublishParseJsonObject(raw: String): JSONObject? {
  if (raw.isBlank()) return null
  return runCatching { JSONObject(raw) }.getOrNull()
}

private fun songPublishReadApiResponse(conn: HttpURLConnection): SongPublishApiResponse {
  val status = conn.responseCode
  val body = (if (status in 200..299) conn.inputStream else conn.errorStream)
    ?.bufferedReader()
    ?.use { it.readText() }
    .orEmpty()
  return SongPublishApiResponse(status = status, body = body, json = songPublishParseJsonObject(body))
}

internal fun songPublishErrorMessageFromApi(
  operation: String,
  response: SongPublishApiResponse,
): String {
  val base =
    response.json
      ?.optString("error", "")
      ?.trim()
      ?.ifBlank { null }
      ?: response.json
        ?.optString("details", "")
        ?.trim()
        ?.ifBlank { null }
      ?: response.body.trim().ifBlank { null }
      ?: "HTTP ${response.status}"
  return "$operation failed: $base"
}

internal fun songPublishPostJsonToMusicApi(
  path: String,
  userPkp: String,
  body: JSONObject,
): SongPublishApiResponse {
  val url = URL("${SongPublishService.API_CORE_URL}$path")
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
  return songPublishReadApiResponse(conn)
}

internal fun songPublishFinalizeMusicPublish(
  jobId: String,
  userPkp: String,
  title: String,
  artist: String,
  album: String = "",
): SongPublishApiResponse {
  val body = JSONObject().apply {
    put("title", title.trim())
    put("artist", artist.trim())
    put("album", album.trim())
  }
  return songPublishPostJsonToMusicApi(
    path = "/api/music/publish/$jobId/finalize",
    userPkp = userPkp,
    body = body,
  )
}

internal fun songPublishStageAudioForMusicPublish(
  audioBytes: ByteArray,
  audioMime: String,
  audioSha256: String,
  userPkp: String,
  idempotencyKey: String,
): SongPublishApiResponse {
  val boundary = "----HeavenMusicStart${System.currentTimeMillis()}"
  val url = URL("${SongPublishService.API_CORE_URL}/api/music/publish/start")
  val conn = (url.openConnection() as HttpURLConnection).apply {
    requestMethod = "POST"
    doOutput = true
    connectTimeout = 120_000
    readTimeout = 120_000
    setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
    setRequestProperty("X-User-Pkp", userPkp)
    setRequestProperty("Idempotency-Key", idempotencyKey)
  }

  val tags =
    """[{"key":"App-Name","value":"Heaven"},{"key":"Upload-Source","value":"android-song-publish"}]"""
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

  return songPublishReadApiResponse(conn)
}

internal fun songPublishStageArtifactsForMusicPublish(
  jobId: String,
  userPkp: String,
  coverBytes: ByteArray,
  coverMime: String,
  lyricsText: String,
): SongPublishApiResponse {
  val boundary = "----HeavenMusicArtifacts${System.currentTimeMillis()}"
  val url = URL("${SongPublishService.API_CORE_URL}/api/music/publish/$jobId/artifacts/stage")
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

  return songPublishReadApiResponse(conn)
}

internal fun songPublishRequireJobObject(
  operation: String,
  response: SongPublishApiResponse,
): JSONObject {
  val job = response.json?.optJSONObject("job")
  if (job != null) return job
  throw IllegalStateException("$operation failed: missing job in response")
}

internal fun songPublishExtractDataitemId(job: JSONObject): String? {
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
  val stagedId =
    job
      .optJSONObject("upload")
      ?.optString("stagedDataitemId", "")
      ?.trim()
      .orEmpty()
  return stagedId.ifBlank { null }
}

internal fun songPublishExtractStagedCoverGatewayUrl(job: JSONObject): String? {
  return job
    .optJSONObject("upload")
    ?.optJSONObject("cover")
    ?.optString("stagedGatewayUrl", "")
    ?.trim()
    ?.ifBlank { null }
}

internal fun songPublishNormalizeUserPkp(address: String): String {
  val clean = address.trim().lowercase()
  if (!Regex("^0x[a-f0-9]{40}$").matches(clean)) {
    throw IllegalStateException("Invalid user PKP address: $address")
  }
  return clean
}
