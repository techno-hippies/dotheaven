package com.pirate.app.profile

import com.pirate.app.arweave.Ans104DataItem
import com.pirate.app.tempo.SessionKeyManager

data class ProfileAvatarUploadResult(
  val success: Boolean,
  val avatarRef: String? = null,
  val dataitemId: String? = null,
  val error: String? = null,
)

object ProfileAvatarUploadApi {
  private const val MAX_UPLOAD_BYTES = 1 * 1024 * 1024 // Current loaded-turbo-api freeUploadLimitBytes.

  fun uploadAvatarJpeg(
    jpegBytes: ByteArray,
    sessionKey: SessionKeyManager.SessionKey,
  ): ProfileAvatarUploadResult {
    if (jpegBytes.isEmpty()) {
      return ProfileAvatarUploadResult(success = false, error = "Avatar image is empty.")
    }
    if (jpegBytes.size > MAX_UPLOAD_BYTES) {
      return ProfileAvatarUploadResult(success = false, error = "Avatar image exceeds upload size limit.")
    }

    return runCatching {
      val build = Ans104DataItem.buildAndSign(
        payload = jpegBytes,
        tags = listOf(
          Ans104DataItem.Tag(name = "Content-Type", value = "image/jpeg"),
          Ans104DataItem.Tag(name = "App-Name", value = "Heaven"),
          Ans104DataItem.Tag(name = "Heaven-Type", value = "avatar"),
          Ans104DataItem.Tag(name = "Upload-Source", value = "heaven-android"),
        ),
        sessionKey = sessionKey,
      )
      val id = Ans104DataItem.uploadSignedDataItem(build.bytes).trim()
      if (id.isEmpty()) throw IllegalStateException("Avatar upload returned an empty dataitem id.")

      ProfileAvatarUploadResult(
        success = true,
        avatarRef = "ls3://$id",
        dataitemId = id,
      )
    }.getOrElse { err ->
      ProfileAvatarUploadResult(success = false, error = err.message ?: "Avatar upload failed.")
    }
  }
}
