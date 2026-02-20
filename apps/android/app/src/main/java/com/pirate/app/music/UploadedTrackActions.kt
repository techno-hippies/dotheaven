package com.pirate.app.music

import android.content.Context
import com.pirate.app.arweave.Ans104DataItem
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.security.LocalSecp256k1Store
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    if (isUnsupportedUploadedTrackAlgo(track.algo)) {
      return@withContext UploadedTrackDownloadResult(success = false, error = uploadedTrackLegacyUploadError())
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
        error = uploadedTrackMissingWrappedKeyError(),
      )
    }
    val resolvedWrappedKey = wrappedKey

    return@withContext runCatching {
      val blob = fetchUploadedBlob(pieceCid)
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

      val ext = uploadedTrackPreferredExtension(track)
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
          mimeType = audioMimeFromExtension(ext),
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
          mimeType = audioMimeFromExtension(ext),
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
    if (isUnsupportedUploadedTrackAlgo(track.algo)) {
      return@withContext UploadedTrackShareResult(success = false, error = uploadedTrackLegacyUploadError())
    }
    val normalizedRecipientInput = recipient.trim().removePrefix("@").lowercase()
    val recipientAddress = resolveUploadedTrackRecipientAddress(normalizedRecipientInput)
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
        error = uploadedTrackMissingWrappedKeyError(),
      )
    }
    val resolvedWrappedKey = wrappedKey

    val recipientPub =
      if (uploadedTrackAddressRegex.matches(normalizedRecipientInput)) {
        TempoNameRecordsApi.getContentPubKeyForAddress(recipientAddress)
      } else {
        TempoNameRecordsApi.getContentPubKeyForName(normalizedRecipientInput)
          ?: TempoNameRecordsApi.getContentPubKeyForAddress(recipientAddress)
      }
      ?: return@withContext UploadedTrackShareResult(
        success = false,
        error = "Recipient has no published contentPubKey. They must set a primary name and upload once to publish encryption keys.",
      )

    SessionKeyManager.load(context)?.takeIf {
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

      val signed = run {
        val identity = LocalSecp256k1Store.getOrCreateIdentity(context, ownerAddress)
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
          signingKeyPair = identity.keyPair,
        )
      }
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

  internal suspend fun ensureWrappedKeyFromLs3(
    context: Context,
    contentId: String,
    ownerAddress: String,
    granteeAddress: String,
  ): Boolean = ensureWrappedKeyFromLs3Internal(
    context = context,
    contentId = contentId,
    ownerAddress = ownerAddress,
    granteeAddress = granteeAddress,
  )

  internal fun fetchResolvePayload(dataitemId: String): ByteArray {
    return fetchUploadedResolvePayload(dataitemId)
  }

}
