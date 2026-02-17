package com.pirate.app.profile

import androidx.fragment.app.FragmentActivity
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoTransaction
import java.math.BigInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Uint256

data class TempoNameRegisterResult(
  val success: Boolean,
  val txHash: String? = null,
  val label: String? = null,
  val tld: String? = null,
  val fullName: String? = null,
  val node: String? = null,
  val tokenId: String? = null,
  val error: String? = null,
)

object TempoNameRegistryApi {
  private const val GAS_LIMIT_REGISTER = 650_000L
  private const val MIN_DURATION_SECONDS = 365L * 24L * 60L * 60L

  private val jsonType = "application/json; charset=utf-8".toMediaType()
  private val client = OkHttpClient()

  suspend fun checkNameAvailable(label: String, tld: String): Boolean = withContext(Dispatchers.IO) {
    val normalizedLabel = label.trim().lowercase()
    if (normalizedLabel.isBlank()) return@withContext false
    val normalizedTld = tld.trim().lowercase()
    val parentNode = TempoNameRecordsApi.parentNodeForTld(normalizedTld)
      ?: throw IllegalArgumentException("Unsupported TLD: .$normalizedTld")

    if (!tldExists(parentNode)) {
      throw IllegalStateException(".$normalizedTld is not configured on the current registry yet.")
    }

    val callData =
      FunctionEncoder.encode(
        Function(
          "available",
          listOf(
            Bytes32(P256Utils.hexToBytes(parentNode.removePrefix("0x"))),
            Utf8String(normalizedLabel),
          ),
          emptyList(),
        ),
      )
    val result = ethCall(TempoNameRecordsApi.REGISTRY_V1, callData)
    parseBool(result)
  }

  suspend fun register(
    activity: FragmentActivity,
    account: TempoPasskeyManager.PasskeyAccount,
    label: String,
    tld: String,
    durationSeconds: Long = MIN_DURATION_SECONDS,
    rpId: String = account.rpId,
    sessionKey: SessionKeyManager.SessionKey? = null,
  ): TempoNameRegisterResult {
    val normalizedLabel = label.trim().lowercase()
    val normalizedTld = tld.trim().lowercase()
    if (normalizedLabel.isBlank()) {
      return TempoNameRegisterResult(success = false, error = "Name label is empty.")
    }
    if (durationSeconds <= 0L) {
      return TempoNameRegisterResult(success = false, error = "Invalid registration duration.")
    }
    val parentNode = TempoNameRecordsApi.parentNodeForTld(normalizedTld)
      ?: return TempoNameRegisterResult(success = false, error = "Unsupported TLD: $normalizedTld")
    val tldExists = runCatching { withContext(Dispatchers.IO) { tldExists(parentNode) } }.getOrDefault(false)
    if (!tldExists) {
      return TempoNameRegisterResult(
        success = false,
        error = ".$normalizedTld is not configured on the current registry yet.",
      )
    }

    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val priceWei = withContext(Dispatchers.IO) {
        getRegistrationPriceWei(parentNode = parentNode, label = normalizedLabel, durationSeconds = durationSeconds)
      }
      if (priceWei > BigInteger.valueOf(Long.MAX_VALUE)) {
        throw IllegalStateException("Registration price exceeds transaction value limits.")
      }

      val nonce = withContext(Dispatchers.IO) { TempoClient.getNonce(account.address) }
      val fees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }

      val callData = encodeRegisterCall(parentNode = parentNode, label = normalizedLabel, durationSeconds = durationSeconds)
      val tx =
        TempoTransaction.UnsignedTx(
          nonce = nonce,
          maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
          maxFeePerGas = fees.maxFeePerGas,
          feeMode = TempoTransaction.FeeMode.RELAY_SPONSORED,
          gasLimit = GAS_LIMIT_REGISTER,
          calls =
            listOf(
              TempoTransaction.Call(
                to = P256Utils.hexToBytes(TempoNameRecordsApi.REGISTRY_V1),
                value = priceWei.toLong(),
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

      val fullName = "$normalizedLabel.$normalizedTld"
      val node = TempoNameRecordsApi.computeNode(fullName)
      TempoNameRegisterResult(
        success = true,
        txHash = txHash,
        label = normalizedLabel,
        tld = normalizedTld,
        fullName = fullName,
        node = node,
        tokenId = node,
      )
    }.getOrElse { err ->
      TempoNameRegisterResult(success = false, error = err.message ?: "Name registration failed.")
    }
  }

  private fun encodeRegisterCall(parentNode: String, label: String, durationSeconds: Long): String {
    val function =
      Function(
        "register",
        listOf(
          Bytes32(P256Utils.hexToBytes(parentNode.removePrefix("0x"))),
          Utf8String(label),
          Uint256(BigInteger.valueOf(durationSeconds)),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun getRegistrationPriceWei(parentNode: String, label: String, durationSeconds: Long): BigInteger {
    val function =
      Function(
        "price",
        listOf(
          Bytes32(P256Utils.hexToBytes(parentNode.removePrefix("0x"))),
          Utf8String(label),
          Uint256(BigInteger.valueOf(durationSeconds)),
        ),
        emptyList(),
      )
    val callData = FunctionEncoder.encode(function)
    val result = ethCall(TempoNameRecordsApi.REGISTRY_V1, callData)
    val clean = result.removePrefix("0x").ifBlank { "0" }
    return clean.toBigIntegerOrNull(16) ?: BigInteger.ZERO
  }

  private fun parseBool(result: String): Boolean {
    val clean = result.removePrefix("0x").ifBlank { "0" }
    return clean.toBigIntegerOrNull(16)?.let { it != BigInteger.ZERO } ?: false
  }

  private fun tldExists(parentNode: String): Boolean {
    val callData =
      FunctionEncoder.encode(
        Function(
          "tldExists",
          listOf(Bytes32(P256Utils.hexToBytes(parentNode.removePrefix("0x")))),
          emptyList(),
        ),
      )
    val result = ethCall(TempoNameRecordsApi.REGISTRY_V1, callData)
    return parseBool(result)
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
}
