package com.pirate.app.lit

import expo.modules.heavenlitrust.HeavenLitRustModule
import org.json.JSONObject

object LitRust {
  private val jni = HeavenLitRustModule()

  data class LoadUploadResult(
    val id: String,
    val gatewayUrl: String,
    val winc: String? = null,
  )

  fun healthcheckRaw(): String = jni.healthcheck()

  fun testConnectRaw(network: String, rpcUrl: String): String =
    jni.testConnect(network.trim(), rpcUrl.trim())

  fun executeJsRaw(
    network: String,
    rpcUrl: String,
    code: String = "",
    ipfsId: String = "",
    jsParamsJson: String = "",
    useSingleNode: Boolean = false,
  ): String {
    return jni.executeJs(
      network.trim(),
      rpcUrl.trim(),
      code,
      ipfsId,
      jsParamsJson,
      useSingleNode.toString(),
    )
  }

  fun clearAuthContextRaw(): String {
    return jni.clearAuthContext()
  }

  fun loadUploadRaw(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    filePath: String = "",
    contentType: String = "",
    tagsJson: String = "[]",
  ): String {
    return jni.loadUpload(
      network.trim(),
      rpcUrl.trim(),
      uploadUrl.trim(),
      uploadToken.trim(),
      gatewayUrlFallback.trim(),
      payload,
      filePath,
      contentType,
      tagsJson,
    )
  }

  fun loadEncryptUploadRaw(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    contentId: String,
    contentDecryptCid: String,
    filePath: String = "",
    contentType: String = "",
    tagsJson: String = "[]",
  ): String {
    return jni.loadEncryptUpload(
      network.trim(),
      rpcUrl.trim(),
      uploadUrl.trim(),
      uploadToken.trim(),
      gatewayUrlFallback.trim(),
      payload,
      contentId.trim(),
      contentDecryptCid.trim(),
      filePath,
      contentType,
      tagsJson,
    )
  }

  fun loadUpload(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    filePath: String = "",
    contentType: String = "",
    tagsJson: String = "[]",
  ): LoadUploadResult {
    val result = unwrapEnvelope(
      loadUploadRaw(
        network = network,
        rpcUrl = rpcUrl,
        uploadUrl = uploadUrl,
        uploadToken = uploadToken,
        gatewayUrlFallback = gatewayUrlFallback,
        payload = payload,
        filePath = filePath,
        contentType = contentType,
        tagsJson = tagsJson,
      ),
    )

    val id = result.optString("id", "").trim()
    if (id.isEmpty()) throw IllegalStateException("Load upload succeeded but returned no id")

    val gatewayUrl = result.optString("gatewayUrl", "").trim()
    if (gatewayUrl.isEmpty()) throw IllegalStateException("Load upload succeeded but returned no gatewayUrl")

    val winc = result.optString("winc", "").trim().ifBlank { null }
    return LoadUploadResult(id = id, gatewayUrl = gatewayUrl, winc = winc)
  }

  fun loadEncryptUpload(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    contentId: String,
    contentDecryptCid: String,
    filePath: String = "",
    contentType: String = "",
    tagsJson: String = "[]",
  ): LoadUploadResult {
    val result = unwrapEnvelope(
      loadEncryptUploadRaw(
        network = network,
        rpcUrl = rpcUrl,
        uploadUrl = uploadUrl,
        uploadToken = uploadToken,
        gatewayUrlFallback = gatewayUrlFallback,
        payload = payload,
        contentId = contentId,
        contentDecryptCid = contentDecryptCid,
        filePath = filePath,
        contentType = contentType,
        tagsJson = tagsJson,
      ),
    )

    val id = result.optString("id", "").trim()
    if (id.isEmpty()) throw IllegalStateException("Load upload succeeded but returned no id")

    val gatewayUrl = result.optString("gatewayUrl", "").trim()
    if (gatewayUrl.isEmpty()) throw IllegalStateException("Load upload succeeded but returned no gatewayUrl")

    val winc = result.optString("winc", "").trim().ifBlank { null }
    return LoadUploadResult(id = id, gatewayUrl = gatewayUrl, winc = winc)
  }

  fun viewPkpsByAuthDataRaw(
    network: String,
    rpcUrl: String,
    authMethodType: Int,
    authMethodId: String,
    limit: Int,
    offset: Int,
  ): String {
    return jni.viewPKPsByAuthData(
      network.trim(),
      rpcUrl.trim(),
      authMethodType.toString(),
      authMethodId,
      limit.toString(),
      offset.toString(),
    )
  }

  fun createAuthContextFromPasskeyCallbackRaw(
    network: String,
    rpcUrl: String,
    pkpPublicKey: String,
    authMethodType: Int,
    authMethodId: String,
    accessToken: String,
    authConfigJson: String,
  ): String {
    return jni.createAuthContextFromPasskeyCallback(
      network.trim(),
      rpcUrl.trim(),
      pkpPublicKey,
      authMethodType.toString(),
      authMethodId,
      accessToken,
      authConfigJson,
    )
  }

  fun unwrapEnvelope(raw: String): JSONObject {
    val envelope = JSONObject(raw)
    val ok = envelope.optBoolean("ok", false)
    if (!ok) {
      val error = envelope.optString("error", "Rust bridge call failed")
      throw IllegalStateException(error)
    }
    val result = envelope.optJSONObject("result")
    if (result != null) return result
    throw IllegalStateException("Rust bridge response missing result payload")
  }
}
