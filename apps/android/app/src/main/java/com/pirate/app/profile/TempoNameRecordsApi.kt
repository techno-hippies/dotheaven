package com.pirate.app.profile

import androidx.fragment.app.FragmentActivity
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.bouncycastle.jcajce.provider.digest.Keccak
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.datatypes.Address
import org.web3j.abi.datatypes.DynamicArray
import org.web3j.abi.datatypes.DynamicBytes
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32

data class TempoRecordsWriteResult(
  val success: Boolean,
  val txHash: String? = null,
  val error: String? = null,
)

data class TempoPrimaryName(
  val label: String,
  val parentNode: String,
  val tld: String?,
  val fullName: String,
)

object TempoNameRecordsApi {
  const val REGISTRY_V1 = "0x29e1a73fC364855F073995075785e3fC2a1b6edC"
  const val RECORDS_V1 = "0x6072C4337e57538AE896C03317f02d830A25bbe4"

  /** HEAVEN_NODE = namehash("heaven.hnsbridge.eth") */
  const val HEAVEN_NODE = "0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27"
  /** PIRATE_NODE = namehash("pirate.hnsbridge.eth") */
  const val PIRATE_NODE = "0xace9c9c435cf933be3564cdbcf7b7e2faee63e4f39034849eacb82d13f32f02a"

  private const val TLD_HEAVEN = "heaven"
  private const val TLD_PIRATE = "pirate"
  private const val ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  private const val GAS_LIMIT_SET_TEXT = 420_000L
  private const val GAS_LIMIT_SET_RECORDS = 700_000L

  private val jsonType = "application/json; charset=utf-8".toMediaType()
  private val client = OkHttpClient()
  private val parentNodeByTld =
    mapOf(
      TLD_HEAVEN to HEAVEN_NODE,
      TLD_PIRATE to PIRATE_NODE,
    )
  private val tldByParentNode =
    parentNodeByTld.entries.associate { (tld, node) ->
      node.removePrefix("0x").lowercase() to tld
    }

  fun supportedTlds(): List<String> = parentNodeByTld.keys.toList()

  fun parentNodeForTld(tld: String): String? = parentNodeByTld[tld.trim().lowercase()]

  fun computeNode(nameOrLabel: String): String {
    val parsed = parseName(nameOrLabel)
    val labelHash = keccak256(parsed.label.toByteArray(Charsets.UTF_8))
    val parentBytes = hexToBytes(parsed.parentNode.removePrefix("0x"))
    val node = keccak256(parentBytes + labelHash)
    return "0x${bytesToHex(node)}"
  }

  fun formatName(label: String, parentNode: String): String {
    val cleanLabel = label.trim().lowercase()
    if (cleanLabel.isBlank()) return ""
    val parent = parentNode.removePrefix("0x").lowercase()
    val tld = tldByParentNode[parent]
    return if (tld.isNullOrBlank()) cleanLabel else "$cleanLabel.$tld"
  }

  suspend fun getPrimaryName(userAddress: String): String? = withContext(Dispatchers.IO) {
    getPrimaryNameDetails(userAddress)?.fullName
  }

  suspend fun getPrimaryNameDetails(userAddress: String): TempoPrimaryName? = withContext(Dispatchers.IO) {
    val addr = normalizeAddress(userAddress) ?: return@withContext null
    val data = "0x${functionSelector("primaryName(address)")}${addr.drop(2).padStart(64, '0')}"
    try {
      val result = ethCall(REGISTRY_V1, data)
      val hex = result.removePrefix("0x")
      if (hex.length < 128) return@withContext null

      val parentHex = hex.substring(64, 128)
      val parentNode = "0x$parentHex".lowercase()
      if (parentHex.all { it == '0' }) return@withContext null

      val stringOffset = hex.substring(0, 64).toBigIntegerOrNull(16)?.toInt() ?: return@withContext null
      val start = stringOffset * 2
      if (start + 64 > hex.length) return@withContext null
      val len = hex.substring(start, start + 64).toBigIntegerOrNull(16)?.toInt() ?: return@withContext null
      if (len == 0) return@withContext null
      val valueHex = hex.substring(start + 64, start + 64 + len * 2)
      val label = String(hexToBytes(valueHex), Charsets.UTF_8).trim().lowercase().ifBlank { return@withContext null }
      val tld = tldByParentNode[parentHex.lowercase()]
      val full = if (tld.isNullOrBlank()) label else "$label.$tld"
      TempoPrimaryName(
        label = label,
        parentNode = parentNode,
        tld = tld,
        fullName = full,
      )
    } catch (_: Throwable) {
      null
    }
  }

  suspend fun getTextRecord(node: String, key: String): String? = withContext(Dispatchers.IO) {
    val nodeHex = normalizeBytes32(node) ?: return@withContext null
    val keyBytes = key.toByteArray(Charsets.UTF_8)
    val keyHex = bytesToHex(keyBytes)
    val selector = functionSelector("text(bytes32,string)")
    val offset = "0000000000000000000000000000000000000000000000000000000000000040"
    val len = keyBytes.size.toString(16).padStart(64, '0')
    val paddedKey = keyHex.padEnd(((keyHex.length + 63) / 64) * 64, '0')
    val data = "0x$selector$nodeHex$offset$len$paddedKey"
    try {
      val result = ethCall(RECORDS_V1, data)
      val hex = result.removePrefix("0x")
      if (hex.length < 128) return@withContext null
      val stringOffset = hex.substring(0, 64).toBigIntegerOrNull(16)?.toInt() ?: return@withContext null
      val start = stringOffset * 2
      if (start + 64 > hex.length) return@withContext null
      val stringLen = hex.substring(start, start + 64).toBigIntegerOrNull(16)?.toInt() ?: return@withContext null
      if (stringLen == 0) return@withContext null
      val stringHex = hex.substring(start + 64, start + 64 + stringLen * 2)
      String(hexToBytes(stringHex), Charsets.UTF_8).ifBlank { null }
    } catch (_: Throwable) {
      null
    }
  }

  suspend fun setTextRecords(
    activity: FragmentActivity,
    account: TempoPasskeyManager.PasskeyAccount,
    node: String,
    keys: List<String>,
    values: List<String>,
    rpId: String = account.rpId,
    sessionKey: SessionKeyManager.SessionKey? = null,
  ): TempoRecordsWriteResult {
    if (keys.isEmpty()) return TempoRecordsWriteResult(success = true)
    if (keys.size != values.size) {
      return TempoRecordsWriteResult(success = false, error = "records length mismatch")
    }
    val normalizedNode = normalizeBytes32(node)
      ?: return TempoRecordsWriteResult(success = false, error = "invalid node")

    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val nonce = withContext(Dispatchers.IO) { TempoClient.getNonce(account.address) }
      val fees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }
      val callData =
        if (keys.size == 1) encodeSetTextCall(normalizedNode, keys.first(), values.first())
        else encodeSetRecordsCall(normalizedNode, keys, values)

      val tx =
        TempoTransaction.UnsignedTx(
          nonce = nonce,
          maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
          maxFeePerGas = fees.maxFeePerGas,
          feeMode = TempoTransaction.FeeMode.RELAY_SPONSORED,
          gasLimit = if (keys.size == 1) GAS_LIMIT_SET_TEXT else GAS_LIMIT_SET_RECORDS,
          calls =
            listOf(
              TempoTransaction.Call(
                to = P256Utils.hexToBytes(RECORDS_V1),
                value = 0,
                input = P256Utils.hexToBytes(callData),
              ),
            ),
        )

      val sigHash = TempoTransaction.signatureHash(tx)
      val signedTxHex =
        if (sessionKey != null) {
          val keychainSig = SessionKeyManager.signWithSessionKey(
            sessionKey = sessionKey,
            userAddress = account.address,
            txHash = sigHash,
          )
          TempoTransaction.encodeSignedSessionKey(tx, keychainSig)
        } else {
          val assertion =
            TempoPasskeyManager.sign(
              activity = activity,
              challenge = sigHash,
              account = account,
              rpId = rpId,
            )
          TempoTransaction.encodeSignedWebAuthn(tx, assertion)
        }
      val txHash = withContext(Dispatchers.IO) {
        TempoClient.sendSponsoredRawTransaction(
          signedTxHex = signedTxHex,
          senderAddress = account.address,
        )
      }
      TempoRecordsWriteResult(success = true, txHash = txHash)
    }.getOrElse { err ->
      TempoRecordsWriteResult(success = false, error = err.message ?: "Tempo records tx failed")
    }
  }

  private fun encodeSetTextCall(nodeHexNoPrefix: String, key: String, value: String): String {
    val function =
      Function(
        "setText",
        listOf(
          Bytes32(hexToBytes(nodeHexNoPrefix)),
          Utf8String(key),
          Utf8String(value),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeSetRecordsCall(
    nodeHexNoPrefix: String,
    keys: List<String>,
    values: List<String>,
  ): String {
    val keyValues = keys.map { Utf8String(it) }
    val textValues = values.map { Utf8String(it) }
    val function =
      Function(
        "setRecords",
        listOf(
          Bytes32(hexToBytes(nodeHexNoPrefix)),
          Address(ZERO_ADDRESS),
          DynamicArray(Utf8String::class.java, keyValues),
          DynamicArray(Utf8String::class.java, textValues),
          DynamicBytes(ByteArray(0)),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun ethCall(to: String, data: String): String {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", "eth_call")
        .put(
          "params",
          JSONArray()
            .put(JSONObject().put("to", to).put("data", data))
            .put("latest"),
        )
    val req =
      Request.Builder()
        .url(TempoClient.RPC_URL)
        .post(payload.toString().toRequestBody(jsonType))
        .build()
    client.newCall(req).execute().use { response ->
      if (!response.isSuccessful) throw IllegalStateException("RPC failed: ${response.code}")
      val body = JSONObject(response.body?.string().orEmpty())
      val error = body.optJSONObject("error")
      if (error != null) throw IllegalStateException(error.optString("message", error.toString()))
      return body.optString("result", "0x")
    }
  }

  private fun normalizeAddress(raw: String): String? {
    val value = raw.trim().lowercase()
    if (!value.startsWith("0x") || value.length != 42) return null
    if (!value.drop(2).all { it.isDigit() || it in 'a'..'f' }) return null
    return value
  }

  private fun normalizeBytes32(raw: String): String? {
    val value = raw.trim().lowercase().removePrefix("0x")
    if (value.length != 64) return null
    if (!value.all { it.isDigit() || it in 'a'..'f' }) return null
    return value
  }

  private fun functionSelector(signature: String): String {
    val hash = keccak256(signature.toByteArray(Charsets.UTF_8))
    return bytesToHex(hash.copyOfRange(0, 4))
  }

  private fun keccak256(input: ByteArray): ByteArray {
    val digest = Keccak.Digest256()
    digest.update(input, 0, input.size)
    return digest.digest()
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = hex.removePrefix("0x").removePrefix("0X")
    require(clean.length % 2 == 0) { "hex length must be even" }
    return ByteArray(clean.length / 2) { i ->
      clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
  }

  private fun bytesToHex(bytes: ByteArray): String {
    val sb = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      sb.append(((b.toInt() ushr 4) and 0x0f).toString(16))
      sb.append((b.toInt() and 0x0f).toString(16))
    }
    return sb.toString()
  }

  private data class ParsedName(val label: String, val parentNode: String)

  private fun parseName(nameOrLabel: String): ParsedName {
    val normalized = nameOrLabel.trim().lowercase()
    require(normalized.isNotBlank()) { "name is empty" }

    val parts = normalized.split('.')
    if (parts.size >= 2) {
      val label = parts.first().trim()
      val tld = parts[1].trim()
      if (label.isNotBlank()) {
        val parentNode = parentNodeByTld[tld]
        if (!parentNode.isNullOrBlank()) {
          return ParsedName(label = label, parentNode = parentNode)
        }
      }
    }

    val fallbackLabel = parts.firstOrNull()?.trim().orEmpty().ifBlank { normalized }
    return ParsedName(label = fallbackLabel, parentNode = HEAVEN_NODE)
  }
}
