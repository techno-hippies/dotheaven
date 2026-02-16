package com.pirate.app.profile

import android.content.Context
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.lit.LitRust
import com.pirate.app.onboarding.OnboardingRpcHelpers
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.web3j.crypto.ECDSASignature
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign
import java.math.BigInteger
import java.util.UUID

data class FollowActionResult(
  val success: Boolean,
  val action: String,
  val txHash: String? = null,
  val error: String? = null,
)

object FollowLitAction {
  private const val FOLLOW_V1_CID_NAGA_DEV = "QmUxWxazesrDvsFF4gDk2mbT8L8dbHrWVQUKAnwRYm8yyU"
  private const val FOLLOW_V1_CID_NAGA_TEST = ""

  private val SECP256K1_N = BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16)
  private val SECP256K1_HALF_N = SECP256K1_N.shiftRight(1)

  suspend fun toggleFollow(
    appContext: Context,
    targetAddress: String,
    action: String,
    userPkpPublicKey: String,
    userEthAddress: String,
    litNetwork: String,
    litRpcUrl: String,
  ): FollowActionResult = withContext(Dispatchers.IO) {
    val normalizedAction = action.trim().lowercase()
    if (normalizedAction != "follow" && normalizedAction != "unfollow") {
      return@withContext FollowActionResult(
        success = false,
        action = normalizedAction.ifBlank { action },
        error = "action must be follow or unfollow",
      )
    }

    val checksumTarget = toChecksumAddress(targetAddress)
    val timestamp = System.currentTimeMillis()
    val nonce = UUID.randomUUID().toString()
    val message = "heaven:follow:$checksumTarget:$normalizedAction:$timestamp:$nonce"
    val signature = pkpSignMessage(
      appContext = appContext,
      message = message,
      pkpPublicKey = userPkpPublicKey,
      expectedAddress = userEthAddress,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
    )

    val jsParams = JSONObject()
      .put("userPkpPublicKey", userPkpPublicKey)
      .put("targetAddress", checksumTarget)
      .put("action", normalizedAction)
      .put("signature", signature)
      .put("timestamp", timestamp)
      .put("nonce", nonce)

    return@withContext try {
      val raw = LitAuthContextManager.runWithSavedStateRecovery(appContext) {
        LitRust.executeJsRaw(
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = followCidForNetwork(litNetwork),
          jsParamsJson = jsParams.toString(),
        )
      }
      val exec = LitRust.unwrapEnvelope(raw)
      val response = parseResponse(exec)
      FollowActionResult(
        success = response.optBoolean("success", false),
        action = response.optString("action", normalizedAction).ifBlank { normalizedAction },
        txHash = response.optString("txHash", "").ifBlank { null },
        error = response.optString("error", "").ifBlank { null },
      )
    } catch (error: Throwable) {
      FollowActionResult(
        success = false,
        action = normalizedAction,
        error = error.message ?: "Follow action failed",
      )
    }
  }

  private fun followCidForNetwork(litNetwork: String): String {
    val cid = if (litNetwork.trim().lowercase() == "naga-test") FOLLOW_V1_CID_NAGA_TEST else FOLLOW_V1_CID_NAGA_DEV
    if (cid.isBlank()) throw IllegalStateException("FOLLOW_V1 CID not configured for network $litNetwork")
    return cid
  }

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

    val litActionCode =
      """
      (async () => {
        const toSign = new Uint8Array(jsParams.toSign);
        await Lit.Actions.signEcdsa({
          toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
      })();
      """.trimIndent()

    val toSign = org.json.JSONArray()
    for (b in hash) toSign.put(b.toInt() and 0xff)

    val jsParams = JSONObject()
      .put("toSign", toSign)
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

    val strip0x = { value: String -> if (value.startsWith("0x")) value.drop(2) else value }
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
      else -> throw IllegalStateException("Unexpected Lit signature format")
    }

    val sInt = BigInteger(1, s)
    if (sInt > SECP256K1_HALF_N) {
      val canonicalS = SECP256K1_N.subtract(sInt)
      s = canonicalS.toByteArray().let { bytes ->
        when {
          bytes.size == 32 -> bytes
          bytes.size > 32 -> bytes.copyOfRange(bytes.size - 32, bytes.size)
          else -> ByteArray(32 - bytes.size) + bytes
        }
      }
    }

    val recidAny = sig.opt("recid") ?: sig.opt("recovery_id") ?: sig.opt("recoveryId") ?: 0
    val recid =
      when (recidAny) {
        is Number -> recidAny.toInt()
        is String -> recidAny.trim().toIntOrNull() ?: 0
        else -> 0
      }
    val hintedV = (if (recid >= 27) recid - 27 else recid).takeIf { it in 0..3 }
    val expectedNo0x = expectedAddress.removePrefix("0x").removePrefix("0X").lowercase()
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
    } ?: throw IllegalStateException("Could not recover signer for expected address")

    val sigBytes = ByteArray(65)
    System.arraycopy(r, 0, sigBytes, 0, 32)
    System.arraycopy(s, 0, sigBytes, 32, 32)
    sigBytes[64] = (27 + recoveredV).toByte()
    return "0x" + sigBytes.joinToString("") { "%02x".format(it) }
  }

  private fun parseResponse(exec: JSONObject): JSONObject {
    val responseAny = exec.opt("response")
    return when (responseAny) {
      is JSONObject -> responseAny
      is String -> runCatching { JSONObject(responseAny) }
        .getOrElse { JSONObject().put("success", false).put("error", responseAny) }
      else -> JSONObject().put("success", false).put("error", "missing response")
    }
  }

  private fun toChecksumAddress(address: String): String {
    val addr = address.removePrefix("0x").removePrefix("0X").lowercase()
    val hash = OnboardingRpcHelpers.bytesToHex(OnboardingRpcHelpers.keccak256(addr.toByteArray(Charsets.UTF_8)))
    val checksummed = StringBuilder("0x")
    for (i in addr.indices) {
      val c = addr[i]
      if (c in '0'..'9') {
        checksummed.append(c)
      } else {
        val hashDigit = hash[i].digitToInt(16)
        checksummed.append(if (hashDigit >= 8) c.uppercaseChar() else c)
      }
    }
    return checksummed.toString()
  }
}
