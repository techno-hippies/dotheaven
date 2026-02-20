package com.pirate.app.music

internal fun resolveReleaseAudioUrl(ref: String?): String? {
  val raw = ref?.trim().orEmpty()
  if (raw.isBlank()) return null
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  if (raw.startsWith("ar://")) {
    val id = raw.removePrefix("ar://").trim()
    if (id.isBlank()) return null
    return "https://arweave.net/$id"
  }
  if (raw.startsWith("ls3://")) {
    val id = raw.removePrefix("ls3://").trim()
    if (id.isBlank()) return null
    return "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/$id"
  }
  if (raw.startsWith("load-s3://")) {
    val id = raw.removePrefix("load-s3://").trim()
    if (id.isBlank()) return null
    return "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/$id"
  }
  return "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/$raw"
}

internal fun resolveReleaseCoverUrl(ref: String?): String? {
  val fromRef = CoverRef.resolveCoverUrl(ref, width = 140, height = 140, format = "webp", quality = 80)
  if (!fromRef.isNullOrBlank()) return fromRef
  val raw = ref?.trim().orEmpty()
  if (raw.startsWith("content://")) return raw
  if (raw.startsWith("file://")) return raw
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return null
}
