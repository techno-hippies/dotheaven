package com.pirate.app.music

import android.content.Context
import android.net.Uri
import com.pirate.app.lit.LitRust
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

data class UploadAndRegisterResult(
  val trackId: String,
  val contentId: String,
  val pieceCid: String,
  val gatewayUrl: String?,
  val datasetOwner: String,
  val algo: Int,
  val register: ContentRegisterResult,
)

object TrackUploadService {
  suspend fun uploadAndRegisterEncrypted(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    ownerEthAddress: String,
    track: MusicTrack,
    uploadUrl: String = LoadTurboConfig.DEFAULT_UPLOAD_URL,
    uploadToken: String = LoadTurboConfig.DEFAULT_UPLOAD_TOKEN,
    gatewayUrlFallback: String = LoadTurboConfig.DEFAULT_GATEWAY_URL,
  ): UploadAndRegisterResult = withContext(Dispatchers.IO) {
    val trackId = TrackIds.computeMetaTrackId(track.title, track.artist, track.album).lowercase()
    val computedContentId = ContentIds.computeContentId(trackId, ownerEthAddress).lowercase()

    val uri = Uri.parse(track.uri)
    val filename = "${buildFilenameHint(track)}.enc"
    val payload = readAllBytesFromContentUri(context, uri)

    val tags = JSONArray()
      .put(JSONObject().put("name", "App-Name").put("value", "Pirate"))
      .put(JSONObject().put("name", "Upload-Source").put("value", "pirate-android"))
      .put(JSONObject().put("name", "Track-Id").put("value", trackId))
      .put(JSONObject().put("name", "Content-Id").put("value", computedContentId))
      .put(JSONObject().put("name", "Owner").put("value", ownerEthAddress.lowercase()))

    val upload = LitRust.loadEncryptUpload(
      network = litNetwork,
      rpcUrl = litRpcUrl,
      uploadUrl = uploadUrl,
      uploadToken = uploadToken,
      gatewayUrlFallback = gatewayUrlFallback,
      payload = payload,
      contentId = computedContentId,
      contentDecryptCid = ContentCryptoConfig.DEFAULT_CONTENT_DECRYPT_V1_CID,
      filePath = filename,
      contentType = "",
      tagsJson = tags.toString(),
    )

    // Register on-chain content metadata (best-effort). If it fails, keep the uploaded reference
    // so the user can retry registration without re-uploading the file.
    val register =
      runCatching {
        ContentRegisterLitAction.registerContent(
          litNetwork = litNetwork,
          litRpcUrl = litRpcUrl,
          userPkpPublicKey = userPkpPublicKey,
          trackId = trackId,
          pieceCid = upload.id,
          datasetOwner = ownerEthAddress,
          algo = ContentCryptoConfig.ALGO_AES_GCM_256,
          title = track.title,
          artist = track.artist,
          album = track.album,
        )
      }.getOrElse { err ->
        ContentRegisterResult(success = false, error = err.message ?: "content register failed")
      }

    val contentId = register.contentId?.lowercase() ?: computedContentId
    UploadAndRegisterResult(
      trackId = trackId,
      contentId = contentId,
      pieceCid = upload.id,
      gatewayUrl = upload.gatewayUrl,
      datasetOwner = ownerEthAddress.lowercase(),
      algo = ContentCryptoConfig.ALGO_AES_GCM_256,
      register = register,
    )
  }

  suspend fun registerExistingEncrypted(
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    ownerEthAddress: String,
    track: MusicTrack,
  ): ContentRegisterResult = withContext(Dispatchers.IO) {
    val trackId = TrackIds.computeMetaTrackId(track.title, track.artist, track.album).lowercase()
    val pieceCid = track.pieceCid?.trim().orEmpty()
    if (pieceCid.isEmpty()) return@withContext ContentRegisterResult(success = false, error = "missing pieceCid")

    ContentRegisterLitAction.registerContent(
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      userPkpPublicKey = userPkpPublicKey,
      trackId = trackId,
      pieceCid = pieceCid,
      datasetOwner = ownerEthAddress,
      algo = ContentCryptoConfig.ALGO_AES_GCM_256,
      title = track.title,
      artist = track.artist,
      album = track.album,
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
