package com.pirate.app.profile

import android.content.Context
import com.pirate.app.arweave.Ans104DataItem
import com.pirate.app.security.LocalSecp256k1Store

data class ProfileAvatarUploadResult(
  val success: Boolean,
  val avatarRef: String? = null,
  val dataitemId: String? = null,
  val error: String? = null,
)

object ProfileAvatarUploadApi {
  private const val MAX_UPLOAD_BYTES = 1 * 1024 * 1024 // Current loaded-turbo-api freeUploadLimitBytes.

  fun uploadAvatarJpeg(
    appContext: Context,
    ownerEthAddress: String,
    jpegBytes: ByteArray,
  ): ProfileAvatarUploadResult {
    if (jpegBytes.isEmpty()) {
      return ProfileAvatarUploadResult(success = false, error = "Avatar image is empty.")
    }
    if (jpegBytes.size > MAX_UPLOAD_BYTES) {
      return ProfileAvatarUploadResult(success = false, error = "Avatar image exceeds upload size limit.")
    }

    return runCatching {
      val identity = LocalSecp256k1Store.getOrCreateIdentity(appContext, ownerEthAddress)
      val build = Ans104DataItem.buildAndSign(
        payload = jpegBytes,
        tags = listOf(
          Ans104DataItem.Tag(name = "Content-Type", value = "image/jpeg"),
          Ans104DataItem.Tag(name = "App-Name", value = "Heaven"),
          Ans104DataItem.Tag(name = "Heaven-Type", value = "avatar"),
          Ans104DataItem.Tag(name = "Upload-Source", value = "heaven-android"),
        ),
        signingKeyPair = identity.keyPair,
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
