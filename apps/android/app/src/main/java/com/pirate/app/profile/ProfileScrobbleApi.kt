package com.pirate.app.profile

import com.pirate.app.BuildConfig
import com.pirate.app.music.CoverRef
import com.pirate.app.util.tempoMusicSocialSubgraphUrls
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
  private const val DEBUG_DEFAULT_TEMPO_INDEXER_API_EMULATOR = "http://10.0.2.2:42069"
  private const val DEBUG_DEFAULT_TEMPO_INDEXER_API_REVERSE = "http://127.0.0.1:42069"
  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  fun coverUrl(cid: String, size: Int = 96): String? =
    CoverRef.resolveCoverUrl(ref = cid, width = size, height = size, format = "webp", quality = 80)

  suspend fun fetchScrobbles(userAddress: String, max: Int = 100): List<ScrobbleRow> = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase()
    if (addr.isBlank()) return@withContext emptyList()

    var sawSuccessfulEmpty = false
    var subgraphError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows = fetchFromSubgraph(subgraphUrl, addr, max)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        subgraphError = error
      }
    }

    val tempoIndexerBaseUrls = tempoIndexerBaseUrls()
    var tempoIndexerError: Throwable? = null
    for (tempoIndexerBaseUrl in tempoIndexerBaseUrls) {
      try {
        val rows = fetchFromTempoIndexer(tempoIndexerBaseUrl, addr, max)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        tempoIndexerError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()

    if (tempoIndexerError != null && subgraphError != null) {
      throw IllegalStateException(
        "Tempo indexer failed: ${tempoIndexerError.message}; subgraph failed: ${subgraphError.message}",
        subgraphError,
      )
    }
    if (subgraphError != null) throw subgraphError
    if (tempoIndexerError != null) throw tempoIndexerError
    emptyList()
  }

  private fun musicSocialSubgraphUrls(): List<String> = tempoMusicSocialSubgraphUrls()

  private fun fetchFromSubgraph(subgraphUrl: String, userAddress: String, max: Int): List<ScrobbleRow> {
    // Fetch scrobbles with inline track metadata.
    val query = """
      { scrobbles(where: { user: "$userAddress" }, orderBy: timestamp, orderDirection: desc, first: $max) {
          timestamp blockTimestamp track { id title artist album coverCid }
      } }
    """.trimIndent()

    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
    val scrobbles = client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Subgraph query failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      json.optJSONObject("data")?.optJSONArray("scrobbles")
    } ?: return emptyList()

    // Collect unique track IDs for metadata fallback.
    val trackIds = mutableSetOf<String>()
    for (i in 0 until scrobbles.length()) {
      val track = scrobbles.optJSONObject(i)?.optJSONObject("track") ?: continue
      val id = track.optString("id", "").trim()
      if (id.isNotEmpty()) trackIds.add(id)
    }

    // Fetch full track metadata map.
    val trackMap = if (trackIds.isEmpty()) emptyMap() else fetchTrackMetadata(subgraphUrl, trackIds.toList())

    val now = System.currentTimeMillis() / 1000
    val rows = ArrayList<ScrobbleRow>(scrobbles.length())
    for (i in 0 until scrobbles.length()) {
      val s = scrobbles.optJSONObject(i) ?: continue
      val timestamp = s.optString("timestamp", s.optString("blockTimestamp", "0")).trim().toLongOrNull() ?: 0L

      val track = s.optJSONObject("track")
      val trackId = track?.optString("id", "")?.trim()?.ifEmpty { null }

      // Try inline metadata first, then fallback map.
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
    return rows
  }

  private fun tempoIndexerBaseUrls(): List<String> {
    val fromBuildConfig = BuildConfig.TEMPO_SCROBBLE_API.trim().removeSuffix("/")
    val urls = ArrayList<String>(3)
    if (fromBuildConfig.isNotBlank()) urls.add(fromBuildConfig)
    if (BuildConfig.DEBUG) {
      urls.add(DEBUG_DEFAULT_TEMPO_INDEXER_API_REVERSE)
      urls.add(DEBUG_DEFAULT_TEMPO_INDEXER_API_EMULATOR)
    }
    return urls.distinct()
  }

  private fun fetchFromTempoIndexer(baseUrl: String, userAddress: String, max: Int): List<ScrobbleRow> {
    val url = "$baseUrl/scrobbles/$userAddress?limit=$max"
    val req = Request.Builder().url(url).get().build()
    val items = client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Tempo indexer query failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      json.optJSONArray("items")
    } ?: return emptyList()

    val now = System.currentTimeMillis() / 1000
    val rows = ArrayList<ScrobbleRow>(items.length())
    for (i in 0 until items.length()) {
      val item = items.optJSONObject(i) ?: continue
      val track = item.optJSONObject("track")

      val trackId = item.optString("trackId", "").trim().ifEmpty { null }
      val playedAt = item.optLong(
        "timestamp",
        item.optLong("blockTimestamp", 0L),
      )
      val title = track?.optString("title", "")?.trim().orEmpty()
        .ifEmpty { trackId?.take(14) ?: "Unknown Track" }
      val artist = track?.optString("artist", "")?.trim().orEmpty()
        .ifEmpty { "Unknown Artist" }
      val album = track?.optString("album", "")?.trim().orEmpty()
      val coverCid = track?.optString("coverCid", "")?.trim()
        ?.ifEmpty { null }
        ?.takeIf { isValidCid(it) }

      rows.add(
        ScrobbleRow(
          trackId = trackId,
          playedAtSec = playedAt,
          title = title,
          artist = artist,
          album = album,
          coverCid = coverCid,
          playedAgo = formatTimeAgo(playedAt, now),
        ),
      )
    }

    return rows
  }

  private fun fetchTrackMetadata(subgraphUrl: String, ids: List<String>): Map<String, TrackMeta> {
    val quoted = ids.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
    val query = """{ tracks(where: { id_in: [$quoted] }) { id title artist album coverCid } }"""
    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
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
