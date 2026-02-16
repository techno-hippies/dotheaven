package com.pirate.app.scarlett

import android.util.Log
import com.pirate.app.lit.LitRust
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.crypto.ECDSASignature
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign
import java.math.BigInteger
import java.util.concurrent.TimeUnit

private const val TAG = "WorkerAuth"
private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

// secp256k1 curve order and half (for low-s normalization)
private val SECP256K1_N = BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16)
private val SECP256K1_HALF_N = SECP256K1_N.shiftRight(1)

private data class CachedToken(
  val token: String,
  val wallet: String,
  val workerUrl: String,
  val expiresAt: Long,
)

private val tokenCache = HashMap<String, CachedToken>()

private val httpClient = OkHttpClient.Builder()
  .connectTimeout(15, TimeUnit.SECONDS)
  .readTimeout(20, TimeUnit.SECONDS)
  .build()

/**
 * Get a JWT token for the given worker URL, caching for 55 minutes.
 * Uses PKP signing via Lit Actions for the nonce challenge.
 */
suspend fun getWorkerToken(
  workerUrl: String,
  wallet: String,
  pkpPublicKey: String,
  litNetwork: String,
  litRpcUrl: String,
): String {
  val walletLower = wallet.lowercase()
  val key = "$workerUrl|$walletLower"
  val now = System.currentTimeMillis()

  tokenCache[key]?.let { cached ->
    if (cached.expiresAt > now + 60_000) return cached.token
  }

  Log.d(TAG, "Authenticating with worker $workerUrl...")

  // Step 1: Get nonce
  val nonceBody = JSONObject().put("wallet", walletLower).toString()
    .toRequestBody(JSON_MEDIA_TYPE)
  val nonceReq = Request.Builder()
    .url("${workerUrl.trimEnd('/')}/auth/nonce")
    .post(nonceBody)
    .build()

  val nonce = withContext(Dispatchers.IO) {
    httpClient.newCall(nonceReq).execute().use { resp ->
      val body = resp.body?.string().orEmpty()
      if (!resp.isSuccessful) throw IllegalStateException("Failed to get nonce (${resp.code}): $body")
      JSONObject(body).getString("nonce")
    }
  }

  // Step 2: Sign the nonce with PKP
  val signature = pkpSignMessage(nonce, pkpPublicKey, walletLower, litNetwork, litRpcUrl)

  // Step 3: Verify signature, get JWT
  val verifyPayload = JSONObject()
    .put("wallet", walletLower)
    .put("signature", signature)
    .put("nonce", nonce)
    .toString()
    .toRequestBody(JSON_MEDIA_TYPE)
  val verifyReq = Request.Builder()
    .url("${workerUrl.trimEnd('/')}/auth/verify")
    .post(verifyPayload)
    .build()

  val token = withContext(Dispatchers.IO) {
    httpClient.newCall(verifyReq).execute().use { resp ->
      val body = resp.body?.string().orEmpty()
      if (!resp.isSuccessful) throw IllegalStateException("Auth verify failed (${resp.code}): $body")
      JSONObject(body).getString("token")
    }
  }

  tokenCache[key] = CachedToken(token, walletLower, workerUrl, now + 55 * 60 * 1000)
  Log.d(TAG, "Authenticated successfully")
  return token
}

fun clearWorkerAuthCache() {
  tokenCache.clear()
}

/**
 * Sign a message using PKP via Lit Action (EIP-191 personal sign).
 * Returns the signature as a 0x-prefixed hex string.
 */
private suspend fun pkpSignMessage(
  message: String,
  pkpPublicKey: String,
  expectedAddress: String,
  litNetwork: String,
  litRpcUrl: String,
): String = withContext(Dispatchers.IO) {
  // Hash the message: keccak256("\x19Ethereum Signed Message:\n" + len + message)
  val prefix = "\u0019Ethereum Signed Message:\n${message.length}"
  val prefixedMessage = prefix.toByteArray(Charsets.UTF_8) + message.toByteArray(Charsets.UTF_8)
  val hash = keccak256(prefixedMessage)

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

  val raw = LitRust.executeJsRaw(
    network = litNetwork,
    rpcUrl = litRpcUrl,
    code = litActionCode,
    ipfsId = "",
    jsParamsJson = jsParams.toString(),
    useSingleNode = false,
  )
  val env = LitRust.unwrapEnvelope(raw)
  val sig = env.optJSONObject("signatures")?.optJSONObject("sig")
    ?: throw IllegalStateException("No signature returned from PKP")

  val strip0x = { v: String -> if (v.startsWith("0x")) v.drop(2) else v }

  // Parse r, s from either format
  val rHex = sig.optString("r", "").trim().trim('"').let(strip0x)
  val sHex = sig.optString("s", "").trim().trim('"').let(strip0x)
  val signatureHex = sig.optString("signature", "").trim().trim('"').let(strip0x)

  var r: ByteArray
  var s: ByteArray

  when {
    rHex.isNotBlank() && sHex.isNotBlank() -> {
      r = hexToBytes(rHex.padStart(64, '0'))
      s = hexToBytes(sHex.padStart(64, '0'))
    }
    signatureHex.length >= 128 -> {
      r = hexToBytes(signatureHex.substring(0, 64))
      s = hexToBytes(signatureHex.substring(64, 128))
    }
    else -> throw IllegalStateException("Unexpected Lit signature format")
  }

  // Enforce low-s (EIP-2)
  val sInt = BigInteger(1, s)
  if (sInt > SECP256K1_HALF_N) {
    val canonicalS = SECP256K1_N.subtract(sInt)
    s = bigIntTo32Bytes(canonicalS)
  }

  // Parse recovery hint
  val recidAny = sig.opt("recid") ?: sig.opt("recovery_id") ?: sig.opt("recoveryId") ?: 0
  val recid = when (recidAny) {
    is Number -> recidAny.toInt()
    is String -> recidAny.trim().toIntOrNull() ?: 0
    else -> 0
  }
  val hintedV = (if (recid >= 27) recid - 27 else recid).takeIf { it in 0..3 }

  // Try all recovery IDs to find the one that matches
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

  // Return 0x-prefixed r + s + v hex (v = 27 + recoveryId for EIP-191)
  val vByte = (27 + recoveredV).toByte()
  val sigBytes = ByteArray(65)
  System.arraycopy(r, 0, sigBytes, 0, 32)
  System.arraycopy(s, 0, sigBytes, 32, 32)
  sigBytes[64] = vByte
  "0x" + sigBytes.joinToString("") { "%02x".format(it) }
}

private fun keccak256(input: ByteArray): ByteArray {
  val digest = org.bouncycastle.jcajce.provider.digest.Keccak.Digest256()
  return digest.digest(input)
}

private fun hexToBytes(hex: String): ByteArray {
  val clean = hex.lowercase()
  val out = ByteArray(clean.length / 2)
  for (i in out.indices) {
    val hi = clean[2 * i].digitToInt(16)
    val lo = clean[2 * i + 1].digitToInt(16)
    out[i] = ((hi shl 4) or lo).toByte()
  }
  return out
}

private fun bigIntTo32Bytes(value: BigInteger): ByteArray {
  val raw = value.toByteArray()
  val normalized = if (raw.size == 33 && raw[0] == 0.toByte()) raw.copyOfRange(1, 33) else raw
  require(normalized.size <= 32) { "Value does not fit in 32 bytes" }
  val out = ByteArray(32)
  System.arraycopy(normalized, 0, out, 32 - normalized.size, normalized.size)
  return out
}
