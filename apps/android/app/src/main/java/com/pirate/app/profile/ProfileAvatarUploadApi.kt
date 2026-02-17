package com.pirate.app.profile

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

data class ProfileAvatarUploadResult(
  val success: Boolean,
  val avatarCid: String? = null,
  val error: String? = null,
)

object ProfileAvatarUploadApi {
  private const val HEAVEN_API_URL = "https://heaven-api.deletion-backup782.workers.dev"
  private const val MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // keep in sync with backend /api/upload

  fun uploadAvatarJpeg(jpegBytes: ByteArray): ProfileAvatarUploadResult {
    if (jpegBytes.isEmpty()) {
      return ProfileAvatarUploadResult(success = false, error = "Avatar image is empty.")
    }
    if (jpegBytes.size > MAX_UPLOAD_BYTES) {
      return ProfileAvatarUploadResult(success = false, error = "Avatar image exceeds upload size limit.")
    }

    return runCatching {
      val boundary = "----HeavenAvatar${System.currentTimeMillis()}"
      val url = URL("$HEAVEN_API_URL/api/upload")
      val conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        connectTimeout = 60_000
        readTimeout = 60_000
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      }

      conn.outputStream.use { out ->
        out.write("--$boundary\r\n".toByteArray())
        out.write("Content-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\n".toByteArray())
        out.write("Content-Type: image/jpeg\r\n\r\n".toByteArray())
        out.write(jpegBytes)
        out.write("\r\n".toByteArray())
        out.write("--$boundary--\r\n".toByteArray())
      }

      if (conn.responseCode !in 200..299) {
        val err = conn.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
        throw IllegalStateException(if (err.isBlank()) "Upload failed: HTTP ${conn.responseCode}" else "Upload failed: $err")
      }

      val body = conn.inputStream.bufferedReader().use { it.readText() }
      val json = JSONObject(body)
      val slots = json.optJSONObject("slots") ?: throw IllegalStateException("Invalid upload response.")
      val avatarCid =
        slots.optJSONObject("avatar")?.optString("cid", "")?.ifBlank { null }
          ?: throw IllegalStateException("Upload response missing avatar cid.")
      ProfileAvatarUploadResult(success = true, avatarCid = avatarCid)
    }.getOrElse { err ->
      ProfileAvatarUploadResult(success = false, error = err.message ?: "Avatar upload failed.")
    }
  }
}
