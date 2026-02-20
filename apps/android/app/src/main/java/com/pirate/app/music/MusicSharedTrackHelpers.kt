package com.pirate.app.music

import android.content.Context
import android.net.Uri
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.util.shortAddress
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal data class CachedSharedAudio(
  val file: File,
  val uri: String,
  val filename: String,
  val mimeType: String?,
)

internal fun resolveSongTrackId(track: MusicTrack): String? {
  val candidates = listOf(track.id, track.contentId.orEmpty())
  return candidates.firstNotNullOfOrNull(::extractBytes32)
}

private val BYTES32_SUBSTRING = Regex("(?i)(0x[a-f0-9]{64}|[a-f0-9]{64})")

private fun extractBytes32(raw: String): String? {
  val trimmed = raw.trim()
  val hit = BYTES32_SUBSTRING.find(trimmed) ?: return null
  val value = hit.value.lowercase()
  return if (value.startsWith("0x")) value else "0x$value"
}

internal fun sharedOwnerLabel(
  ownerAddress: String,
  sharedOwnerLabels: Map<String, String>,
): String {
  val key = ownerAddress.trim().lowercase()
  if (key.isBlank()) return "unknown"
  return sharedOwnerLabels[key] ?: shortAddress(key, minLengthToShorten = 10)
}

internal fun buildSharedTrackForPlayer(
  track: SharedCloudTrack,
  uri: String,
  filename: String,
): MusicTrack {
  val coverUri = CoverRef.resolveCoverUrl(track.coverCid, width = 192, height = 192, format = "webp", quality = 80)
  return MusicTrack(
    id = track.contentId.ifBlank { track.trackId },
    title = track.title,
    artist = track.artist,
    album = track.album,
    durationSec = track.durationSec,
    uri = uri,
    filename = filename,
    artworkUri = coverUri,
    contentId = track.contentId,
    pieceCid = track.pieceCid,
    datasetOwner = track.datasetOwner,
    algo = track.algo,
  )
}

internal suspend fun findCachedSharedAudio(
  context: Context,
  contentId: String,
): CachedSharedAudio? = withContext(Dispatchers.IO) {
  val safe = contentId.removePrefix("0x").trim().lowercase()
  if (safe.isBlank()) return@withContext null

  val dir = File(context.cacheDir, "heaven_cloud")
  if (!dir.exists()) return@withContext null

  val existing =
    dir.listFiles()
      ?.firstOrNull { f -> f.isFile && f.name.startsWith("content_${safe}.") && f.length() > 0L }
      ?: return@withContext null

  CachedSharedAudio(
    file = existing,
    uri = Uri.fromFile(existing).toString(),
    filename = existing.name,
    mimeType = audioMimeFromExtension(existing.extension),
  )
}

internal suspend fun decryptSharedAudioToCache(
  context: Context,
  ownerEthAddress: String?,
  track: SharedCloudTrack,
): CachedSharedAudio = withContext(Dispatchers.IO) {
  if (track.algo != ContentCryptoConfig.ALGO_AES_GCM_256) {
    throw IllegalStateException("Legacy/plaintext shared track is not supported. Ask owner to re-upload encrypted.")
  }
  val grantee = ownerEthAddress?.trim()?.lowercase().orEmpty()
  if (grantee.isBlank()) {
    throw IllegalStateException("Missing active wallet for shared-track decrypt.")
  }

  val contentKey = ContentKeyManager.load(context)
    ?: throw IllegalStateException("No content encryption key — upload a track first to generate one")

  var wrappedKey = ContentKeyManager.loadWrappedKey(context, track.contentId)
  if (wrappedKey == null) {
    UploadedTrackActions.ensureWrappedKeyFromLs3(
      context = context,
      contentId = track.contentId,
      ownerAddress = track.owner,
      granteeAddress = grantee,
    )
    wrappedKey = ContentKeyManager.loadWrappedKey(context, track.contentId)
  }
  val resolvedWrappedKey =
    wrappedKey
      ?: throw IllegalStateException(
        "Missing encrypted key for this shared track. It may not be shared to this wallet yet.",
      )

  val blob = UploadedTrackActions.fetchResolvePayload(track.pieceCid)
  if (blob.size < 13) throw RuntimeException("Encrypted blob too small: ${blob.size} bytes")
  val iv = blob.copyOfRange(0, 12)
  val ciphertext = blob.copyOfRange(12, blob.size)

  val aesKey = EciesContentCrypto.eciesDecrypt(contentKey.privateKey, resolvedWrappedKey)
  val audio = EciesContentCrypto.decryptFile(aesKey, iv, ciphertext)
  aesKey.fill(0)

  val dir = File(context.cacheDir, "heaven_cloud").also { it.mkdirs() }
  val safe = track.contentId.removePrefix("0x").trim().lowercase()
  val ext = if (track.title.contains(".")) track.title.substringAfterLast('.') else "mp3"
  val cacheFile = File(dir, "content_${safe}.${ext}")
  cacheFile.writeBytes(audio)

  CachedSharedAudio(
    file = cacheFile,
    uri = Uri.fromFile(cacheFile).toString(),
    filename = cacheFile.name,
    mimeType = audioMimeFromExtension(ext),
  )
}
