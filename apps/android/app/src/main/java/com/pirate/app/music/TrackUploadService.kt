package com.pirate.app.music

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.fragment.app.FragmentActivity
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
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
    hostActivity: FragmentActivity? = null,
    tempoAccount: TempoPasskeyManager.PasskeyAccount? = null,
  ): UploadAndRegisterResult = withContext(Dispatchers.IO) {
    val contentKey = ContentKeyManager.getOrCreate(context)
    publishContentPubKeyIfPossible(
      context = context,
      ownerEthAddress = ownerEthAddress,
      contentPublicKey = contentKey.publicKey,
      hostActivity = hostActivity,
      tempoAccount = tempoAccount,
    )
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

    val sessionKey = SessionKeyManager.load(context)?.takeIf {
      SessionKeyManager.isValid(it, ownerAddress = ownerEthAddress)
    } ?: throw IllegalStateException("Missing valid Tempo session key for upload. Please sign in again.")

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
      sessionKey = sessionKey,
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

private suspend fun publishContentPubKeyIfPossible(
  context: Context,
  ownerEthAddress: String,
  contentPublicKey: ByteArray,
  hostActivity: FragmentActivity?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
) {
  if (hostActivity == null || tempoAccount == null) return
  if (!tempoAccount.address.equals(ownerEthAddress, ignoreCase = true)) {
    Log.w(
      "TrackUploadService",
      "Skipping contentPubKey publish due to account mismatch (owner=$ownerEthAddress account=${tempoAccount.address})",
    )
    return
  }

  val primary = TempoNameRecordsApi.getPrimaryNameDetails(tempoAccount.address)
  if (primary == null) {
    Log.d("TrackUploadService", "Skipping contentPubKey publish: no primary name set for ${tempoAccount.address}")
    return
  }

  val loadedSession = SessionKeyManager.load(context)?.takeIf {
    SessionKeyManager.isValid(it, ownerAddress = tempoAccount.address) &&
      it.keyAuthorization?.isNotEmpty() == true
  }

  val result = TempoNameRecordsApi.upsertContentPubKey(
    activity = hostActivity,
    account = tempoAccount,
    publicKey = contentPublicKey,
    rpId = tempoAccount.rpId,
    sessionKey = loadedSession,
  )
  if (!result.success) {
    Log.w(
      "TrackUploadService",
      "contentPubKey publish failed for ${primary.fullName}: ${result.error ?: "unknown error"}",
    )
  } else if (!result.txHash.isNullOrBlank()) {
    Log.d("TrackUploadService", "contentPubKey published: tx=${result.txHash}")
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
