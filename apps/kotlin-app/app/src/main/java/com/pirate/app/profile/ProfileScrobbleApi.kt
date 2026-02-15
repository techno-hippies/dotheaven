package com.pirate.app.profile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class ScrobbleRow(
  val trackId: String?,
  val playedAtSec: Long,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val playedAgo: String,
)

object ProfileScrobbleApi {
  private const val SUBGRAPH_ACTIVITY =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn"
  private const val IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs/"

  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  fun coverUrl(cid: String, size: Int = 96): String =
    "${IPFS_GATEWAY}${cid}?img-width=$size&img-height=$size&img-format=webp&img-quality=80"

  suspend fun fetchScrobbles(userAddress: String, max: Int = 100): List<ScrobbleRow> = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase()
    if (addr.isBlank()) return@withContext emptyList()

    // Fetch scrobbles with inline track metadata
    val query = """
      { scrobbles(where: { user: "$addr" }, orderBy: timestamp, orderDirection: desc, first: $max) {
          timestamp blockTimestamp track { id title artist album coverCid }
      } }
    """.trimIndent()

    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(SUBGRAPH_ACTIVITY).post(body).build()
    val scrobbles = client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Subgraph query failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      json.optJSONObject("data")?.optJSONArray("scrobbles")
    } ?: return@withContext emptyList()

    // Collect unique track IDs for metadata fallback
    val trackIds = mutableSetOf<String>()
    for (i in 0 until scrobbles.length()) {
      val track = scrobbles.optJSONObject(i)?.optJSONObject("track") ?: continue
      val id = track.optString("id", "").trim()
      if (id.isNotEmpty()) trackIds.add(id)
    }

    // Fetch full track metadata map
    val trackMap = if (trackIds.isEmpty()) emptyMap() else fetchTrackMetadata(trackIds.toList())

    val now = System.currentTimeMillis() / 1000
    val rows = ArrayList<ScrobbleRow>(scrobbles.length())
    for (i in 0 until scrobbles.length()) {
      val s = scrobbles.optJSONObject(i) ?: continue
      val timestamp = s.optString("timestamp", s.optString("blockTimestamp", "0")).trim().toLongOrNull() ?: 0L

      val track = s.optJSONObject("track")
      val trackId = track?.optString("id", "")?.trim()?.ifEmpty { null }

      // Try inline metadata first, then fallback map
      val inlineTitle = track?.optString("title", "")?.trim().orEmpty()
      val inlineArtist = track?.optString("artist", "")?.trim().orEmpty()
      val inlineAlbum = track?.optString("album", "")?.trim().orEmpty()
      val inlineCover = track?.optString("coverCid", "")?.trim()?.ifEmpty { null }?.takeIf { isValidCid(it) }

      val fallback = trackId?.let { trackMap[it] }

      val title = inlineTitle.ifEmpty { fallback?.title ?: trackId?.take(14) ?: "Unknown Track" }
      val artist = inlineArtist.ifEmpty { fallback?.artist ?: "Unknown Artist" }
      val album = inlineAlbum.ifEmpty { fallback?.album.orEmpty() }
      val coverCid = inlineCover ?: fallback?.coverCid

      rows.add(ScrobbleRow(trackId, timestamp, title, artist, album, coverCid, formatTimeAgo(timestamp, now)))
    }
    rows
  }

  private fun fetchTrackMetadata(ids: List<String>): Map<String, TrackMeta> {
    val quoted = ids.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
    val query = """{ tracks(where: { id_in: [$quoted] }) { id title artist album coverCid } }"""
    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(SUBGRAPH_ACTIVITY).post(body).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) return@use emptyMap()
      val json = JSONObject(res.body?.string().orEmpty())
      val tracks = json.optJSONObject("data")?.optJSONArray("tracks") ?: return@use emptyMap()
      val map = HashMap<String, TrackMeta>(tracks.length())
      for (i in 0 until tracks.length()) {
        val t = tracks.optJSONObject(i) ?: continue
        val id = t.optString("id", "").trim()
        if (id.isEmpty()) continue
        map[id] = TrackMeta(
          title = t.optString("title", "").trim().ifEmpty { "Unknown Track" },
          artist = t.optString("artist", "").trim().ifEmpty { "Unknown Artist" },
          album = t.optString("album", "").trim(),
          coverCid = t.optString("coverCid", "").trim().ifEmpty { null }?.takeIf { isValidCid(it) },
        )
      }
      map
    }
  }

  private data class TrackMeta(val title: String, val artist: String, val album: String, val coverCid: String?)

  private fun isValidCid(v: String) =
    v.startsWith("Qm") || v.startsWith("bafy") || v.startsWith("ar://") || v.startsWith("ls3://") || v.startsWith("load-s3://")

  private fun formatTimeAgo(playedAtSec: Long, nowSec: Long): String {
    if (playedAtSec <= 0) return "Unknown"
    if (playedAtSec >= nowSec) return "Just now"
    val d = nowSec - playedAtSec
    return when {
      d < 60 -> "${d}s ago"
      d < 3600 -> "${d / 60} ${p(d / 60, "min")} ago"
      d < 86400 -> "${d / 3600} ${p(d / 3600, "hr")} ago"
      d < 604800 -> "${d / 86400} ${p(d / 86400, "day")} ago"
      d < 2592000 -> "${d / 604800} ${p(d / 604800, "wk")} ago"
      else -> "${d / 2592000} ${p(d / 2592000, "mo")} ago"
    }
  }

  private fun p(v: Long, unit: String) = if (v == 1L) unit else "${unit}s"
}
