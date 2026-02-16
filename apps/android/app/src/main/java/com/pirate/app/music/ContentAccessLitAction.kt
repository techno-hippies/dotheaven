package com.pirate.app.music

import android.content.Context
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.lit.LitRust
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class ContentAccessResult(
  val success: Boolean,
  val operation: String? = null,
  val txHash: String? = null,
  val blockNumber: Long? = null,
  val version: String? = null,
  val error: String? = null,
)

object ContentAccessLitAction {
  // Keep in sync with `apps/web/src/lib/lit/action-cids.ts`.
  private const val CONTENT_ACCESS_V1_CID_NAGA_DEV = "QmXhzbZqvfg7b29eY3CzyV9ep4kvL9QxibKDYqBYAiQoDT"
  private const val CONTENT_ACCESS_V1_CID_NAGA_TEST = "QmcgN7ed4ePaCfpkzcwxiTG6WkvfgkPmNK26FZW67kbdau"

  private fun contentAccessCidForNetwork(litNetwork: String): String {
    return if (litNetwork.trim().lowercase() == "naga-test") CONTENT_ACCESS_V1_CID_NAGA_TEST else CONTENT_ACCESS_V1_CID_NAGA_DEV
  }

  suspend fun grantAccess(
    appContext: Context,
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    contentId: String,
    grantee: String,
  ): ContentAccessResult {
    return manageAccess(
      appContext = appContext,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      userPkpPublicKey = userPkpPublicKey,
      operation = "grant",
      contentId = contentId,
      grantee = grantee,
      contentIds = null,
    )
  }

  suspend fun manageAccess(
    appContext: Context,
    litNetwork: String,
    litRpcUrl: String,
    userPkpPublicKey: String,
    operation: String,
    contentId: String? = null,
    grantee: String? = null,
    contentIds: List<String>? = null,
  ): ContentAccessResult {
    val jsParams =
      JSONObject()
        .put("userPkpPublicKey", userPkpPublicKey)
        .put("operation", operation)
        .put("timestamp", System.currentTimeMillis().toString())
        .put("nonce", UUID.randomUUID().toString())

    if (!contentId.isNullOrBlank()) jsParams.put("contentId", contentId.trim().lowercase())
    if (!grantee.isNullOrBlank()) jsParams.put("grantee", grantee.trim().lowercase())
    if (!contentIds.isNullOrEmpty()) jsParams.put("contentIds", JSONArray(contentIds.map { it.trim().lowercase() }))

    val raw =
      LitAuthContextManager.runWithSavedStateRecovery(appContext) {
        LitRust.executeJsRaw(
          network = litNetwork,
          rpcUrl = litRpcUrl,
          code = "",
          ipfsId = contentAccessCidForNetwork(litNetwork),
          jsParamsJson = jsParams.toString(),
          useSingleNode = false,
        )
      }
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
    return ContentAccessResult(
      success = ok,
      operation = response.optString("operation", operation).ifBlank { operation },
      txHash = response.optString("txHash", "").ifBlank { null },
      blockNumber = response.optLong("blockNumber", 0L).takeIf { it > 0L },
      version = response.optString("version", "").ifBlank { null },
      error = response.optString("error", "").ifBlank { null },
    )
  }
}
