package com.pirate.app.music

/**
 * Resolve on-chain/off-chain cover refs to a fetchable URL.
 *
 * Supported:
 * - Legacy IPFS CID (Qm..., bafy...) via Filebase gateway with image transforms
 * - ipfs://<cid> via Filebase gateway with image transforms
 * - ar://<dataitem_id> via arweave.net (no transforms)
 * - ls3://<id> and load-s3://<id> via Load gateway (no transforms)
 * - http(s):// passthrough
 */
object CoverRef {
  private const val FILEBASE_IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs"
  private const val ARWEAVE_GATEWAY = "https://arweave.net"
  private const val LOAD_LS3_GATEWAY = "https://gateway.s3-node-1.load.network"

  private fun isIpfsCid(value: String): Boolean {
    val v = value.trim()
    return v.isNotEmpty() && (v.startsWith("Qm") || v.startsWith("bafy"))
  }

  private fun buildFilebaseTransformQuery(
    width: Int?,
    height: Int?,
    format: String?,
    quality: Int?,
  ): String {
    val parts = ArrayList<String>(4)
    if (width != null && width > 0) parts.add("img-width=$width")
    if (height != null && height > 0) parts.add("img-height=$height")
    if (!format.isNullOrBlank()) parts.add("img-format=${format.trim()}")
    if (quality != null && quality > 0) parts.add("img-quality=$quality")
    return if (parts.isEmpty()) "" else "?${parts.joinToString("&")}"
  }

  fun resolveCoverUrl(
    ref: String?,
    width: Int? = null,
    height: Int? = null,
    format: String? = "webp",
    quality: Int? = 80,
  ): String? {
    val raw = ref?.trim().orEmpty()
    if (raw.isEmpty()) return null

    if (raw.startsWith("ipfs://")) {
      val cid = raw.removePrefix("ipfs://").trim()
      if (cid.isEmpty()) return null
      return "$FILEBASE_IPFS_GATEWAY/$cid${buildFilebaseTransformQuery(width, height, format, quality)}"
    }

    if (raw.startsWith("ar://")) {
      val id = raw.removePrefix("ar://").trim()
      if (id.isEmpty()) return null
      return "$ARWEAVE_GATEWAY/$id"
    }

    if (raw.startsWith("ls3://")) {
      val id = raw.removePrefix("ls3://").trim()
      if (id.isEmpty()) return null
      return "$LOAD_LS3_GATEWAY/resolve/$id"
    }

    if (raw.startsWith("load-s3://")) {
      val id = raw.removePrefix("load-s3://").trim()
      if (id.isEmpty()) return null
      return "$LOAD_LS3_GATEWAY/resolve/$id"
    }

    if (isIpfsCid(raw)) {
      return "$FILEBASE_IPFS_GATEWAY/$raw${buildFilebaseTransformQuery(width, height, format, quality)}"
    }

    if (raw.startsWith("https://") || raw.startsWith("http://")) {
      return raw
    }

    return null
  }
}

