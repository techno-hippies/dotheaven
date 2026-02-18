package com.pirate.app.arweave

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/**
 * Upload cover images and lyrics JSON to Arweave via Turbo ANS-104 endpoint.
 *
 * Matches the GPUI desktop implementation in `apps/desktop/src/scrobble/tempo.rs`.
 */
object ArweaveUploadApi {

  private const val MAX_COVER_BYTES = 100_000
  private const val MAX_LYRICS_BYTES = 90_000

  private val COVER_MAX_DIMS = intArrayOf(1024, 896, 768, 640, 512, 448, 384, 320, 256)
  private val COVER_JPEG_QUALITIES = intArrayOf(86, 80, 74, 68, 62, 56, 50, 44)

  data class UploadResult(
    val arRef: String,
    val gatewayUrl: String,
  )

  /**
   * Upload cover image bytes to Arweave Turbo. Compresses if >100KB.
   * Returns `ar://<dataitem_id>`.
   */
  suspend fun uploadCover(
    coverBytes: ByteArray,
    filename: String,
    contentType: String,
    sessionKey: SessionKeyManager.SessionKey,
  ): UploadResult = withContext(Dispatchers.IO) {
    require(coverBytes.isNotEmpty()) { "Cover bytes are empty" }

    val (payload, resolvedContentType) = prepareCover(coverBytes, contentType)

    val tags = buildList {
      add(Ans104DataItem.Tag("Content-Type", resolvedContentType))
      add(Ans104DataItem.Tag("App-Name", "heaven"))
      add(Ans104DataItem.Tag("Heaven-Type", "track-cover"))
      add(Ans104DataItem.Tag("Upload-Source", "heaven-android"))
      if (filename.isNotBlank()) {
        add(Ans104DataItem.Tag("File-Name", filename.trim()))
      }
    }

    val signed = Ans104DataItem.buildAndSign(
      payload = payload,
      tags = tags,
      sessionKey = sessionKey,
    )
    val endpoint = arweaveTurboEndpoint()
    val id = Ans104DataItem.uploadSignedDataItem(signed.bytes, uploadUrl = endpoint).trim()
    if (id.isEmpty()) {
      throw IllegalStateException("Arweave Turbo upload succeeded but returned no id")
    }

    UploadResult(
      arRef = "ar://$id",
      gatewayUrl = "${ArweaveTurboConfig.GATEWAY_URL}/$id",
    )
  }

  /**
   * Upload lyrics JSON to Arweave Turbo. Max 90KB.
   * Returns `ar://<dataitem_id>`.
   */
  suspend fun uploadLyrics(
    trackId: String,
    lyricsJson: String,
    sessionKey: SessionKeyManager.SessionKey,
  ): UploadResult = withContext(Dispatchers.IO) {
    val payload = lyricsJson.trim().toByteArray(Charsets.UTF_8)
    require(payload.isNotEmpty()) { "Lyrics payload is empty" }
    require(payload.size <= MAX_LYRICS_BYTES) {
      "Lyrics payload exceeds max bytes (${payload.size} > $MAX_LYRICS_BYTES)"
    }

    val tags = listOf(
      Ans104DataItem.Tag("Content-Type", "application/json"),
      Ans104DataItem.Tag("App-Name", "heaven"),
      Ans104DataItem.Tag("Heaven-Type", "track-lyrics"),
      Ans104DataItem.Tag("Upload-Source", "heaven-android"),
      Ans104DataItem.Tag("Track-Id", trackId.trim()),
    )

    val signed = Ans104DataItem.buildAndSign(
      payload = payload,
      tags = tags,
      sessionKey = sessionKey,
    )
    val endpoint = arweaveTurboEndpoint()
    val id = Ans104DataItem.uploadSignedDataItem(signed.bytes, uploadUrl = endpoint).trim()
    if (id.isEmpty()) {
      throw IllegalStateException("Arweave Turbo upload succeeded but returned no id")
    }

    UploadResult(
      arRef = "ar://$id",
      gatewayUrl = "${ArweaveTurboConfig.GATEWAY_URL}/$id",
    )
  }

  private fun arweaveTurboEndpoint(): String {
    val url = ArweaveTurboConfig.DEFAULT_UPLOAD_URL.trimEnd('/')
    val token = ArweaveTurboConfig.DEFAULT_TOKEN.trim().lowercase()
    return "$url/v1/tx/$token"
  }

  /**
   * If cover is under 100KB return as-is; otherwise decode, resize, and
   * re-encode as JPEG at decreasing quality levels until it fits.
   * Matches GPUI logic in `prepare_cover_for_arweave_upload`.
   */
  private fun prepareCover(
    sourceBytes: ByteArray,
    contentType: String,
  ): Pair<ByteArray, String> {
    if (sourceBytes.size <= MAX_COVER_BYTES) {
      return sourceBytes to contentType
    }

    val original = BitmapFactory.decodeByteArray(sourceBytes, 0, sourceBytes.size)
      ?: throw IllegalStateException("Failed to decode cover image for compression")

    val maxSide = maxOf(original.width, original.height, 1)

    val bounds = mutableListOf(minOf(maxSide, COVER_MAX_DIMS[0]))
    for (dim in COVER_MAX_DIMS) {
      if (dim < bounds[0]) bounds.add(dim)
    }

    for (bound in bounds) {
      val resized = if (maxSide > bound) {
        val scale = bound.toFloat() / maxSide.toFloat()
        val w = (original.width * scale).toInt().coerceAtLeast(1)
        val h = (original.height * scale).toInt().coerceAtLeast(1)
        Bitmap.createScaledBitmap(original, w, h, true)
      } else {
        original
      }

      for (quality in COVER_JPEG_QUALITIES) {
        val out = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, quality, out)
        val jpeg = out.toByteArray()
        if (jpeg.size <= MAX_COVER_BYTES) {
          if (resized !== original) resized.recycle()
          original.recycle()
          return jpeg to "image/jpeg"
        }
      }

      if (resized !== original) resized.recycle()
    }

    original.recycle()
    throw IllegalStateException("Unable to compress cover below $MAX_COVER_BYTES bytes")
  }
}
