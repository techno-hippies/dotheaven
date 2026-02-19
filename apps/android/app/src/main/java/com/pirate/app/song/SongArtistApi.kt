package com.pirate.app.song

import com.pirate.app.music.SongPublishService
import com.pirate.app.scrobble.TempoScrobbleApi
import com.pirate.app.util.HttpClients
import com.pirate.app.util.tempoMusicSocialSubgraphUrls
import java.net.URI
import java.math.BigInteger
import java.text.Normalizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.FunctionReturnDecoder
import org.web3j.abi.TypeReference
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Uint32
import org.web3j.abi.datatypes.generated.Uint64
import org.web3j.abi.datatypes.generated.Uint8
import org.web3j.crypto.Hash
import org.json.JSONArray
import org.json.JSONObject

private const val TEMPO_RPC_URL = "https://rpc.moderato.tempo.xyz"
private val ADDRESS_REGEX = Regex("^0x[a-fA-F0-9]{40}$")
private val BYTES32_REGEX = Regex("^0x[a-fA-F0-9]{64}$")
private val GRAPHQL_CONTROL_CHARS_REGEX = Regex("[\\u0000-\\u001F\\u007F]")
private const val TRACK_LISTENER_PAGE_SIZE = 1_000
private const val TRACK_LISTENER_MAX_SCAN = 10_000
private val TRACK_REGISTERED_TOPIC = Hash.sha3String("TrackRegistered(bytes32,uint8,bytes32,bytes32,uint64,uint32)")
private const val TRACK_KIND_IPID_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000002"
private const val CHAIN_TRACK_SCAN_WINDOW_BLOCKS = 350_000L
private const val CHAIN_TRACK_SCAN_CHUNK_BLOCKS = 20_000L

data class SongStats(
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val scrobbleCountTotal: Long,
  val scrobbleCountVerified: Long,
  val durationSec: Int = 0,
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

private data class ChainTrackMeta(
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val durationSec: Int,
  val registeredAtSec: Long,
)

object SongArtistApi {
  private val client = HttpClients.Api
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchSongStats(trackId: String): SongStats? = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext null

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val row = fetchSongStatsFromSubgraph(subgraphUrl, normalizedTrackId)
        if (row != null) return@withContext row
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    fetchSongStatsFromChain(normalizedTrackId)?.let { return@withContext it }

    if (sawSuccessfulEmpty) return@withContext null
    if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext null
    if (lastError != null) throw lastError
    null
  }

  suspend fun fetchSongTopListeners(trackId: String, maxEntries: Int = 20): List<SongListenerRow> = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 100)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows = fetchSongTopListenersFromSubgraph(subgraphUrl, normalizedTrackId, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchSongRecentScrobbles(trackId: String, maxEntries: Int = 40): List<SongScrobbleRow> = withContext(Dispatchers.IO) {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 200)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows = fetchSongRecentScrobblesFromSubgraph(subgraphUrl, normalizedTrackId, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchArtistTopTracks(artistName: String, maxEntries: Int = 50): List<ArtistTrackRow> = withContext(Dispatchers.IO) {
    val artist = artistName.trim()
    if (artist.isBlank()) return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 200)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows = fetchArtistTopTracksFromSubgraph(subgraphUrl, artist, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (lastError != null) {
      val fallback = fetchArtistTopTracksFromChain(artist, first)
      if (fallback.isNotEmpty()) return@withContext fallback
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchArtistTopListeners(artistName: String, maxEntries: Int = 20): List<ArtistListenerRow> = withContext(Dispatchers.IO) {
    val artist = artistName.trim()
    if (artist.isBlank()) return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 100)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows = fetchArtistTopListenersFromSubgraph(subgraphUrl, artist, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchArtistRecentScrobbles(artistName: String, maxEntries: Int = 40): List<ArtistScrobbleRow> = withContext(Dispatchers.IO) {
    val artist = artistName.trim()
    if (artist.isBlank()) return@withContext emptyList()
    val first = maxEntries.coerceIn(1, 200)

    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in musicSocialSubgraphUrls()) {
      try {
        val rows = fetchArtistRecentScrobblesFromSubgraph(subgraphUrl, artist, first)
        if (rows.isNotEmpty()) return@withContext rows
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  suspend fun fetchLatestTracksFromChain(maxEntries: Int = 100): List<SongStats> = withContext(Dispatchers.IO) {
    val first = maxEntries.coerceIn(1, 200)
    val trackIds = fetchRecentRegisteredTrackIdsFromChain(first)
    if (trackIds.isEmpty()) return@withContext emptyList()
    val meta = fetchTrackMetaFromChain(trackIds)
    if (meta.isEmpty()) return@withContext emptyList()
    meta.values
      .sortedByDescending { it.registeredAtSec }
      .take(first)
      .map {
        SongStats(
          trackId = it.trackId,
          title = it.title.ifBlank { it.trackId.take(14) },
          artist = it.artist.ifBlank { "Unknown Artist" },
          album = it.album,
          coverCid = it.coverCid,
          scrobbleCountTotal = 0L,
          scrobbleCountVerified = 0L,
          registeredAtSec = it.registeredAtSec,
        )
      }
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
        tracks(where: { id_in: ["$trackId"] }, first: 1) {
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
            where: { track: "$trackId" }
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
          where: { track: "$trackId" }
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
    val targetNorm = normalizeArtistName(artistName)
    val query = """
      query ArtistTopTracks(${"$"}artist: String!) {
        tracks(
          where: { artist_contains_nocase: ${"$"}artist }
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

    val variables = JSONObject().put("artist", artistName)
    val json = postQuery(subgraphUrl, query, variables)
    val items = json.optJSONObject("data")?.optJSONArray("tracks") ?: JSONArray()
    val rows = ArrayList<ArtistTrackRow>(items.length())

    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val trackId = normalizeBytes32(row.optString("id", "")) ?: continue
      val rowArtist = row.optString("artist", "").trim()
      if (!artistMatchesTarget(rowArtist, targetNorm)) continue
      rows.add(
        ArtistTrackRow(
          trackId = trackId,
          title = row.optString("title", "").trim().ifBlank { "Unknown Track" },
          artist = rowArtist.ifBlank { "Unknown Artist" },
          album = row.optString("album", "").trim(),
          coverCid = row.optString("coverCid", "").trim().ifBlank { null },
          scrobbleCountTotal = row.optString("scrobbleCountTotal", "0").trim().toLongOrNull() ?: 0L,
          scrobbleCountVerified = row.optString("scrobbleCountVerified", "0").trim().toLongOrNull() ?: 0L,
        ),
      )
    }

    return rows
  }

  private fun fetchArtistTopListenersFromSubgraph(subgraphUrl: String, artistName: String, maxEntries: Int): List<ArtistListenerRow> {
    val targetNorm = normalizeArtistName(artistName)
    val query = """
      query ArtistTopListeners(${"$"}artist: String!) {
        scrobbles(
          where: { track_: { artist_contains_nocase: ${"$"}artist } }
          orderBy: timestamp
          orderDirection: desc
          first: ${TRACK_LISTENER_MAX_SCAN}
        ) {
          user
          timestamp
          track {
            artist
          }
        }
      }
    """.trimIndent()

    val variables = JSONObject().put("artist", artistName)
    val json = postQuery(subgraphUrl, query, variables)
    val items = json.optJSONObject("data")?.optJSONArray("scrobbles") ?: JSONArray()
    val byUser = LinkedHashMap<String, Pair<Long, Long>>()

    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val user = normalizeAddress(row.optString("user", "")) ?: continue
      val last = row.optString("timestamp", "0").trim().toLongOrNull() ?: 0L
      val trackArtist = row.optJSONObject("track")?.optString("artist", "").orEmpty()
      if (!artistMatchesTarget(trackArtist, targetNorm)) continue
      val prev = byUser[user]
      if (prev == null) {
        byUser[user] = 1L to last
      } else {
        byUser[user] = (prev.first + 1L) to maxOf(prev.second, last)
      }
    }

    return byUser.entries
      .map { ArtistListenerRow(userAddress = it.key, scrobbleCount = it.value.first, lastScrobbleAtSec = it.value.second) }
      .sortedWith(compareByDescending<ArtistListenerRow> { it.scrobbleCount }.thenBy { it.userAddress })
      .take(maxEntries)
  }

  private fun fetchArtistRecentScrobblesFromSubgraph(subgraphUrl: String, artistName: String, maxEntries: Int): List<ArtistScrobbleRow> {
    val targetNorm = normalizeArtistName(artistName)
    val query = """
      query ArtistRecentScrobbles(${"$"}artist: String!) {
        scrobbles(
          where: { track_: { artist_contains_nocase: ${"$"}artist } }
          orderBy: timestamp
          orderDirection: desc
          first: $maxEntries
        ) {
          user
          timestamp
          track {
            id
            title
            artist
          }
        }
    }
    """.trimIndent()

    val variables = JSONObject().put("artist", artistName)
    val json = postQuery(subgraphUrl, query, variables)
    val items = json.optJSONObject("data")?.optJSONArray("scrobbles") ?: JSONArray()
    val out = ArrayList<ArtistScrobbleRow>(items.length())

    for (i in 0 until items.length()) {
      val row = items.optJSONObject(i) ?: continue
      val user = normalizeAddress(row.optString("user", "")) ?: continue
      val timestamp = row.optString("timestamp", "0").trim().toLongOrNull() ?: 0L
      val track = row.optJSONObject("track")
      val trackId = normalizeBytes32(track?.optString("id", "").orEmpty()) ?: continue
      val trackArtist = track?.optString("artist", "").orEmpty()
      if (!artistMatchesTarget(trackArtist, targetNorm)) continue
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

  private fun postQuery(subgraphUrl: String, query: String, variables: JSONObject? = null): JSONObject {
    val payload = JSONObject().put("query", query)
    if (variables != null) payload.put("variables", variables)
    val body = payload.toString().toRequestBody(jsonMediaType)
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

  private fun musicSocialSubgraphUrls(): List<String> {
    return tempoMusicSocialSubgraphUrls()
      .distinct()
      .filterNot(::isLikelyLocalSubgraphUrl)
  }

  private fun isLikelyLocalSubgraphUrl(url: String): Boolean {
    val host = runCatching { URI(url).host.orEmpty().lowercase() }.getOrDefault("")
    if (host.isBlank()) return false
    if (host == "localhost" || host == "10.0.2.2" || host == "127.0.0.1") return true
    if (host.startsWith("192.168.") || host.startsWith("10.")) return true
    if (host.startsWith("172.")) {
      val second = host.split(".").getOrNull(1)?.toIntOrNull()
      if (second != null && second in 16..31) return true
    }
    return false
  }

  private fun isSubgraphAvailabilityError(error: Throwable?): Boolean {
    val msg = error?.message?.lowercase().orEmpty()
    if (msg.isBlank()) return false
    return msg.contains("subgraph query failed: 530") ||
      msg.contains("subgraph query failed: 52") ||
      msg.contains("origin dns") ||
      msg.contains("cloudflare")
  }

  private fun fetchSongStatsFromChain(trackId: String): SongStats? {
    val meta = getTrackMetaFromChain(trackId) ?: return null
    return SongStats(
      trackId = meta.trackId,
      title = meta.title.ifBlank { meta.trackId.take(14) },
      artist = meta.artist.ifBlank { "Unknown Artist" },
      album = meta.album,
      coverCid = meta.coverCid,
      scrobbleCountTotal = 0L,
      scrobbleCountVerified = 0L,
      registeredAtSec = meta.registeredAtSec,
    )
  }

  private fun fetchArtistTopTracksFromChain(artistName: String, maxEntries: Int): List<ArtistTrackRow> {
    val targetNorm = normalizeArtistName(artistName)
    if (targetNorm.isBlank()) return emptyList()
    val candidateLimit = (maxEntries * 40).coerceIn(maxEntries, 1200)
    val trackIds = fetchRecentRegisteredTrackIdsFromChain(candidateLimit)
    if (trackIds.isEmpty()) return emptyList()
    val metaByTrack = fetchTrackMetaFromChain(trackIds)
    if (metaByTrack.isEmpty()) return emptyList()
    return metaByTrack.values
      .asSequence()
      .filter { artistMatchesTarget(it.artist, targetNorm) }
      .sortedByDescending { it.registeredAtSec }
      .take(maxEntries)
      .map {
        ArtistTrackRow(
          trackId = it.trackId,
          title = it.title.ifBlank { it.trackId.take(14) },
          artist = it.artist.ifBlank { "Unknown Artist" },
          album = it.album,
          coverCid = it.coverCid,
          scrobbleCountTotal = 0L,
          scrobbleCountVerified = 0L,
        )
      }
      .toList()
  }

  private fun fetchRecentRegisteredTrackIdsFromChain(maxEntries: Int): List<String> {
    if (maxEntries <= 0) return emptyList()
    val latestBlock = runCatching { ethBlockNumber() }.getOrElse { return emptyList() }
    val minBlock = (latestBlock - CHAIN_TRACK_SCAN_WINDOW_BLOCKS).coerceAtLeast(0L)
    val out = LinkedHashSet<String>(maxEntries)

    var toBlock = latestBlock
    while (toBlock >= minBlock && out.size < maxEntries) {
      val fromBlock = maxOf(minBlock, toBlock - CHAIN_TRACK_SCAN_CHUNK_BLOCKS + 1)
      val logs =
        runCatching {
          ethGetLogs(
            address = TempoScrobbleApi.SCROBBLE_V4,
            fromBlock = fromBlock,
            toBlock = toBlock,
            topics =
              JSONArray()
                .put(TRACK_REGISTERED_TOPIC)
                .put(JSONObject.NULL)
                .put(TRACK_KIND_IPID_TOPIC),
          )
        }.getOrNull() ?: JSONArray()

      for (i in logs.length() - 1 downTo 0) {
        val log = logs.optJSONObject(i) ?: continue
        val topics = log.optJSONArray("topics") ?: continue
        val trackId = normalizeBytes32(topics.optString(1, "")) ?: continue
        out.add(trackId)
        if (out.size >= maxEntries) break
      }

      if (fromBlock == 0L) break
      toBlock = fromBlock - 1
    }

    return out.toList()
  }

  private fun fetchTrackMetaFromChain(trackIds: List<String>): Map<String, ChainTrackMeta> {
    if (trackIds.isEmpty()) return emptyMap()
    val out = LinkedHashMap<String, ChainTrackMeta>(trackIds.size)
    for (raw in trackIds) {
      val trackId = normalizeBytes32(raw) ?: continue
      if (out.containsKey(trackId)) continue
      val meta = getTrackMetaFromChain(trackId) ?: continue
      out[trackId] = meta
    }
    return out
  }

  private fun getTrackMetaFromChain(trackId: String): ChainTrackMeta? {
    val normalizedTrackId = normalizeBytes32(trackId) ?: return null
    val bytes = runCatching { hexToBytes(normalizedTrackId) }.getOrNull() ?: return null
    if (bytes.size != 32) return null

    val outputs =
      listOf(
        object : TypeReference<Utf8String>() {},
        object : TypeReference<Utf8String>() {},
        object : TypeReference<Utf8String>() {},
        object : TypeReference<Uint8>() {},
        object : TypeReference<Bytes32>() {},
        object : TypeReference<Uint64>() {},
        object : TypeReference<Utf8String>() {},
        object : TypeReference<Uint32>() {},
      )

    val function = Function("getTrack", listOf(Bytes32(bytes)), outputs)
    val callData = FunctionEncoder.encode(function)
    val result = runCatching { ethCall(TempoScrobbleApi.SCROBBLE_V4, callData) }.getOrNull().orEmpty()
    if (!result.startsWith("0x") || result.length <= 2) return null
    val decoded = runCatching { FunctionReturnDecoder.decode(result, function.outputParameters) }.getOrNull() ?: return null
    if (decoded.size < 8) return null

    val title = (decoded.getOrNull(0) as? Utf8String)?.value?.trim().orEmpty()
    val artist = (decoded.getOrNull(1) as? Utf8String)?.value?.trim().orEmpty()
    val album = (decoded.getOrNull(2) as? Utf8String)?.value?.trim().orEmpty()
    val registeredAtSec = (decoded.getOrNull(5) as? Uint64)?.value?.toLong() ?: 0L
    val coverCid = (decoded.getOrNull(6) as? Utf8String)?.value?.trim().orEmpty().ifBlank { null }
    val durationSec = (decoded.getOrNull(7) as? Uint32)?.value?.toInt() ?: 0

    return ChainTrackMeta(
      trackId = normalizedTrackId,
      title = title,
      artist = artist,
      album = album,
      coverCid = coverCid,
      durationSec = durationSec,
      registeredAtSec = registeredAtSec,
    )
  }

  private fun ethBlockNumber(): Long {
    val json = postRpc("eth_blockNumber", JSONArray())
    return parseHexLong(json.optString("result", "0x0"))
  }

  private fun ethGetLogs(
    address: String,
    fromBlock: Long,
    toBlock: Long,
    topics: JSONArray,
  ): JSONArray {
    val filter =
      JSONObject()
        .put("address", address)
        .put("fromBlock", hexQuantity(fromBlock))
        .put("toBlock", hexQuantity(toBlock))
        .put("topics", topics)
    val json = postRpc("eth_getLogs", JSONArray().put(filter))
    return json.optJSONArray("result") ?: JSONArray()
  }

  private fun ethCall(to: String, data: String): String {
    val call =
      JSONObject()
        .put("to", to)
        .put("data", data)
    val json = postRpc("eth_call", JSONArray().put(call).put("latest"))
    return json.optString("result", "0x")
  }

  private fun postRpc(method: String, params: JSONArray): JSONObject {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", method)
        .put("params", params)
    val req = Request.Builder().url(TEMPO_RPC_URL).post(payload.toString().toRequestBody(jsonMediaType)).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("RPC failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      val err = json.optJSONObject("error")
      if (err != null) throw IllegalStateException(err.optString("message", err.toString()))
      json
    }
  }

  private fun parseHexLong(value: String): Long {
    val clean = value.trim().removePrefix("0x").ifBlank { "0" }
    return runCatching { BigInteger(clean, 16).toLong() }.getOrDefault(0L)
  }

  private fun hexQuantity(value: Long): String {
    if (value <= 0L) return "0x0"
    return "0x" + value.toString(16)
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

  private fun normalizeArtistName(name: String): String {
    val folded = Normalizer.normalize(name, Normalizer.Form.NFKD)
      .replace(Regex("[\\u0300-\\u036f]"), "")
    return folded
      .lowercase()
      .replace("$", "s")
      .replace("&", " and ")
      .replace(Regex("\\bfeat\\.?\\b|\\bft\\.?\\b|\\bfeaturing\\b"), " feat ")
      .replace(Regex("[^a-z0-9]+"), " ")
      .trim()
      .replace(Regex("\\s+"), " ")
  }

  private fun splitArtistNames(name: String): List<String> {
    val unified = name
      .lowercase()
      .replace(Regex("\\bfeat\\.?\\b|\\bft\\.?\\b|\\bfeaturing\\b"), "|")
      .replace(Regex("\\bstarring\\b"), "|")
      .replace("&", "|")
      .replace("+", "|")
      .replace(Regex("\\bx\\b"), "|")
      .replace(Regex("\\band\\b"), "|")
      .replace(Regex("\\bwith\\b"), "|")
      .replace("/", "|")
      .replace(",", "|")
    return unified
      .split("|")
      .map { normalizeArtistName(it) }
      .filter { it.isNotBlank() }
  }

  private fun normalizeArtistVariants(name: String): Set<String> {
    val base = normalizeArtistName(name)
    if (base.isBlank()) return emptySet()
    val variants = linkedSetOf(base)

    val noParens = base.replace(Regex("\\s*\\([^)]*\\)\\s*"), " ").replace(Regex("\\s+"), " ").trim()
    if (noParens.isNotBlank() && noParens != base) variants.add(noParens)

    if (base.startsWith("the ")) {
      variants.add(base.removePrefix("the ").trim())
    }
    if (base.endsWith(" the")) {
      val noTrail = base.removeSuffix(" the").trim()
      if (noTrail.isNotBlank()) {
        variants.add(noTrail)
        variants.add("the $noTrail")
      }
    }
    return variants
  }

  private fun wordContains(haystack: String, needle: String): Boolean {
    if (haystack.isBlank() || needle.isBlank()) return false
    return " $haystack ".contains(" $needle ")
  }

  private fun artistMatchesTarget(artistField: String, targetNorm: String): Boolean {
    if (targetNorm.isBlank()) return false
    val targetVariants = normalizeArtistVariants(targetNorm)
    val fieldVariants = normalizeArtistVariants(artistField)

    for (fieldVariant in fieldVariants) {
      for (targetVariant in targetVariants) {
        if (fieldVariant == targetVariant) return true
        if (wordContains(fieldVariant, targetVariant)) return true
        if (wordContains(targetVariant, fieldVariant)) return true
      }
    }

    for (part in splitArtistNames(artistField)) {
      for (targetVariant in targetVariants) {
        if (part == targetVariant) return true
        if (wordContains(part, targetVariant)) return true
      }
    }
    return false
  }

  private fun hexToBytes(hex0x: String): ByteArray {
    val hex = hex0x.removePrefix("0x")
    if (hex.length % 2 != 0) throw IllegalArgumentException("Odd hex length")
    val out = ByteArray(hex.length / 2)
    var i = 0
    while (i < hex.length) {
      out[i / 2] = hex.substring(i, i + 2).toInt(16).toByte()
      i += 2
    }
    return out
  }

  private fun encodeUrlComponent(value: String): String {
    return java.net.URLEncoder.encode(value, "UTF-8")
  }
}
