package com.pirate.app.music

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

object OnChainPlaylistsApi {
  private const val MEGA_RPC = "https://carrot.megaeth.com/rpc"
  private const val PLAYLIST_V1 = "0xF0337C4A335cbB3B31c981945d3bE5B914F7B329"
  private const val USER_NONCES_SELECTOR = "0x2f7801f4" // userNonces(address)

  private const val SUBGRAPH_PLAYLISTS =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn"

  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchUserPlaylists(ownerAddress: String, maxEntries: Int = 50): List<OnChainPlaylist> = withContext(Dispatchers.IO) {
    val addr = ownerAddress.trim().lowercase()
    val query = """
      {
        playlists(
          where: { owner: "$addr", exists: true }
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
    val req = Request.Builder().url(SUBGRAPH_PLAYLISTS).post(body).build()
    client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Goldsky query failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
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
    val query = """
      {
        playlistTracks(
          where: { playlist: "$id" }
          orderBy: position
          orderDirection: asc
          first: $maxEntries
        ) {
          trackId position
        }
      }
    """.trimIndent()

    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(SUBGRAPH_PLAYLISTS).post(body).build()
    client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Goldsky query failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
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

  /**
   * PlaylistV1.userNonces(address) → decimal string, used as replay-protection nonce for playlist-v1 Lit Action.
   */
  suspend fun fetchUserNonce(userAddress: String): String = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase()
    if (!addr.startsWith("0x") || addr.length != 42) throw IllegalArgumentException("Invalid user address: $userAddress")

    val data = USER_NONCES_SELECTOR + addr.drop(2).padStart(64, '0')
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
        .url(MEGA_RPC)
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
