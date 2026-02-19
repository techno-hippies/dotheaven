package com.pirate.app.profile

import com.pirate.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class PublishedSongRow(
  val contentId: String,
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val pieceCid: String?,
  val coverCid: String?,
  val durationSec: Int,
  val publishedAtSec: Long,
)

object ProfileMusicApi {
  private const val DEFAULT_TEMPO_SUBGRAPH_ACTIVITY =
    "https://graph.dotheaven.org/subgraphs/name/dotheaven/activity-feed-tempo"
  private const val LEGACY_SUBGRAPH_ACTIVITY =
    "https://graph.dotheaven.org/subgraphs/name/dotheaven/activity-feed-tempo"

  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchPublishedSongs(ownerAddress: String, maxEntries: Int = 100): List<PublishedSongRow> = withContext(Dispatchers.IO) {
    val addr = ownerAddress.trim().lowercase()
    if (addr.isBlank()) return@withContext emptyList()
    fetchPublishedSongsInternal(ownerAddress = addr, maxEntries = maxEntries)
  }

  suspend fun fetchLatestPublishedSongs(maxEntries: Int = 100): List<PublishedSongRow> = withContext(Dispatchers.IO) {
    fetchPublishedSongsInternal(ownerAddress = null, maxEntries = maxEntries)
  }

  private fun fetchPublishedSongsInternal(ownerAddress: String?, maxEntries: Int): List<PublishedSongRow> {
    var sawSuccessfulEmpty = false
    var subgraphError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val rows = fetchFromSubgraph(subgraphUrl, ownerAddress, maxEntries)
        if (rows.isNotEmpty()) return rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        subgraphError = error
      }
    }

    if (sawSuccessfulEmpty) return emptyList()
    if (subgraphError != null) throw subgraphError
    return emptyList()
  }

  private data class ContentRow(
    val contentId: String,
    val trackId: String,
    val pieceCid: String?,
    val publishedAtSec: Long,
  )

  private data class TrackMeta(
    val title: String,
    val artist: String,
    val album: String,
    val coverCid: String?,
    val durationSec: Int,
  )

  private fun activitySubgraphUrls(): List<String> {
    val fromBuildConfig = BuildConfig.TEMPO_SCROBBLE_SUBGRAPH_URL.trim().removeSuffix("/")
    val urls = ArrayList<String>(3)
    if (fromBuildConfig.isNotBlank()) urls.add(fromBuildConfig)
    urls.add(DEFAULT_TEMPO_SUBGRAPH_ACTIVITY)
    urls.add(LEGACY_SUBGRAPH_ACTIVITY)
    return urls.distinct()
  }

  private fun fetchFromSubgraph(
    subgraphUrl: String,
    ownerAddress: String?,
    maxEntries: Int,
  ): List<PublishedSongRow> {
    val ownerFilter = ownerAddress?.takeIf { it.isNotBlank() }?.let { """owner: "$it",""" }.orEmpty()
    val contentQuery = """
      {
        contentEntries(
          where: { $ownerFilter active: true }
          orderBy: createdAt
          orderDirection: desc
          first: $maxEntries
        ) {
          id
          trackId
          pieceCid
          createdAt
        }
      }
    """.trimIndent()

    val contentJson = postQuery(subgraphUrl, contentQuery)
    val contentEntries = contentJson.optJSONObject("data")?.optJSONArray("contentEntries") ?: JSONArray()
    if (contentEntries.length() == 0) return emptyList()

    val uniqueByTrackId = LinkedHashMap<String, ContentRow>(contentEntries.length())
    val trackIds = LinkedHashSet<String>(contentEntries.length())
    for (i in 0 until contentEntries.length()) {
      val obj = contentEntries.optJSONObject(i) ?: continue
      val contentId = obj.optString("id", "").trim().lowercase()
      val trackId = obj.optString("trackId", "").trim().lowercase()
      if (contentId.isEmpty() || trackId.isEmpty()) continue
      if (uniqueByTrackId.containsKey(trackId)) continue
      val pieceCid = decodeBytesUtf8(obj.optString("pieceCid", "").trim()).ifBlank { null }
      val createdAt = obj.optString("createdAt", "0").trim().toLongOrNull() ?: obj.optLong("createdAt", 0L)
      uniqueByTrackId[trackId] = ContentRow(contentId = contentId, trackId = trackId, pieceCid = pieceCid, publishedAtSec = createdAt)
      trackIds.add(trackId)
    }
    if (uniqueByTrackId.isEmpty()) return emptyList()

    val trackMeta = fetchTrackMetadata(subgraphUrl, trackIds.toList())
    val out = ArrayList<PublishedSongRow>(uniqueByTrackId.size)
    for (entry in uniqueByTrackId.values) {
      val meta = trackMeta[entry.trackId]
      out.add(
        PublishedSongRow(
          contentId = entry.contentId,
          trackId = entry.trackId,
          title = meta?.title.orEmpty().ifBlank { entry.trackId.take(14) },
          artist = meta?.artist.orEmpty().ifBlank { "Unknown Artist" },
          album = meta?.album.orEmpty(),
          pieceCid = entry.pieceCid,
          coverCid = meta?.coverCid,
          durationSec = meta?.durationSec ?: 0,
          publishedAtSec = entry.publishedAtSec,
        ),
      )
    }
    return out
  }

  private fun fetchTrackMetadata(subgraphUrl: String, ids: List<String>): Map<String, TrackMeta> {
    if (ids.isEmpty()) return emptyMap()
    val out = HashMap<String, TrackMeta>(ids.size)
    val chunkSize = 200
    for (start in ids.indices step chunkSize) {
      val chunk = ids.subList(start, minOf(start + chunkSize, ids.size))
      val quoted = chunk.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
      val query = """
        {
          tracks(where: { id_in: [$quoted] }, first: 1000) {
            id
            title
            artist
            album
            coverCid
            durationSec
          }
        }
      """.trimIndent()

      val json = runCatching { postQuery(subgraphUrl, query) }.getOrNull() ?: continue
      val tracks = json.optJSONObject("data")?.optJSONArray("tracks") ?: JSONArray()
      for (i in 0 until tracks.length()) {
        val t = tracks.optJSONObject(i) ?: continue
        val id = t.optString("id", "").trim().lowercase()
        if (id.isEmpty()) continue
        val cover = t.optString("coverCid", "").trim().ifEmpty { null }?.takeIf { isValidCid(it) }
        out[id] = TrackMeta(
          title = t.optString("title", "").trim(),
          artist = t.optString("artist", "").trim(),
          album = t.optString("album", "").trim(),
          coverCid = cover,
          durationSec = t.optInt("durationSec", 0),
        )
      }
    }
    return out
  }

  private fun postQuery(subgraphUrl: String, query: String): JSONObject {
    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Subgraph query failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      val errors = json.optJSONArray("errors")
      if (errors != null && errors.length() > 0) {
        val msg = errors.optJSONObject(0)?.optString("message", "GraphQL error") ?: "GraphQL error"
        throw IllegalStateException(msg)
      }
      json
    }
  }

  private fun isValidCid(v: String): Boolean {
    return v.startsWith("Qm") ||
      v.startsWith("bafy") ||
      v.startsWith("ar://") ||
      v.startsWith("ls3://") ||
      v.startsWith("load-s3://")
  }

  private fun decodeBytesUtf8(value: String): String {
    val v = value.trim()
    if (!v.startsWith("0x")) return v
    val hex = v.removePrefix("0x")
    if (hex.isEmpty() || hex.length % 2 != 0) return v
    if (!hex.all { it.isDigit() || (it.lowercaseChar() in 'a'..'f') }) return v
    return try {
      val bytes = ByteArray(hex.length / 2)
      var i = 0
      while (i < hex.length) {
        bytes[i / 2] = hex.substring(i, i + 2).toInt(16).toByte()
        i += 2
      }
      bytes.toString(Charsets.UTF_8).trimEnd { it == '\u0000' }
    } catch (_: Throwable) {
      v
    }
  }
}
