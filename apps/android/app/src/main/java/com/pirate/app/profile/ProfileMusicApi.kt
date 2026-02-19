package com.pirate.app.profile

import com.pirate.app.BuildConfig
import com.pirate.app.song.SongArtistApi
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
  private const val DEFAULT_TEMPO_SUBGRAPH_MUSIC_SOCIAL =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn"

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

  private suspend fun fetchPublishedSongsInternal(ownerAddress: String?, maxEntries: Int): List<PublishedSongRow> {
    var sawSuccessfulEmpty = false
    var subgraphError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows =
          if (ownerAddress.isNullOrBlank()) {
            fetchLatestFromSubgraph(subgraphUrl, maxEntries)
          } else {
            fetchPublishedByOwnerFromSubgraph(subgraphUrl, ownerAddress, maxEntries)
          }
        if (rows.isNotEmpty()) return rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        subgraphError = error
      }
    }

    if (ownerAddress.isNullOrBlank()) {
      val chainRows = runCatching { SongArtistApi.fetchLatestTracksFromChain(maxEntries = maxEntries) }.getOrNull().orEmpty()
      if (chainRows.isNotEmpty()) {
        return chainRows.map { row ->
          PublishedSongRow(
            contentId = row.trackId,
            trackId = row.trackId,
            title = row.title,
            artist = row.artist,
            album = row.album,
            pieceCid = null,
            coverCid = row.coverCid,
            durationSec = row.durationSec,
            publishedAtSec = row.registeredAtSec,
          )
        }
      }
    }

    if (sawSuccessfulEmpty) return emptyList()
    if (subgraphError != null && ownerAddress.isNullOrBlank() && isSubgraphAvailabilityError(subgraphError)) return emptyList()
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

  private data class LatestTrackRow(
    val trackId: String,
    val title: String,
    val artist: String,
    val album: String,
    val coverCid: String?,
    val durationSec: Int,
    val registeredAtSec: Long,
  )

  private data class ContentPointer(
    val contentId: String,
    val pieceCid: String?,
    val publishedAtSec: Long,
  )

  private fun musicSocialSubgraphUrls(): List<String> {
    val fromMusicSocial = BuildConfig.TEMPO_MUSIC_SOCIAL_SUBGRAPH_URL.trim().removeSuffix("/")
    val urls = ArrayList<String>(2)
    if (fromMusicSocial.isNotBlank()) urls.add(fromMusicSocial)
    urls.add(DEFAULT_TEMPO_SUBGRAPH_MUSIC_SOCIAL)
    return urls.distinct()
  }

  private fun isSubgraphAvailabilityError(error: Throwable?): Boolean {
    val msg = error?.message?.lowercase().orEmpty()
    if (msg.isBlank()) return false
    return msg.contains("subgraph query failed: 530") ||
      msg.contains("subgraph query failed: 52") ||
      msg.contains("origin dns") ||
      msg.contains("cloudflare")
  }

  private fun fetchPublishedByOwnerFromSubgraph(
    subgraphUrl: String,
    ownerAddress: String,
    maxEntries: Int,
  ): List<PublishedSongRow> {
    val contentQuery = """
      {
        contentEntries(
          where: { owner: "$ownerAddress", active: true }
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

  private fun fetchLatestFromSubgraph(subgraphUrl: String, maxEntries: Int): List<PublishedSongRow> {
    val tracksQuery = """
      {
        tracks(
          where: { kind: 2 }
          orderBy: registeredAt
          orderDirection: desc
          first: $maxEntries
        ) {
          id
          title
          artist
          album
          coverCid
          durationSec
          registeredAt
        }
      }
    """.trimIndent()

    val tracksJson = postQuery(subgraphUrl, tracksQuery)
    val tracks = tracksJson.optJSONObject("data")?.optJSONArray("tracks") ?: JSONArray()
    if (tracks.length() == 0) return emptyList()

    val latestTracks = ArrayList<LatestTrackRow>(tracks.length())
    val trackIds = LinkedHashSet<String>(tracks.length())
    for (i in 0 until tracks.length()) {
      val row = tracks.optJSONObject(i) ?: continue
      val trackId = row.optString("id", "").trim().lowercase()
      if (trackId.isEmpty()) continue
      if (!trackIds.add(trackId)) continue
      val coverCid = row.optString("coverCid", "").trim().ifBlank { null }?.takeIf { isValidCid(it) }
      val registeredAt = row.optString("registeredAt", "0").trim().toLongOrNull() ?: row.optLong("registeredAt", 0L)
      latestTracks.add(
        LatestTrackRow(
          trackId = trackId,
          title = row.optString("title", "").trim(),
          artist = row.optString("artist", "").trim(),
          album = row.optString("album", "").trim(),
          coverCid = coverCid,
          durationSec = row.optInt("durationSec", 0),
          registeredAtSec = registeredAt,
        ),
      )
    }
    if (latestTracks.isEmpty()) return emptyList()

    val contentByTrack = fetchLatestContentPointersByTrack(subgraphUrl, trackIds.toList())

    val out = ArrayList<PublishedSongRow>(latestTracks.size)
    for (track in latestTracks) {
      val content = contentByTrack[track.trackId]
      out.add(
        PublishedSongRow(
          contentId = content?.contentId ?: track.trackId,
          trackId = track.trackId,
          title = track.title.ifBlank { track.trackId.take(14) },
          artist = track.artist.ifBlank { "Unknown Artist" },
          album = track.album,
          pieceCid = content?.pieceCid,
          coverCid = track.coverCid,
          durationSec = track.durationSec,
          publishedAtSec = content?.publishedAtSec ?: track.registeredAtSec,
        ),
      )
    }
    return out
  }

  private fun fetchLatestContentPointersByTrack(subgraphUrl: String, trackIds: List<String>): Map<String, ContentPointer> {
    if (trackIds.isEmpty()) return emptyMap()
    val out = HashMap<String, ContentPointer>(trackIds.size)
    val chunkSize = 100
    for (start in trackIds.indices step chunkSize) {
      val chunk = trackIds.subList(start, minOf(start + chunkSize, trackIds.size))
      val quoted = chunk.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
      val query = """
        {
          contentEntries(
            where: { trackId_in: [$quoted], active: true }
            orderBy: createdAt
            orderDirection: desc
            first: 1000
          ) {
            id
            trackId
            pieceCid
            createdAt
          }
        }
      """.trimIndent()

      // Keep release cards visible even if pieceCid lookup fails for this chunk.
      val json = runCatching { postQuery(subgraphUrl, query) }.getOrNull() ?: continue
      val entries = json.optJSONObject("data")?.optJSONArray("contentEntries") ?: JSONArray()
      for (i in 0 until entries.length()) {
        val obj = entries.optJSONObject(i) ?: continue
        val trackId = obj.optString("trackId", "").trim().lowercase()
        if (trackId.isEmpty() || out.containsKey(trackId)) continue
        val contentId = obj.optString("id", "").trim().lowercase().ifBlank { trackId }
        val pieceCid = decodeBytesUtf8(obj.optString("pieceCid", "").trim()).ifBlank { null }
        val createdAt = obj.optString("createdAt", "0").trim().toLongOrNull() ?: obj.optLong("createdAt", 0L)
        out[trackId] = ContentPointer(contentId = contentId, pieceCid = pieceCid, publishedAtSec = createdAt)
      }
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
