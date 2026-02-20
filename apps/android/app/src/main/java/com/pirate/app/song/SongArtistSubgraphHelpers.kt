package com.pirate.app.song

import com.pirate.app.util.tempoMusicSocialSubgraphUrls
import java.net.URI
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

private const val TRACK_LISTENER_PAGE_SIZE = 1_000
private const val TRACK_LISTENER_MAX_SCAN = 10_000

internal fun fetchSongStatsFromSubgraph(subgraphUrl: String, trackId: String): SongStats? {
  val query =
    """
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

internal fun fetchSongTopListenersFromSubgraph(
  subgraphUrl: String,
  trackId: String,
  maxEntries: Int,
): List<SongListenerRow> {
  val map = LinkedHashMap<String, Pair<Int, Long>>()

  var skip = 0
  while (skip < TRACK_LISTENER_MAX_SCAN) {
    val pageSize = minOf(TRACK_LISTENER_PAGE_SIZE, TRACK_LISTENER_MAX_SCAN - skip)
    val query =
      """
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

internal fun fetchSongRecentScrobblesFromSubgraph(
  subgraphUrl: String,
  trackId: String,
  maxEntries: Int,
): List<SongScrobbleRow> {
  val query =
    """
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

internal fun fetchArtistTopTracksFromSubgraph(
  subgraphUrl: String,
  artistName: String,
  maxEntries: Int,
): List<ArtistTrackRow> {
  val targetNorm = normalizeArtistName(artistName)
  val query =
    """
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

internal fun fetchArtistTopListenersFromSubgraph(
  subgraphUrl: String,
  artistName: String,
  maxEntries: Int,
): List<ArtistListenerRow> {
  val targetNorm = normalizeArtistName(artistName)
  val byUser = LinkedHashMap<String, Pair<Long, Long>>()

  var skip = 0
  while (skip < TRACK_LISTENER_MAX_SCAN) {
    val pageSize = minOf(TRACK_LISTENER_PAGE_SIZE, TRACK_LISTENER_MAX_SCAN - skip)
    val query =
      """
        query ArtistTopListeners(${"$"}artist: String!) {
          scrobbles(
            where: { track_: { artist_contains_nocase: ${"$"}artist } }
            orderBy: timestamp
            orderDirection: desc
            first: $pageSize
            skip: $skip
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
    if (items.length() == 0) break

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

    skip += items.length()
    if (items.length() < pageSize) break
  }

  return byUser.entries
    .map { ArtistListenerRow(userAddress = it.key, scrobbleCount = it.value.first, lastScrobbleAtSec = it.value.second) }
    .sortedWith(compareByDescending<ArtistListenerRow> { it.scrobbleCount }.thenBy { it.userAddress })
    .take(maxEntries)
}

internal fun fetchArtistRecentScrobblesFromSubgraph(
  subgraphUrl: String,
  artistName: String,
  maxEntries: Int,
): List<ArtistScrobbleRow> {
  val targetNorm = normalizeArtistName(artistName)
  val query =
    """
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

internal fun postQuery(subgraphUrl: String, query: String, variables: JSONObject? = null): JSONObject {
  val payload = JSONObject().put("query", query)
  if (variables != null) payload.put("variables", variables)
  val body = payload.toString().toRequestBody(songArtistJsonMediaType)
  val req = Request.Builder().url(subgraphUrl).post(body).build()
  return songArtistClient.newCall(req).execute().use { res ->
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

internal fun musicSocialSubgraphUrls(): List<String> {
  return tempoMusicSocialSubgraphUrls().distinct().filterNot(::isLikelyLocalSubgraphUrl)
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

internal fun isSubgraphAvailabilityError(error: Throwable?): Boolean {
  val msg = error?.message?.lowercase().orEmpty()
  if (msg.isBlank()) return false
  return msg.contains("subgraph query failed: 530") ||
    msg.contains("subgraph query failed: 52") ||
    msg.contains("origin dns") ||
    msg.contains("cloudflare")
}
