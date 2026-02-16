package com.pirate.app.onboarding

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.bouncycastle.jcajce.provider.digest.Keccak
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger

/**
 * RPC helpers for onboarding: name availability, nonces, node computation.
 * Talks to MegaETH testnet directly via eth_call.
 */
object OnboardingRpcHelpers {
  private const val RPC_URL = "https://carrot.megaeth.com/rpc"
  private const val REGISTRY_V1 = "0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2"
  private const val RECORDS_V1 = "0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3"
  private const val PROFILE_V2 = "0xe00e82086480E61AaC8d5ad8B05B56A582dD0000"

  /** HEAVEN_NODE = namehash("heaven.hnsbridge.eth") */
  private const val HEAVEN_NODE = "0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27"

  private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
  private val http = OkHttpClient()

  // ── Node computation ──────────────────────────────────────────────

  /** Compute the namehash node for a .heaven label: keccak256(abi.encodePacked(HEAVEN_NODE, keccak256(label))) */
  fun computeNode(label: String): String {
    val labelHash = keccak256(label.lowercase().toByteArray(Charsets.UTF_8))
    // abi.encodePacked(bytes32, bytes32) = just concatenate
    val parentBytes = hexToBytes(HEAVEN_NODE.removePrefix("0x"))
    val packed = parentBytes + labelHash
    val node = keccak256(packed)
    return "0x" + bytesToHex(node)
  }

  // ── Name availability ─────────────────────────────────────────────

  /** Check if a .heaven name is available (not yet registered). Returns true if available. */
  suspend fun checkNameAvailable(label: String): Boolean = withContext(Dispatchers.IO) {
    val node = computeNode(label)
    // ownerOf(uint256(node)) — if it reverts, name is available
    // We use a simpler approach: call exists(node) or try ownerOf
    // RegistryV1 is ERC-721 — ownerOf reverts if token doesn't exist
    val tokenId = node.removePrefix("0x").padStart(64, '0')
    // ownerOf(uint256) selector = 0x6352211e
    val data = "0x6352211e$tokenId"
    try {
      ethCall(REGISTRY_V1, data)
      // If it returns without error, the name is taken
      false
    } catch (_: Exception) {
      // Revert means token doesn't exist — name is available
      true
    }
  }

  // ── Nonce queries ─────────────────────────────────────────────────

  /** Fetch the profile nonce for a user address from ProfileV2.nonces(address) */
  suspend fun fetchProfileNonce(userAddress: String): String = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase().removePrefix("0x").padStart(64, '0')
    // nonces(address) selector = 0x7ecebe00
    val data = "0x7ecebe00$addr"
    val result = ethCall(PROFILE_V2, data)
    BigInteger(result.removePrefix("0x").ifBlank { "0" }, 16).toString(10)
  }

  /** Fetch the record nonce for a node from RecordsV1.nonces(bytes32) */
  suspend fun fetchRecordNonce(node: String): String = withContext(Dispatchers.IO) {
    val nodeHex = node.removePrefix("0x").padStart(64, '0')
    // nonces(bytes32) selector = 0x27e235e3 — actually need the right selector
    // RecordsV1.nonces is mapping(bytes32 => uint256), selector depends on function sig
    // keccak256("nonces(bytes32)") = first 4 bytes
    val selector = functionSelector("nonces(bytes32)")
    val data = "0x$selector$nodeHex"
    val result = ethCall(RECORDS_V1, data)
    BigInteger(result.removePrefix("0x").ifBlank { "0" }, 16).toString(10)
  }

  /** Get primary name for an address from RegistryV1.primaryName(address) → (string label, bytes32 parentNode) */
  suspend fun getPrimaryName(userAddress: String): String? = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase().removePrefix("0x").padStart(64, '0')
    // primaryName(address) selector
    val selector = functionSelector("primaryName(address)")
    val data = "0x$selector$addr"
    try {
      val result = ethCall(REGISTRY_V1, data)
      val hex = result.removePrefix("0x")
      if (hex.length < 128) return@withContext null
      // Decode ABI: (string, bytes32) — string is dynamic
      // offset to string data is first 32 bytes
      val stringOffset = BigInteger(hex.substring(0, 64), 16).toInt() * 2
      if (stringOffset + 64 > hex.length) return@withContext null
      val stringLen = BigInteger(hex.substring(stringOffset, stringOffset + 64), 16).toInt()
      if (stringLen == 0) return@withContext null
      val stringHex = hex.substring(stringOffset + 64, stringOffset + 64 + stringLen * 2)
      val label = String(hexToBytes(stringHex), Charsets.UTF_8)
      label.ifBlank { null }
    } catch (_: Exception) {
      null
    }
  }

  /** Check if a profile exists for the given address (age > 0 as heuristic) */
  suspend fun hasProfile(userAddress: String): Boolean = withContext(Dispatchers.IO) {
    // profiles(address) → Profile struct. If age field is non-zero, profile exists.
    val addr = userAddress.trim().lowercase().removePrefix("0x").padStart(64, '0')
    val selector = functionSelector("profiles(address)")
    val data = "0x$selector$addr"
    try {
      val result = ethCall(PROFILE_V2, data)
      val hex = result.removePrefix("0x")
      // The Profile struct is large. The age field is the 3rd field (index 2),
      // each field is 32 bytes → bytes 64..96
      if (hex.length < 96) return@withContext false
      val ageHex = hex.substring(64, 96)
      BigInteger(ageHex, 16).toInt() > 0
    } catch (_: Exception) {
      false
    }
  }

  /** Check if an avatar text record exists for a node */
  suspend fun hasAvatar(node: String): Boolean = withContext(Dispatchers.IO) {
    val nodeHex = node.removePrefix("0x").padStart(64, '0')
    // text(bytes32,string) — need to ABI-encode the call
    // For simplicity, encode manually: selector + node + offset + len + "avatar"
    val selector = functionSelector("text(bytes32,string)")
    val keyBytes = "avatar".toByteArray(Charsets.UTF_8)
    val keyHex = bytesToHex(keyBytes)
    // ABI: node (32 bytes) + offset to string (32 bytes) + string length (32 bytes) + string data (padded to 32)
    val offset = "0000000000000000000000000000000000000000000000000000000000000040" // 64
    val len = keyBytes.size.toString(16).padStart(64, '0')
    val paddedKey = keyHex.padEnd(64, '0')
    val data = "0x$selector$nodeHex$offset$len$paddedKey"
    try {
      val result = ethCall(RECORDS_V1, data)
      val hex = result.removePrefix("0x")
      // Returns a string — decode ABI string
      if (hex.length < 128) return@withContext false
      val stringOffset = BigInteger(hex.substring(0, 64), 16).toInt() * 2
      if (stringOffset + 64 > hex.length) return@withContext false
      val stringLen = BigInteger(hex.substring(stringOffset, stringOffset + 64), 16).toInt()
      stringLen > 0
    } catch (_: Exception) {
      false
    }
  }

  private const val FOLLOW_V1 = "0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb"

  /** Get a text record value for a node and key from RecordsV1 */
  suspend fun getTextRecord(node: String, key: String): String? = withContext(Dispatchers.IO) {
    val nodeHex = node.removePrefix("0x").padStart(64, '0')
    val selector = functionSelector("text(bytes32,string)")
    val keyBytes = key.toByteArray(Charsets.UTF_8)
    val keyHex = bytesToHex(keyBytes)
    val offset = "0000000000000000000000000000000000000000000000000000000000000040"
    val len = keyBytes.size.toString(16).padStart(64, '0')
    val paddedKey = keyHex.padEnd(((keyHex.length + 63) / 64) * 64, '0')
    val data = "0x$selector$nodeHex$offset$len$paddedKey"
    try {
      val result = ethCall(RECORDS_V1, data)
      val hex = result.removePrefix("0x")
      if (hex.length < 128) return@withContext null
      val stringOffset = BigInteger(hex.substring(0, 64), 16).toInt() * 2
      if (stringOffset + 64 > hex.length) return@withContext null
      val stringLen = BigInteger(hex.substring(stringOffset, stringOffset + 64), 16).toInt()
      if (stringLen == 0) return@withContext null
      val stringHex = hex.substring(stringOffset + 64, stringOffset + 64 + stringLen * 2)
      String(hexToBytes(stringHex), Charsets.UTF_8).ifBlank { null }
    } catch (_: Exception) {
      null
    }
  }

  /** Fetch follower and following counts for an address from FollowV1 */
  suspend fun getFollowCounts(userAddress: String): Pair<Int, Int> = withContext(Dispatchers.IO) {
    val addr = userAddress.trim().lowercase().removePrefix("0x").padStart(64, '0')
    val followerSel = functionSelector("followerCount(address)")
    val followingSel = functionSelector("followingCount(address)")
    val followers = try {
      val r = ethCall(FOLLOW_V1, "0x$followerSel$addr")
      BigInteger(r.removePrefix("0x").ifBlank { "0" }, 16).toInt()
    } catch (_: Exception) { 0 }
    val following = try {
      val r = ethCall(FOLLOW_V1, "0x$followingSel$addr")
      BigInteger(r.removePrefix("0x").ifBlank { "0" }, 16).toInt()
    } catch (_: Exception) { 0 }
    followers to following
  }

  /** Check if viewer currently follows target on FollowV1 */
  suspend fun getFollowState(viewerAddress: String, targetAddress: String): Boolean = withContext(Dispatchers.IO) {
    val viewer = viewerAddress.trim().lowercase().removePrefix("0x").padStart(64, '0')
    val target = targetAddress.trim().lowercase().removePrefix("0x").padStart(64, '0')
    val followsSel = functionSelector("follows(address,address)")
    try {
      val r = ethCall(FOLLOW_V1, "0x$followsSel$viewer$target")
      BigInteger(r.removePrefix("0x").ifBlank { "0" }, 16) != BigInteger.ZERO
    } catch (_: Exception) {
      false
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private fun ethCall(to: String, data: String): String {
    val payload = JSONObject()
      .put("jsonrpc", "2.0")
      .put("id", 1)
      .put("method", "eth_call")
      .put("params", JSONArray()
        .put(JSONObject().put("to", to).put("data", data))
        .put("latest")
      )
    val req = Request.Builder()
      .url(RPC_URL)
      .post(payload.toString().toRequestBody(JSON_TYPE))
      .build()
    http.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("RPC failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      val err = json.optJSONObject("error")
      if (err != null) throw IllegalStateException(err.optString("message", err.toString()))
      return json.optString("result", "0x")
    }
  }

  private fun functionSelector(sig: String): String {
    val hash = keccak256(sig.toByteArray(Charsets.UTF_8))
    return bytesToHex(hash.copyOfRange(0, 4))
  }

  fun keccak256(input: ByteArray): ByteArray {
    val d = Keccak.Digest256()
    d.update(input, 0, input.size)
    return d.digest()
  }

  fun hexToBytes(hex: String): ByteArray {
    val clean = hex.removePrefix("0x").lowercase()
    require(clean.length % 2 == 0) { "hex length must be even" }
    val out = ByteArray(clean.length / 2)
    var i = 0
    while (i < clean.length) {
      out[i / 2] = ((clean[i].digitToInt(16) shl 4) or clean[i + 1].digitToInt(16)).toByte()
      i += 2
    }
    return out
  }

  fun bytesToHex(bytes: ByteArray): String {
    val sb = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      sb.append(((b.toInt() ushr 4) and 0x0f).toString(16))
      sb.append((b.toInt() and 0x0f).toString(16))
    }
    return sb.toString()
  }
}
