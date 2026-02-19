package com.pirate.app.music

import com.pirate.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

object OnChainPlaylistsApi {
  private const val TEMPO_RPC = "https://rpc.moderato.tempo.xyz"
  private const val PLAYLIST_V1 = "0xeF6a21324548155630670397DA68318E126510EF"
  private const val OWNER_NONCES_SELECTOR = "0x56916b04" // ownerNonces(address)

  private const val DEFAULT_SUBGRAPH_PLAYLISTS =
    "https://graph.dotheaven.org/subgraphs/name/dotheaven/playlist-feed-tempo"

  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchUserPlaylists(ownerAddress: String, maxEntries: Int = 50): List<OnChainPlaylist> = withContext(Dispatchers.IO) {
    val addr = ownerAddress.trim().lowercase()
    if (addr.isBlank()) return@withContext emptyList()
    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in playlistsSubgraphUrls()) {
      try {
        val playlists = fetchUserPlaylistsFromSubgraph(subgraphUrl, addr, maxEntries)
        if (playlists.isNotEmpty()) return@withContext playlists
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }
    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  private fun fetchUserPlaylistsFromSubgraph(
    subgraphUrl: String,
    ownerAddress: String,
    maxEntries: Int,
  ): List<OnChainPlaylist> {
    val query = """
      {
        playlists(
          where: { owner: "$ownerAddress", exists: true }
          orderBy: updatedAt
          orderDirection: desc
          first: $maxEntries
        ) {
          id owner name coverCid visibility trackCount version exists
          tracksHash createdAt updatedAt
        }
      }
    """.trimIndent()

    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Playlist query failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
      val errors = json.optJSONArray("errors")
      if (errors != null && errors.length() > 0) {
        val msg = errors.optJSONObject(0)?.optString("message", "GraphQL error") ?: "GraphQL error"
        throw IllegalStateException(msg)
      }
      val playlists = json.optJSONObject("data")?.optJSONArray("playlists") ?: JSONArray()
      val out = ArrayList<OnChainPlaylist>(playlists.length())
      for (i in 0 until playlists.length()) {
        val p = playlists.optJSONObject(i) ?: continue
        out.add(
          OnChainPlaylist(
            id = p.optString("id", ""),
            owner = p.optString("owner", ""),
            name = p.optString("name", ""),
            coverCid = p.optString("coverCid", ""),
            visibility = p.optInt("visibility", 0),
            trackCount = p.optInt("trackCount", 0),
            version = p.optInt("version", 0),
            exists = p.optBoolean("exists", false),
            tracksHash = p.optString("tracksHash", ""),
            createdAtSec = p.optLong("createdAt", 0L),
            updatedAtSec = p.optLong("updatedAt", 0L),
          ),
        )
      }
      out
    }
  }

  suspend fun fetchPlaylistTrackIds(
    playlistId: String,
    maxEntries: Int = 1000,
  ): List<String> = withContext(Dispatchers.IO) {
    val id = playlistId.trim().lowercase()
    if (id.isBlank()) return@withContext emptyList()
    var sawSuccessfulEmpty = false
    var lastError: Throwable? = null
    for (subgraphUrl in playlistsSubgraphUrls()) {
      try {
        val trackIds = fetchPlaylistTrackIdsFromSubgraph(subgraphUrl, id, maxEntries)
        if (trackIds.isNotEmpty()) return@withContext trackIds
        sawSuccessfulEmpty = true
      } catch (error: Throwable) {
        lastError = error
      }
    }
    if (sawSuccessfulEmpty) return@withContext emptyList()
    if (lastError != null) throw lastError
    emptyList()
  }

  private fun fetchPlaylistTrackIdsFromSubgraph(
    subgraphUrl: String,
    playlistId: String,
    maxEntries: Int,
  ): List<String> {
    val query = """
      {
        playlistTracks(
          where: { playlist: "$playlistId" }
          orderBy: position
          orderDirection: asc
          first: $maxEntries
        ) {
          trackId position
        }
      }
    """.trimIndent()

    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Playlist query failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
      val errors = json.optJSONArray("errors")
      if (errors != null && errors.length() > 0) {
        val msg = errors.optJSONObject(0)?.optString("message", "GraphQL error") ?: "GraphQL error"
        throw IllegalStateException(msg)
      }
      val tracks = json.optJSONObject("data")?.optJSONArray("playlistTracks") ?: JSONArray()
      val out = ArrayList<String>(tracks.length())
      for (i in 0 until tracks.length()) {
        val t = tracks.optJSONObject(i) ?: continue
        val trackId = t.optString("trackId", "").trim()
        if (trackId.isNotEmpty()) out.add(trackId)
      }
      out
    }
  }

  private fun playlistsSubgraphUrls(): List<String> {
    val fromBuildConfig = BuildConfig.TEMPO_PLAYLISTS_SUBGRAPH_URL.trim().removeSuffix("/")
    val urls = ArrayList<String>(2)
    if (fromBuildConfig.isNotBlank()) urls.add(fromBuildConfig)
    urls.add(DEFAULT_SUBGRAPH_PLAYLISTS)
    return urls.distinct()
  }

  /** Legacy helper: PlaylistV1.ownerNonces(address) -> decimal string. */
  suspend fun fetchUserNonce(userAddress: String): String = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase()
    if (!addr.startsWith("0x") || addr.length != 42) throw IllegalArgumentException("Invalid user address: $userAddress")

    val data = OWNER_NONCES_SELECTOR + addr.drop(2).padStart(64, '0')
    val payload = JSONObject()
      .put("jsonrpc", "2.0")
      .put("id", 1)
      .put("method", "eth_call")
      .put(
        "params",
        JSONArray()
          .put(JSONObject().put("to", PLAYLIST_V1).put("data", data))
          .put("latest"),
      )

    val req =
      Request.Builder()
        .url(TEMPO_RPC)
        .post(payload.toString().toRequestBody(jsonMediaType))
        .build()

    client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("RPC failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
      val err = json.optJSONObject("error")
      if (err != null) {
        throw IllegalStateException("RPC error: ${err.optString("message", err.toString())}")
      }
      val resultHex = json.optString("result", "").trim()
      if (!resultHex.startsWith("0x")) throw IllegalStateException("RPC eth_call missing result")
      val hex = resultHex.removePrefix("0x").ifBlank { "0" }
      java.math.BigInteger(hex, 16).toString(10)
    }
  }
}
