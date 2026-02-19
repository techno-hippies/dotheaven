package com.pirate.app.music

import android.content.Context
import android.net.Uri
import com.pirate.app.arweave.ArweaveUploadApi
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

data class SaveForeverResult(
  val trackId: String,
  val contentId: String,
  val permanentRef: String,
  val permanentGatewayUrl: String,
  val permanentSavedAtMs: Long,
  val datasetOwner: String,
  val algo: Int,
)

object TrackSaveForeverService {
  // Guardrail for mobile heap pressure while building encrypted payload + ANS-104.
  private const val MAX_AUDIO_BYTES = 50 * 1024 * 1024

  suspend fun saveForever(
    context: Context,
    ownerEthAddress: String,
    track: MusicTrack,
  ): SaveForeverResult = withContext(Dispatchers.IO) {
    val owner = ownerEthAddress.trim().lowercase()
    val trackId = TrackIds.computeMetaTrackId(track.title, track.artist, track.album).lowercase()
    val computedContentId = ContentIds.computeContentId(trackId, owner).lowercase()
    val contentId = normalizeContentId(track.contentId) ?: computedContentId

    SessionKeyManager.load(context)?.takeIf {
      SessionKeyManager.isValid(it, ownerAddress = owner)
    } ?: throw IllegalStateException("Missing valid Tempo session key. Please sign in again.")

    val encryptedBlob = readAndEncryptLocalAudio(context, track, contentId) ?: run {
      val pieceCid = track.pieceCid?.trim().orEmpty()
      if (pieceCid.isBlank()) {
        throw IllegalStateException("Track source is unavailable for Save Forever.")
      }
      UploadedTrackActions.fetchResolvePayload(pieceCid)
    }

    require(encryptedBlob.size <= MAX_AUDIO_BYTES) {
      "Track exceeds the mobile Save Forever limit (50 MB)."
    }

    val filename = buildEncryptedFilename(track)
    val upload = ArweaveUploadApi.uploadEncryptedAudio(
      context = context,
      ownerEthAddress = owner,
      encryptedBlob = encryptedBlob,
      filename = filename,
      contentId = contentId,
      trackId = trackId,
      algo = ContentCryptoConfig.ALGO_AES_GCM_256,
    )

    SaveForeverResult(
      trackId = trackId,
      contentId = contentId,
      permanentRef = upload.arRef,
      permanentGatewayUrl = upload.gatewayUrl,
      permanentSavedAtMs = System.currentTimeMillis(),
      datasetOwner = owner,
      algo = ContentCryptoConfig.ALGO_AES_GCM_256,
    )
  }

  private fun readAndEncryptLocalAudio(
    context: Context,
    track: MusicTrack,
    contentId: String,
  ): ByteArray? {
    val uri = runCatching { Uri.parse(track.uri) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase().orEmpty()
    if (scheme != "content" && scheme != "file") return null

    val payload = runCatching { readAllBytesFromContentUri(context, uri) }.getOrNull() ?: return null
    if (payload.isEmpty()) return null

    val contentKey = ContentKeyManager.getOrCreate(context)
    val encrypted = EciesContentCrypto.encryptFile(payload)
    val wrappedKey = EciesContentCrypto.eciesEncrypt(contentKey.publicKey, encrypted.rawKey)
    val blob = encrypted.iv + encrypted.ciphertext
    encrypted.rawKey.fill(0)

    ContentKeyManager.saveWrappedKey(context, contentId, wrappedKey)
    return blob
  }

  private fun buildEncryptedFilename(track: MusicTrack): String {
    val ext = track.filename.substringAfterLast('.', "").lowercase().takeIf { it.isNotBlank() } ?: "bin"
    val slug = track.title.lowercase().trim().replace(Regex("[^a-z0-9]+"), "-").trim('-')
    val base = slug.ifBlank { "track" }
    return "${base}.${ext}.enc"
  }

  private fun normalizeContentId(raw: String?): String? {
    val clean = raw?.trim()?.lowercase().orEmpty().removePrefix("0x")
    if (clean.isBlank()) return null
    return "0x$clean"
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
    throw IllegalStateException("Unable to open local audio URI: $uri")
  }
}
