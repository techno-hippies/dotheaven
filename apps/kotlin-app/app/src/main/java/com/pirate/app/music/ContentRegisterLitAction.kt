package com.pirate.app.music

import com.pirate.app.lit.LitRust
import org.json.JSONObject
import java.util.UUID

data class ContentRegisterResult(
  val success: Boolean,
  val contentId: String? = null,
  val txHash: String? = null,
  val blockNumber: Long? = null,
  val version: String? = null,
  val error: String? = null,
)

object ContentRegisterLitAction {
  // Keep in sync with `apps/frontend/src/lib/lit/action-cids.ts`.
  private const val CONTENT_REGISTER_V1_CID_NAGA_DEV = "QmVbhvmjcwRPx47K7UuEg8RrxZuTCbYF5DrkYbJaehBbrd"
  private const val CONTENT_REGISTER_V1_CID_NAGA_TEST = "QmdPHymWEbh4H8zBEhup9vWpCPwR5hTLK2Kb3H8hcjDga1"

  private fun contentRegisterCidForNetwork(litNetwork: String): String {
    return if (litNetwork.trim().lowercase() == "naga-test") CONTENT_REGISTER_V1_CID_NAGA_TEST else CONTENT_REGISTER_V1_CID_NAGA_DEV
  }

  fun registerContent(
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    trackId: String,
    pieceCid: String,
    datasetOwner: String,
    algo: Int,
    title: String,
    artist: String,
    album: String,
  ): ContentRegisterResult {
    val jsParams =
      JSONObject()
        .put("userPkpPublicKey", userPkpPublicKey)
        .put("trackId", trackId)
        .put("pieceCid", pieceCid)
        .put("datasetOwner", datasetOwner)
        .put("algo", algo)
        .put("title", title)
        .put("artist", artist)
        .put("album", album)
        .put("timestamp", System.currentTimeMillis().toString())
        .put("nonce", UUID.randomUUID().toString())

    val raw =
      LitRust.executeJsRaw(
        network = litNetwork,
        rpcUrl = litRpcUrl,
        code = "",
        ipfsId = contentRegisterCidForNetwork(litNetwork),
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
    return ContentRegisterResult(
      success = ok,
      contentId = response.optString("contentId", "").ifBlank { null },
      txHash = response.optString("txHash", "").ifBlank { null },
      blockNumber = response.optLong("blockNumber", 0L).takeIf { it > 0L },
      version = response.optString("version", "").ifBlank { null },
      error = response.optString("error", "").ifBlank { null },
    )
  }
}

