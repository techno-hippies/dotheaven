package com.pirate.app.onboarding

import android.content.Context
import android.util.Log
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.lit.LitRust
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.crypto.ECDSASignature
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign
import java.math.BigInteger

/**
 * Lit Action wrappers for onboarding steps. Each function calls executeJsRaw
 * with the correct IPFS CID and jsParams, mirroring the SolidJS frontend.
 */
object OnboardingLitActions {
  private const val TAG = "OnboardingLitActions"

  // CIDs — keep in sync with lit-actions/cids/*.json and action-cids.ts
  private const val CLAIM_NAME_CID_NAGA_DEV = "QmQB5GsQVaNbD8QS8zcXkjBMAZUjpADfbcWVaPgL3PygSA"
  private const val CLAIM_NAME_CID_NAGA_TEST = "QmXqTv35a4fV4szqEDwA6wWH4bZHgceemRniLaYTrEcU6z"

  private const val SET_PROFILE_CID_NAGA_DEV = "QmeW8t23rUs2aahBGgMJprt4dsBG1oEozTRd4H7tyu4Vcc"
  private const val SET_PROFILE_CID_NAGA_TEST = "QmeW8t23rUs2aahBGgMJprt4dsBG1oEozTRd4H7tyu4Vcc"

  private const val SET_RECORDS_CID_NAGA_DEV = "QmaXJcjGbPWQ1ypKnQB3vfnDwaQ1NLEGFmN3t7gQisw9g5"
  private const val SET_RECORDS_CID_NAGA_TEST = "QmYdvepsZD3XGis7n3qCKEGHU559qeszxqD8DGgbXTPN2n"

  private const val AVATAR_UPLOAD_CID_NAGA_DEV = "QmTWwoC5zX2pUuSExsra5RVzChE9nCYRAkVVgppjvc196A"
  private const val AVATAR_UPLOAD_CID_NAGA_TEST = "QmTWwoC5zX2pUuSExsra5RVzChE9nCYRAkVVgppjvc196A"

  private fun claimNameCid(net: String) = if (net.trim().lowercase() == "naga-test") CLAIM_NAME_CID_NAGA_TEST else CLAIM_NAME_CID_NAGA_DEV
  private fun setProfileCid(net: String) = if (net.trim().lowercase() == "naga-test") SET_PROFILE_CID_NAGA_TEST else SET_PROFILE_CID_NAGA_DEV
  private fun setRecordsCid(net: String) = if (net.trim().lowercase() == "naga-test") SET_RECORDS_CID_NAGA_TEST else SET_RECORDS_CID_NAGA_DEV
  private fun avatarUploadCid(net: String) = if (net.trim().lowercase() == "naga-test") AVATAR_UPLOAD_CID_NAGA_TEST else AVATAR_UPLOAD_CID_NAGA_DEV

  // secp256k1 constants for low-s enforcement
  private val SECP256K1_N = BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16)
  private val SECP256K1_HALF_N = SECP256K1_N.shiftRight(1)

  // ── Name Registration ─────────────────────────────────────────────

  data class RegisterResult(
    val success: Boolean,
    val txHash: String? = null,
    val tokenId: String? = null,
    val node: String? = null,
    val label: String? = null,
    val error: String? = null,
  )

  /**
   * Register a .heaven name via Lit Action. Pre-signs EIP-191 message, then
   * the sponsor PKP broadcasts registerFor() on RegistryV1.
   */
  suspend fun registerHeavenName(
    appContext: Context,
    label: String,
    recipientAddress: String,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): RegisterResult = withContext(Dispatchers.IO) {
    val timestamp = System.currentTimeMillis()
    val nonce = (Math.random() * 1_000_000_000).toLong()

    // Must use EIP-55 checksummed address — the Lit Action uses ethers.utils.getAddress()
    val checksummedAddr = toChecksumAddress(recipientAddress)

    // Pre-sign EIP-191 message (must match the message the Lit Action will reconstruct)
    val message = "heaven:register:$label:$checksummedAddr:$timestamp:$nonce"
    val signature = pkpSignMessage(appContext, message, pkpPublicKey, recipientAddress, litNetwork, litRpcUrl)

    val jsParams = JSONObject()
      .put("recipient", checksummedAddr)
      .put("label", label)
      .put("userPkpPublicKey", pkpPublicKey)
      .put("timestamp", timestamp)
      .put("nonce", nonce)
      .put("signature", signature)

    // Retry logic (up to 4 attempts)
    var lastError = "Claim action failed"
    for (attempt in 1..4) {
      try {
        val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
          LitRust.executeJsRaw(
            network = litNetwork,
            rpcUrl = litRpcUrl,
            ipfsId = claimNameCid(litNetwork),
            jsParamsJson = jsParams.toString(),
          )
        }
        val exec = LitRust.unwrapEnvelope(raw)
        val response = parseResponse(exec)
        val ok = response.optBoolean("success", false)
        if (ok) {
          return@withContext RegisterResult(
            success = true,
            txHash = response.optString("txHash", "").ifBlank { null },
            tokenId = response.optString("tokenId", "").ifBlank { null },
            node = response.optString("node", "").ifBlank { null },
            label = response.optString("label", "").ifBlank { label },
          )
        }
        lastError = response.optString("error", "Unknown claim error")
        if (isRetryable(lastError) && attempt < 4) {
          delay(400L * attempt)
          continue
        }
        return@withContext RegisterResult(success = false, error = lastError)
      } catch (e: Exception) {
        lastError = e.message ?: "Unknown error"
        Log.w(TAG, "registerHeavenName attempt $attempt failed: $lastError")
        if (isRetryable(lastError) && attempt < 4) {
          delay(400L * attempt)
          continue
        }
        return@withContext RegisterResult(success = false, error = lastError)
      }
    }
    RegisterResult(success = false, error = lastError)
  }

  // ── Profile ───────────────────────────────────────────────────────

  data class ProfileResult(
    val success: Boolean,
    val txHash: String? = null,
    val error: String? = null,
  )

  /**
   * Set profile data on ProfileV2 via Lit Action.
   * profileInput is a JSON object matching the Solidity struct fields.
   */
  suspend fun setProfile(
    appContext: Context,
    userAddress: String,
    profileInput: JSONObject,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): ProfileResult = withContext(Dispatchers.IO) {
    val nonce = OnboardingRpcHelpers.fetchProfileNonce(userAddress)

    val jsParams = JSONObject()
      .put("user", userAddress)
      .put("userPkpPublicKey", pkpPublicKey)
      .put("profileInput", profileInput)
      .put("nonce", nonce.toInt())

    try {
      val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
        LitRust.executeJsRaw(
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = setProfileCid(litNetwork),
          jsParamsJson = jsParams.toString(),
        )
      }
      val exec = LitRust.unwrapEnvelope(raw)
      val response = parseResponse(exec)
      ProfileResult(
        success = response.optBoolean("success", false),
        txHash = response.optString("txHash", "").ifBlank { null },
        error = response.optString("error", "").ifBlank { null },
      )
    } catch (e: Exception) {
      ProfileResult(success = false, error = e.message)
    }
  }

  // ── Text Records ──────────────────────────────────────────────────

  data class RecordResult(
    val success: Boolean,
    val txHash: String? = null,
    val error: String? = null,
  )

  /** Set a single text record on RecordsV1 via Lit Action. */
  suspend fun setTextRecord(
    appContext: Context,
    node: String,
    key: String,
    value: String,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): RecordResult = withContext(Dispatchers.IO) {
    val nonce = OnboardingRpcHelpers.fetchRecordNonce(node)

    val jsParams = JSONObject()
      .put("node", node)
      .put("userPkpPublicKey", pkpPublicKey)
      .put("nonce", nonce.toInt())
      .put("key", key)
      .put("value", value)

    try {
      val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
        LitRust.executeJsRaw(
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = setRecordsCid(litNetwork),
          jsParamsJson = jsParams.toString(),
        )
      }
      val exec = LitRust.unwrapEnvelope(raw)
      val response = parseResponse(exec)
      RecordResult(
        success = response.optBoolean("success", false),
        txHash = response.optString("txHash", "").ifBlank { null },
        error = response.optString("error", "").ifBlank { null },
      )
    } catch (e: Exception) {
      RecordResult(success = false, error = e.message)
    }
  }

  /** Set multiple text records on RecordsV1 via Lit Action (batch). */
  suspend fun setTextRecords(
    appContext: Context,
    node: String,
    keys: List<String>,
    values: List<String>,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): RecordResult = withContext(Dispatchers.IO) {
    val nonce = OnboardingRpcHelpers.fetchRecordNonce(node)

    val jsParams = JSONObject()
      .put("node", node)
      .put("userPkpPublicKey", pkpPublicKey)
      .put("nonce", nonce.toInt())
      .put("keys", JSONArray(keys))
      .put("values", JSONArray(values))

    try {
      val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
        LitRust.executeJsRaw(
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = setRecordsCid(litNetwork),
          jsParamsJson = jsParams.toString(),
        )
      }
      val exec = LitRust.unwrapEnvelope(raw)
      val response = parseResponse(exec)
      RecordResult(
        success = response.optBoolean("success", false),
        txHash = response.optString("txHash", "").ifBlank { null },
        error = response.optString("error", "").ifBlank { null },
      )
    } catch (e: Exception) {
      RecordResult(success = false, error = e.message)
    }
  }

  // ── Avatar Upload ─────────────────────────────────────────────────

  data class AvatarResult(
    val success: Boolean,
    val avatarCID: String? = null,
    val error: String? = null,
  )

  /** Encrypted Filebase key — only decryptable by the avatar upload Lit Action CID */
  private fun filebaseEncryptedKey(litNetwork: String): JSONObject {
    val cid = avatarUploadCid(litNetwork)
    return JSONObject()
      .put("ciphertext", "uPCvvNTzGAf2924hvE8+0W7DNjZQNkUlye+zQWkOfK4YpShWfw+Pwx8+0zGAIM4Amvu68nUz/+Ie65Wk9hsDQq8L61O0qbLfdyr8Nx2nR+BlgMlneDO7uL92s7o3422JmH8v22Nazy+jCXDNNyzNFIEUvQ7FeLmlC2cVPGosKhZeA1EWX3Mdropmss6s4IZM3qjw+mYRXYHbzMOzek7gpsrUFJ1ilNnXKwUPcKFzDJ5aoUQw7oQC")
      .put("dataToEncryptHash", "23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4")
      .put("accessControlConditions", JSONArray().put(
        JSONObject()
          .put("conditionType", "evmBasic")
          .put("contractAddress", "")
          .put("standardContractType", "")
          .put("chain", "ethereum")
          .put("method", "")
          .put("parameters", JSONArray().put(":currentActionIpfsId"))
          .put("returnValueTest", JSONObject()
            .put("comparator", "=")
            .put("value", cid)
          )
      ))
  }

  /** Encrypted OpenRouter key — only decryptable by the avatar upload Lit Action CID */
  private fun openrouterEncryptedKey(litNetwork: String): JSONObject {
    val cid = avatarUploadCid(litNetwork)
    return JSONObject()
      .put("ciphertext", "ohXZVCRGljiCLwqlq7SOsCS29E1X0GR8PlAwmtAzoZOUQ3YQYaNT0vT+OXmAYduQyKfcVQeptpog4O2cw53iCOI72Eb7mu6cG0WuqZgXxzVKC7Mc/UKOV7DzQtvjy9RcW+UpSheW626Q+RlLqyNY0uIyeR6EWywjYrpc9n59GZ6I8JLkR5geeit02OxZE9LeCIQdHlvnLj92QSEC")
      .put("dataToEncryptHash", "2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092")
      .put("accessControlConditions", JSONArray().put(
        JSONObject()
          .put("conditionType", "evmBasic")
          .put("contractAddress", "")
          .put("standardContractType", "")
          .put("chain", "ethereum")
          .put("method", "")
          .put("parameters", JSONArray().put(":currentActionIpfsId"))
          .put("returnValueTest", JSONObject()
            .put("comparator", "=")
            .put("value", cid)
          )
      ))
  }

  /**
   * Upload avatar to IPFS via Lit Action with style check.
   * imageBase64 should be a base64-encoded JPEG (pre-resized to ≤512px).
   */
  suspend fun uploadAvatar(
    appContext: Context,
    imageBase64: String,
    contentType: String,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
    skipStyleCheck: Boolean = false,
  ): AvatarResult = withContext(Dispatchers.IO) {
    val timestamp = System.currentTimeMillis()
    val nonce = (Math.random() * 1_000_000_000).toLong()

    val jsParams = JSONObject()
      .put("userPkpPublicKey", pkpPublicKey)
      .put("imageUrl", JSONObject()
        .put("base64", imageBase64)
        .put("contentType", contentType)
      )
      .put("timestamp", timestamp)
      .put("nonce", nonce)
      .put("skipStyleCheck", skipStyleCheck)
      .put("filebaseEncryptedKey", filebaseEncryptedKey(litNetwork))
    if (!skipStyleCheck) {
      jsParams.put("openrouterEncryptedKey", openrouterEncryptedKey(litNetwork))
    }

    try {
      val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
        LitRust.executeJsRaw(
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = avatarUploadCid(litNetwork),
          jsParamsJson = jsParams.toString(),
        )
      }
      val exec = LitRust.unwrapEnvelope(raw)
      val response = parseResponse(exec)
      AvatarResult(
        success = response.optBoolean("success", false),
        avatarCID = response.optString("avatarCID", "").ifBlank { null },
        error = response.optString("error", "").ifBlank { null },
      )
    } catch (e: Exception) {
      AvatarResult(success = false, error = e.message)
    }
  }

  // ── EIP-191 PKP signing ───────────────────────────────────────────

  /**
   * Sign a message with the user's PKP via inline Lit Action (EIP-191 personal sign).
   * Returns 0x-prefixed 65-byte signature hex.
   */
  private suspend fun pkpSignMessage(
    appContext: Context,
    message: String,
    pkpPublicKey: String,
    expectedAddress: String,
    litNetwork: String,
    litRpcUrl: String,
  ): String {
    val prefix = "\u0019Ethereum Signed Message:\n${message.length}"
    val prefixedMessage = prefix.toByteArray(Charsets.UTF_8) + message.toByteArray(Charsets.UTF_8)
    val hash = OnboardingRpcHelpers.keccak256(prefixedMessage)

    val litActionCode = """
      (async () => {
        const toSign = new Uint8Array(jsParams.toSign);
        await Lit.Actions.signEcdsa({
          toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
      })();
    """.trimIndent()

    val toSignArray = JSONArray()
    for (b in hash) { toSignArray.put(b.toInt() and 0xff) }
    val jsParams = JSONObject()
      .put("toSign", toSignArray)
      .put("publicKey", pkpPublicKey)

    val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
      LitRust.executeJsRaw(
        network = litNetwork,
        rpcUrl = litRpcUrl,
        code = litActionCode,
        jsParamsJson = jsParams.toString(),
      )
    }
    val env = LitRust.unwrapEnvelope(raw)
    val sig = env.optJSONObject("signatures")?.optJSONObject("sig")
      ?: throw IllegalStateException("No signature returned from PKP")

    val strip0x = { v: String -> if (v.startsWith("0x")) v.drop(2) else v }
    val rHex = sig.optString("r", "").trim().trim('"').let(strip0x)
    val sHex = sig.optString("s", "").trim().trim('"').let(strip0x)
    val signatureHex = sig.optString("signature", "").trim().trim('"').let(strip0x)

    var r: ByteArray
    var s: ByteArray

    when {
      rHex.isNotBlank() && sHex.isNotBlank() -> {
        r = OnboardingRpcHelpers.hexToBytes(rHex.padStart(64, '0'))
        s = OnboardingRpcHelpers.hexToBytes(sHex.padStart(64, '0'))
      }
      signatureHex.length >= 128 -> {
        r = OnboardingRpcHelpers.hexToBytes(signatureHex.substring(0, 64))
        s = OnboardingRpcHelpers.hexToBytes(signatureHex.substring(64, 128))
      }
      else -> throw IllegalStateException("Unexpected Lit signature format: $sig")
    }

    // Low-s enforcement (EIP-2)
    val sInt = BigInteger(1, s)
    if (sInt > SECP256K1_HALF_N) {
      val canonicalS = SECP256K1_N.subtract(sInt)
      s = canonicalS.toByteArray().let { arr ->
        when {
          arr.size == 32 -> arr
          arr.size > 32 -> arr.copyOfRange(arr.size - 32, arr.size)
          else -> ByteArray(32 - arr.size) + arr
        }
      }
    }

    // Recovery: find v that matches expected address
    val recidAny = sig.opt("recid") ?: sig.opt("recovery_id") ?: sig.opt("recoveryId") ?: 0
    val recid = when (recidAny) {
      is Number -> recidAny.toInt()
      is String -> recidAny.trim().toIntOrNull() ?: 0
      else -> 0
    }
    val hintedV = (if (recid >= 27) recid - 27 else recid).takeIf { it in 0..3 }
    val expectedNo0x = expectedAddress.removePrefix("0x").lowercase()
    val candidates = buildList {
      if (hintedV != null) add(hintedV)
      addAll(listOf(0, 1, 2, 3).filterNot { it == hintedV })
    }

    val recoveredV = candidates.firstOrNull { v ->
      runCatching {
        val ecdsaSig = ECDSASignature(BigInteger(1, r), BigInteger(1, s))
        val pubKey = Sign.recoverFromSignature(v, ecdsaSig, hash) ?: return@runCatching false
        Keys.getAddress(pubKey).lowercase() == expectedNo0x
      }.getOrDefault(false)
    } ?: throw IllegalStateException("Could not recover signer for $expectedAddress")

    val vByte = (27 + recoveredV).toByte()
    val sigBytes = ByteArray(65)
    System.arraycopy(r, 0, sigBytes, 0, 32)
    System.arraycopy(s, 0, sigBytes, 32, 32)
    sigBytes[64] = vByte
    return "0x" + sigBytes.joinToString("") { "%02x".format(it) }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private fun parseResponse(exec: JSONObject): JSONObject {
    val responseAny = exec.opt("response")
    return when (responseAny) {
      is JSONObject -> responseAny
      is String ->
        runCatching { JSONObject(responseAny) }
          .getOrElse { JSONObject().put("success", false).put("error", responseAny) }
      else -> JSONObject().put("success", false).put("error", "missing response")
    }
  }

  /** EIP-55 checksum an Ethereum address */
  private fun toChecksumAddress(address: String): String {
    val addr = address.removePrefix("0x").removePrefix("0X").lowercase()
    val hash = OnboardingRpcHelpers.bytesToHex(OnboardingRpcHelpers.keccak256(addr.toByteArray(Charsets.UTF_8)))
    val checksummed = StringBuilder("0x")
    for (i in addr.indices) {
      val c = addr[i]
      if (c in '0'..'9') {
        checksummed.append(c)
      } else {
        // If the corresponding hex digit in the hash is >= 8, uppercase
        val hashDigit = hash[i].digitToInt(16)
        checksummed.append(if (hashDigit >= 8) c.uppercaseChar() else c)
      }
    }
    return checksummed.toString()
  }

  private fun isRetryable(message: String): Boolean {
    val msg = message.lowercase()
    return msg.contains("nodesystemfault") ||
      msg.contains("nodeunknownerror") ||
      msg.contains("ecdsa signing failed") ||
      msg.contains("500") ||
      msg.contains("internal server error") ||
      msg.contains("timed out") ||
      msg.contains("request timeout")
  }
}
