package com.pirate.app.song

import com.pirate.app.BuildConfig
import com.pirate.app.music.SongPublishService
import com.pirate.app.util.HttpClients
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

private const val DEFAULT_ACTIVITY_SUBGRAPH =
  "https://graph.dotheaven.org/subgraphs/name/dotheaven/activity-feed-tempo"
private const val LEGACY_ACTIVITY_SUBGRAPH =
  "https://graph.dotheaven.org/subgraphs/name/dotheaven/activity-feed-tempo"
private val ADDRESS_REGEX = Regex("^0x[a-fA-F0-9]{40}$")
private val BYTES32_REGEX = Regex("^0x[a-fA-F0-9]{64}$")
private val GRAPHQL_CONTROL_CHARS_REGEX = Regex("[\\u0000-\\u001F\\u007F]")
private const val TRACK_LISTENER_PAGE_SIZE = 1_000
private const val TRACK_LISTENER_MAX_SCAN = 10_000

data class SongStats(
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val scrobbleCountTotal: Long,
  val scrobbleCountVerified: Long,
  val registeredAtSec: Long,
)

data class SongListenerRow(
  val userAddress: String,
  val scrobbleCount: Int,
  val lastScrobbleAtSec: Long,
)

data class SongScrobbleRow(
  val userAddress: String,
  val playedAtSec: Long,
)

data class ArtistTrackRow(
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val scrobbleCountTotal: Long,
  val scrobbleCountVerified: Long,
)

data class ArtistListenerRow(
  val userAddress: String,
  val scrobbleCount: Long,
  val lastScrobbleAtSec: Long,
)

data class ArtistScrobbleRow(
  val userAddress: String,
  val trackId: String,
  val title: String,
  val playedAtSec: Long,
)

data class StudySetStatus(
  val ready: Boolean,
  val studySetRef: String?,
  val studySetHash: String?,
  val errorCode: String?,
  val error: String?,
)

data class StudySetGenerateResult(
  val success: Boolean,
  val cached: Boolean,
  val studySetRef: String?,
  val studySetHash: String?,
  val errorCode: String?,
  val error: String?,
)

object SongArtistApi {
  private val client = HttpClients.Api
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchSongStats(trackId: String): SongStats? = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext null

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val row = fetchSongStatsFromSubgraph(subgraphUrl, normalizedTrackId)
        if (row != null) return@withContext row
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext null
    if (lastError != null) throw lastError
    null
  }

  suspend fun fetchSongTopListeners(trackId: String, maxEntries: Int = 20): List<SongListenerRow> = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 100)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val rows = fetchSongTopListenersFromSubgraph(subgraphUrl, normalizedTrackId, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchSongRecentScrobbles(trackId: String, maxEntries: Int = 40): List<SongScrobbleRow> = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 200)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val rows = fetchSongRecentScrobblesFromSubgraph(subgraphUrl, normalizedTrackId, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchArtistTopTracks(artistName: String, maxEntries: Int = 50): List<ArtistTrackRow> = withContext(Dispatchers.IO) {
    val artist = artistName.trim()
    if (artist.isBlank()) return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 200)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val rows = fetchArtistTopTracksFromSubgraph(subgraphUrl, artist, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchArtistTopListeners(artistName: String, maxEntries: Int = 20): List<ArtistListenerRow> = withContext(Dispatchers.IO) {
    val artist = artistName.trim()
    if (artist.isBlank()) return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 100)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val rows = fetchArtistTopListenersFromSubgraph(subgraphUrl, artist.lowercase(), first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchArtistRecentScrobbles(artistName: String, maxEntries: Int = 40): List<ArtistScrobbleRow> = withContext(Dispatchers.IO) {
    val artist = artistName.trim()
    if (artist.isBlank()) return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 200)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in activitySubgraphUrls()) {
      try {
        val rows = fetchArtistRecentScrobblesFromSubgraph(subgraphUrl, artist, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchStudySetStatus(trackId: String, language: String): StudySetStatus = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId)
      ?: return@withContext StudySetStatus(
        ready = false,
        studySetRef = null,
        studySetHash = null,
        errorCode = "invalid_track_id",
        error = "trackId must be bytes32",
      )

    val lang = language.trim().ifBlank { "en" }
    val url = "${SongPublishService.HEAVEN_API_URL}/api/study-sets/$normalizedTrackId?lang=${encodeUrlComponent(lang)}&v=1"
    val req = Request.Builder().url(url).get().build()

    client.newCall(req).execute().use { res ->
      val text = res.body?.string().orEmpty()
      val json = runCatching { JSONObject(text) }.getOrNull()

      if (res.isSuccessful && json?.optBoolean("success") == true) {
        val registry = json.optJSONObject("registry")
        return@withContext StudySetStatus(
          ready = true,
          studySetRef = registry?.optString("studySetRef")?.ifBlank { null },
          studySetHash = registry?.optString("studySetHash")?.ifBlank { null },
          errorCode = null,
          error = null,
        )
      }

      return@withContext StudySetStatus(
        ready = false,
        studySetRef = null,
        studySetHash = null,
        errorCode = json?.optString("code")?.ifBlank { null },
        error = json?.optString("error")?.ifBlank { "HTTP ${res.code}" },
      )
    }
  }

  suspend fun generateStudySet(
    trackId: String,
    language: String,
    userAddress: String,
  ): StudySetGenerateResult = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId)
      ?: return@withContext StudySetGenerateResult(
        success = false,
        cached = false,
        studySetRef = null,
        studySetHash = null,
        errorCode = "invalid_track_id",
        error = "trackId must be bytes32",
      )

    val normalizedUserAddress = normalizeAddress(userAddress)
      ?: return@withContext StudySetGenerateResult(
        success = false,
        cached = false,
        studySetRef = null,
        studySetHash = null,
        errorCode = "invalid_user_address",
        error = "userAddress must be 0x + 40 hex",
      )

    val body = JSONObject().apply {
      put("trackId", normalizedTrackId)
      put("language", language.trim().ifBlank { "en" })
      put("version", 1)
    }

    val req = Request.Builder()
      .url("${SongPublishService.HEAVEN_API_URL}/api/study-sets/generate")
      .post(body.toString().toRequestBody(jsonMediaType))
      .header("Content-Type", "application/json")
      .header("X-User-Address", normalizedUserAddress)
      .build()

    client.newCall(req).execute().use { res ->
      val text = res.body?.string().orEmpty()
      val json = runCatching { JSONObject(text) }.getOrNull()

      val success = json?.optBoolean("success") == true
      val cached = json?.optBoolean("cached") == true
      val registry = json?.optJSONObject("registry")
      val studySetRef = registry?.optString("studySetRef")?.ifBlank { null }
      val studySetHash = registry?.optString("studySetHash")?.ifBlank { null }

      return@withContext StudySetGenerateResult(
        success = success,
        cached = cached,
        studySetRef = studySetRef,
        studySetHash = studySetHash,
        errorCode = if (success) null else json?.optString("code")?.ifBlank { null },
        error = if (success) null else json?.optString("error")?.ifBlank { "HTTP ${res.code}" },
      )
    }
  }

  private fun fetchSongStatsFromSubgraph(subgraphUrl: String, trackId: String): SongStats? {
    val query = """
      {
        tracks(where: { id_in: [\"$trackId\"] }, first: 1) {
          id
          title
          artist
          album
          coverCid
          scrobbleCountTotal
          scrobbleCountVerified
          registeredAt
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val row = json.optJSONObject("data")?.optJSONArray("tracks")?.optJSONObject(0) ?: return null
    return SongStats(
      trackId = normalizeBytes32(row.optString("id", "")) ?: trackId,
      title = row.optString("title", "").trim().ifBlank { "Unknown Track" },
      artist = row.optString("artist", "").trim().ifBlank { "Unknown Artist" },
      album = row.optString("album", "").trim(),
      coverCid = row.optString("coverCid", "").trim().ifBlank { null },
      scrobbleCountTotal = row.optString("scrobbleCountTotal", "0").trim().toLongOrNull() ?: 0L,
      scrobbleCountVerified = row.optString("scrobbleCountVerified", "0").trim().toLongOrNull() ?: 0L,
      registeredAtSec = row.optString("registeredAt", "0").trim().toLongOrNull() ?: 0L,
    )
  }

  private fun fetchSongTopListenersFromSubgraph(subgraphUrl: String, trackId: String, maxEntries: Int): List<SongListenerRow> {
    val map = LinkedHashMap<String, Pair<Int, Long>>()

    var skip = 0
    while (skip < TRACK_LISTENER_MAX_SCAN) {
      val pageSize = minOf(TRACK_LISTENER_PAGE_SIZE, TRACK_LISTENER_MAX_SCAN - skip)
      val query = """
        {
          scrobbles(
            where: { track: \"$trackId\" }
            orderBy: timestamp
            orderDirection: desc
            first: $pageSize
            skip: $skip
          ) {
            user
            timestamp
          }
        }
      """.trimIndent()

      val json = postQuery(subgraphUrl, query)
      val items = json.optJSONObject("data")?.optJSONArray("scrobbles") ?: JSONArray()
      if (items.length() == 0) break

      for (i in 0 until items.length()) {
        val row = items.optJSONObject(i) ?: continue
        val user = normalizeAddress(row.optString("user", "")) ?: continue
        val timestamp = row.optString("timestamp", "0").trim().toLongOrNull() ?: 0L
        val prev = map[user]
        if (prev == null) {
          map[user] = 1 to timestamp
        } else {
          val count = prev.first + 1
          val latest = if (timestamp > prev.second) timestamp else prev.second
          map[user] = count to latest
        }
      }

      skip += items.length()
      if (items.length() < pageSize) break
    }

    return map.entries
      .map { SongListenerRow(userAddress = it.key, scrobbleCount = it.value.first, lastScrobbleAtSec = it.value.second) }
      .sortedWith(compareByDescending<SongListenerRow> { it.scrobbleCount }.thenBy { it.userAddress })
      .take(maxEntries)
  }

  private fun fetchSongRecentScrobblesFromSubgraph(subgraphUrl: String, trackId: String, maxEntries: Int): List<SongScrobbleRow> {
    val query = """
      {
        scrobbles(
          where: { track: \"$trackId\" }
          orderBy: timestamp
          orderDirection: desc
          first: $maxEntries
        ) {
          user
          timestamp
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val items = json.optJSONObject("data")?.optJSONArray("scrobbles") ?: JSONArray()
    val out = ArrayList<SongScrobbleRow>(items.length())
    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val user = normalizeAddress(row.optString("user", "")) ?: continue
      val timestamp = row.optString("timestamp", "0").trim().toLongOrNull() ?: 0L
      out.add(
        SongScrobbleRow(
          userAddress = user,
          playedAtSec = timestamp,
        ),
      )
    }
    return out
  }

  private fun fetchArtistTopTracksFromSubgraph(subgraphUrl: String, artistName: String, maxEntries: Int): List<ArtistTrackRow> {
    val escapedArtist = escapeGraphQL(artistName)
    val query = """
      {
        tracks(
          where: { artist_contains_nocase: \"$escapedArtist\" }
          orderBy: scrobbleCountTotal
          orderDirection: desc
          first: $maxEntries
        ) {
          id
          title
          artist
          album
          coverCid
          scrobbleCountTotal
          scrobbleCountVerified
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val items = json.optJSONObject("data")?.optJSONArray("tracks") ?: JSONArray()
    val rows = ArrayList<ArtistTrackRow>(items.length())

    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val trackId = normalizeBytes32(row.optString("id", "")) ?: continue
      rows.add(
        ArtistTrackRow(
          trackId = trackId,
          title = row.optString("title", "").trim().ifBlank { "Unknown Track" },
          artist = row.optString("artist", "").trim().ifBlank { "Unknown Artist" },
          album = row.optString("album", "").trim(),
          coverCid = row.optString("coverCid", "").trim().ifBlank { null },
          scrobbleCountTotal = row.optString("scrobbleCountTotal", "0").trim().toLongOrNull() ?: 0L,
          scrobbleCountVerified = row.optString("scrobbleCountVerified", "0").trim().toLongOrNull() ?: 0L,
        ),
      )
    }

    return rows
  }

  private fun fetchArtistTopListenersFromSubgraph(subgraphUrl: String, artistKey: String, maxEntries: Int): List<ArtistListenerRow> {
    val escapedKey = escapeGraphQL(artistKey)
    val query = """
      {
        userArtistStats(
          where: { artistKey: \"$escapedKey\" }
          orderBy: scrobbleCount
          orderDirection: desc
          first: $maxEntries
        ) {
          user
          scrobbleCount
          lastScrobbleAt
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val items = json.optJSONObject("data")?.optJSONArray("userArtistStats") ?: JSONArray()
    val out = ArrayList<ArtistListenerRow>(items.length())

    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val user = normalizeAddress(row.optString("user", "")) ?: continue
      out.add(
        ArtistListenerRow(
          userAddress = user,
          scrobbleCount = row.optString("scrobbleCount", "0").trim().toLongOrNull() ?: 0L,
          lastScrobbleAtSec = row.optString("lastScrobbleAt", "0").trim().toLongOrNull() ?: 0L,
        ),
      )
    }

    return out
  }

  private fun fetchArtistRecentScrobblesFromSubgraph(subgraphUrl: String, artistName: String, maxEntries: Int): List<ArtistScrobbleRow> {
    val escapedArtist = escapeGraphQL(artistName)
    val query = """
      {
        scrobbles(
          where: { track_: { artist_contains_nocase: \"$escapedArtist\" } }
          orderBy: timestamp
          orderDirection: desc
          first: $maxEntries
        ) {
          user
          timestamp
          track {
            id
            title
          }
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val items = json.optJSONObject("data")?.optJSONArray("scrobbles") ?: JSONArray()
    val out = ArrayList<ArtistScrobbleRow>(items.length())

    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val user = normalizeAddress(row.optString("user", "")) ?: continue
      val timestamp = row.optString("timestamp", "0").trim().toLongOrNull() ?: 0L
      val track = row.optJSONObject("track")
      val trackId = normalizeBytes32(track?.optString("id", "").orEmpty()) ?: continue
      val title = track?.optString("title", "").orEmpty().trim().ifBlank { "Unknown Track" }
      out.add(
        ArtistScrobbleRow(
          userAddress = user,
          trackId = trackId,
          title = title,
          playedAtSec = timestamp,
        ),
      )
    }

    return out
  }

  private fun postQuery(subgraphUrl: String, query: String): JSONObject {
    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Subgraph query failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
      val errors = json.optJSONArray("errors")
      if (errors != null && errors.length() > 0) {
        val msg = errors.optJSONObject(0)?.optString("message", "GraphQL error") ?: "GraphQL error"
        throw IllegalStateException(msg)
      }
      json
    }
  }

  private fun activitySubgraphUrls(): List<String> {
    val fromBuildConfig = BuildConfig.TEMPO_SCROBBLE_SUBGRAPH_URL.trim().removeSuffix("/")
    val urls = ArrayList<String>(3)
    if (fromBuildConfig.isNotBlank()) urls.add(fromBuildConfig)
    urls.add(DEFAULT_ACTIVITY_SUBGRAPH)
    urls.add(LEGACY_ACTIVITY_SUBGRAPH)
    return urls.distinct()
  }

  private fun normalizeAddress(raw: String): String? {
    val trimmed = raw.trim()
    if (!ADDRESS_REGEX.matches(trimmed)) return null
    return trimmed.lowercase()
  }

  private fun normalizeBytes32(raw: String): String? {
    val trimmed = raw.trim()
    if (!BYTES32_REGEX.matches(trimmed)) return null
    return trimmed.lowercase()
  }

  private fun escapeGraphQL(value: String): String {
    val sanitized = GRAPHQL_CONTROL_CHARS_REGEX.replace(value, " ")
    return sanitized.replace("\\", "\\\\").replace("\"", "\\\"")
  }

  private fun encodeUrlComponent(value: String): String {
    return java.net.URLEncoder.encode(value, "UTF-8")
  }
}
