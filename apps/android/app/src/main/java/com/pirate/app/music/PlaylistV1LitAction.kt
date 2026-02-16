package com.pirate.app.music

import com.pirate.app.lit.LitRust
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class PlaylistV1ActionResult(
  val success: Boolean,
  val operation: String,
  val txHash: String? = null,
  val playlistId: String? = null,
  val error: String? = null,
)

object PlaylistV1LitAction {
  // Keep in sync with `lit-actions/cids/*.json`.
  private const val PLAYLIST_V1_CID_NAGA_DEV = "QmeajAFaBK9uk2YgE2jrxamMB3rhqRioyfLqXsmomyTkc5"
  private const val PLAYLIST_V1_CID_NAGA_TEST = "QmUf2jSaquVXJZBaoq5WCjKZKJpW7zVZVWHKuGi68GYZqq"

  private fun playlistV1CidForNetwork(litNetwork: String): String {
    return if (litNetwork.trim().lowercase() == "naga-test") PLAYLIST_V1_CID_NAGA_TEST else PLAYLIST_V1_CID_NAGA_DEV
  }

  suspend fun createEmptyPlaylist(
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    userEthAddress: String,
    name: String,
    visibility: Int = 0,
  ): PlaylistV1ActionResult = withContext(Dispatchers.IO) {
    val nonce = OnChainPlaylistsApi.fetchUserNonce(userEthAddress)
    val jsParams =
      JSONObject()
        .put("userPkpPublicKey", userPkpPublicKey)
        .put("operation", "create")
        .put("timestamp", System.currentTimeMillis().toString())
        .put("nonce", nonce)
        .put("name", name.trim())
        .put("coverCid", "")
        .put("visibility", visibility)
        .put("tracks", JSONArray())

    execute(
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      jsParams = jsParams,
      operation = "create",
    )
  }

  suspend fun addTrackToPlaylist(
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    userEthAddress: String,
    playlistId: String,
    track: MusicTrack,
  ): PlaylistV1ActionResult = withContext(Dispatchers.IO) {
    val existing = OnChainPlaylistsApi.fetchPlaylistTrackIds(playlistId)
    val newTrackId = TrackIds.computeMetaTrackId(track.title, track.artist, track.album)
    if (existing.any { it.equals(newTrackId, ignoreCase = true) }) {
      return@withContext PlaylistV1ActionResult(
        success = true,
        operation = "setTracks",
        txHash = null,
        playlistId = playlistId,
        error = null,
      )
    }

    val nonce = OnChainPlaylistsApi.fetchUserNonce(userEthAddress)
    val jsTracks = JSONArray().put(track.toPlaylistTrackJson())
    val jsParams =
      JSONObject()
        .put("userPkpPublicKey", userPkpPublicKey)
        .put("operation", "setTracks")
        .put("timestamp", System.currentTimeMillis().toString())
        .put("nonce", nonce)
        .put("playlistId", playlistId)
        .put("existingTrackIds", JSONArray(existing))
        .put("tracks", jsTracks)

    execute(
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      jsParams = jsParams,
      operation = "setTracks",
    )
  }

  private fun MusicTrack.toPlaylistTrackJson(): JSONObject {
    val obj =
      JSONObject()
        .put("title", title)
        .put("artist", artist)

    if (album.isNotBlank()) obj.put("album", album)
    return obj
  }

  private fun execute(
    litNetwork: String,
    litRpcUrl: String,
    jsParams: JSONObject,
    operation: String,
  ): PlaylistV1ActionResult {
    val raw =
      LitRust.executeJsRaw(
        network = litNetwork,
        rpcUrl = litRpcUrl,
        code = "",
        ipfsId = playlistV1CidForNetwork(litNetwork),
        jsParamsJson = jsParams.toString(),
        useSingleNode = false,
      )
    val exec = LitRust.unwrapEnvelope(raw)
    val responseAny = exec.opt("response")
    val response =
      when (responseAny) {
        is JSONObject -> responseAny
        is String ->
          runCatching { JSONObject(responseAny) }
            .getOrElse { JSONObject().put("success", false).put("error", responseAny) }
        else -> JSONObject().put("success", false).put("error", "missing response")
      }

    val ok = response.optBoolean("success", false)
    return PlaylistV1ActionResult(
      success = ok,
      operation = response.optString("operation", operation),
      txHash = response.optString("txHash", "").ifBlank { null },
      playlistId = response.optString("playlistId", "").ifBlank { null },
      error = response.optString("error", "").ifBlank { null },
    )
  }
}

