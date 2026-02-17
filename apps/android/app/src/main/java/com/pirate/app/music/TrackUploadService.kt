package com.pirate.app.music

import android.content.Context
import android.net.Uri
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

data class UploadAndRegisterResult(
  val trackId: String,
  val contentId: String,
  val pieceCid: String,
  val gatewayUrl: String?,
  val datasetOwner: String,
  val algo: Int,
)

object TrackUploadService {

  /**
   * Encrypt a local track with ECIES + AES-256-GCM, upload to Load network.
   *
   * Uses the persistent content encryption keypair (ContentKeyManager) to wrap
   * the AES key. The wrapped key is auto-persisted per contentId for later decrypt.
   *
   * @param ownerEthAddress  Tempo account address (for contentId derivation)
   * @param track  local music track to upload
   */
  suspend fun uploadEncrypted(
    context: Context,
    ownerEthAddress: String,
    track: MusicTrack,
  ): UploadAndRegisterResult = withContext(Dispatchers.IO) {
    val contentKey = ContentKeyManager.getOrCreate(context)
    val trackId = TrackIds.computeMetaTrackId(track.title, track.artist, track.album).lowercase()
    val computedContentId = ContentIds.computeContentId(trackId, ownerEthAddress).lowercase()

    // Read raw audio
    val uri = Uri.parse(track.uri)
    val payload = readAllBytesFromContentUri(context, uri)

    // AES-256-GCM encrypt the file
    val encrypted = EciesContentCrypto.encryptFile(payload)

    // ECIES-wrap the AES key to content encryption pubkey
    val wrappedKey = EciesContentCrypto.eciesEncrypt(contentKey.publicKey, encrypted.rawKey)

    // Build upload blob: [iv (12)] [aes ciphertext] (simple format — key stored separately)
    val blob = encrypted.iv + encrypted.ciphertext

    // Clear raw AES key from memory
    encrypted.rawKey.fill(0)

    // Upload to Load network
    val filename = "${buildFilenameHint(track)}.enc"
    val upload = LoadUploadApi.upload(
      blob = blob,
      filename = filename,
      tags = listOf(
        "App-Name" to "Heaven",
        "Upload-Source" to "heaven-android",
        "Track-Id" to trackId,
        "Content-Id" to computedContentId,
        "Owner" to ownerEthAddress.lowercase(),
      ),
    )

    // Persist wrapped key for later decrypt
    ContentKeyManager.saveWrappedKey(context, computedContentId, wrappedKey)

    UploadAndRegisterResult(
      trackId = trackId,
      contentId = computedContentId,
      pieceCid = upload.id,
      gatewayUrl = upload.gatewayUrl,
      datasetOwner = ownerEthAddress.lowercase(),
      algo = ContentCryptoConfig.ALGO_AES_GCM_256,
    )
  }
}

private fun buildFilenameHint(track: MusicTrack): String {
  val ext = track.filename.substringAfterLast('.', "").lowercase().takeIf { it.isNotBlank() } ?: "bin"
  val slug = track.title.lowercase().trim().replace(Regex("[^a-z0-9]+"), "-").trim('-')
  val base = slug.ifBlank { "track" }
  return "${base}.${ext}"
}

private fun readAllBytesFromContentUri(context: Context, uri: Uri): ByteArray {
  context.contentResolver.openInputStream(uri)?.use { input ->
    val out = ByteArrayOutputStream()
    val buf = ByteArray(DEFAULT_BUFFER_SIZE)
    while (true) {
      val read = input.read(buf)
      if (read <= 0) break
      out.write(buf, 0, read)
    }
    return out.toByteArray()
  }
  throw IllegalStateException("Unable to open content URI: $uri")
}
