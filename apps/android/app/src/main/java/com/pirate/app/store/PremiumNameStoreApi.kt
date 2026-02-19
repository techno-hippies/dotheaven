package com.pirate.app.store

import androidx.fragment.app.FragmentActivity
import com.pirate.app.music.SongPublishService
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoTransaction
import java.math.BigInteger
import java.nio.charset.StandardCharsets
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
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Uint256

data class PremiumStoreListing(
  val price: BigInteger,
  val durationSeconds: Long,
  val enabled: Boolean,
)

data class PremiumStoreQuote(
  val label: String,
  val tld: String,
  val parentNode: String,
  val listing: PremiumStoreListing,
)

data class PremiumStoreBuyResult(
  val success: Boolean,
  val buyTxHash: String? = null,
  val approvalTxHash: String? = null,
  val policy: String? = null,
  val quotePrice: BigInteger? = null,
  val error: String? = null,
)

private data class PowChallenge(
  val challengeId: String,
  val challenge: String,
  val difficulty: Int,
  val expiresAt: Long,
)

private data class PermitTxPayload(
  val txTo: String,
  val txData: String,
  val requiredPrice: BigInteger,
  val durationSeconds: Long,
  val policy: String,
)

object PremiumNameStoreApi {
  private const val HEAVEN_API_URL = SongPublishService.HEAVEN_API_URL
  const val PREMIUM_NAME_STORE = "0x46Bcae2625157b562c974bb5a912dfcb811a234A"
  private const val DEFAULT_DURATION_SECONDS = 365L * 24L * 60L * 60L

  private const val MIN_GAS_LIMIT_APPROVE = 120_000L
  private const val MIN_GAS_LIMIT_BUY = 850_000L
  private const val GAS_LIMIT_BUFFER = 300_000L
  private const val GAS_LIMIT_MAX = 3_500_000L
  private const val POW_MAX_ATTEMPTS = 5_000_000

  private val jsonType = "application/json; charset=utf-8".toMediaType()
  private val client = OkHttpClient()

  suspend fun quote(label: String, tld: String): PremiumStoreQuote = withContext(Dispatchers.IO) {
    val normalizedLabel = normalizeLabel(label)
    require(isValidLabel(normalizedLabel)) { "Invalid label format." }

    val normalizedTld = tld.trim().lowercase()
    val parentNode = TempoNameRecordsApi.parentNodeForTld(normalizedTld)
      ?: throw IllegalArgumentException("Unsupported TLD: .$normalizedTld")

    val listing = getListing(parentNode = parentNode, label = normalizedLabel)

    PremiumStoreQuote(
      label = normalizedLabel,
      tld = normalizedTld,
      parentNode = parentNode,
      listing = listing,
    )
  }

  suspend fun getAlphaUsdBalance(address: String): BigInteger = withContext(Dispatchers.IO) {
    TempoClient.getErc20BalanceRaw(address = address, token = TempoClient.ALPHA_USD)
  }

  suspend fun getAlphaUsdAllowance(ownerAddress: String, spender: String = PREMIUM_NAME_STORE): BigInteger = withContext(Dispatchers.IO) {
    val function =
      Function(
        "allowance",
        listOf(Address(ownerAddress), Address(spender)),
        emptyList(),
      )
    val callData = FunctionEncoder.encode(function)
    parseUint256(ethCall(TempoClient.ALPHA_USD, callData))
  }

  suspend fun buy(
    activity: FragmentActivity,
    account: TempoPasskeyManager.PasskeyAccount,
    label: String,
    tld: String,
    maxPrice: BigInteger? = null,
    rpId: String = account.rpId,
    sessionKey: SessionKeyManager.SessionKey? = null,
    preferSelfPay: Boolean = false,
  ): PremiumStoreBuyResult {
    val normalizedLabel = normalizeLabel(label)
    if (!isValidLabel(normalizedLabel)) {
      return PremiumStoreBuyResult(success = false, error = "Invalid label format.")
    }

    val normalizedTld = tld.trim().lowercase()
    TempoNameRecordsApi.parentNodeForTld(normalizedTld)
      ?: return PremiumStoreBuyResult(success = false, error = "Unsupported TLD: .$normalizedTld")

    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val permitPayload =
        withContext(Dispatchers.IO) {
          val challenge =
            if (normalizedLabel.length >= 6) {
              requestPowChallenge(
                label = normalizedLabel,
                tld = normalizedTld,
                wallet = account.address,
              )
            } else {
              null
            }
          requestPermit(
            label = normalizedLabel,
            tld = normalizedTld,
            wallet = account.address,
            recipient = account.address,
            durationSeconds = DEFAULT_DURATION_SECONDS,
            maxPrice = maxPrice,
            challenge = challenge,
          )
        }

      var approvalTxHash: String? = null
      if (permitPayload.requiredPrice > BigInteger.ZERO) {
        val allowance = withContext(Dispatchers.IO) {
          getAlphaUsdAllowance(ownerAddress = account.address, spender = permitPayload.txTo)
        }
        if (allowance < permitPayload.requiredPrice) {
          val approveCalldata = encodeApproveCall(spender = permitPayload.txTo, value = permitPayload.requiredPrice)
          approvalTxHash =
            submitCallWithFallback(
              activity = activity,
              account = account,
              to = TempoClient.ALPHA_USD,
              callData = approveCalldata,
              minimumGasLimit = MIN_GAS_LIMIT_APPROVE,
              rpId = rpId,
              sessionKey = sessionKey,
              preferSelfPay = preferSelfPay,
            )
        }
      }

      val buyTxHash =
        submitCallWithFallback(
          activity = activity,
          account = account,
          to = permitPayload.txTo,
          callData = permitPayload.txData,
          minimumGasLimit = MIN_GAS_LIMIT_BUY,
          rpId = rpId,
          sessionKey = sessionKey,
          preferSelfPay = preferSelfPay,
        )

      PremiumStoreBuyResult(
        success = true,
        buyTxHash = buyTxHash,
        approvalTxHash = approvalTxHash,
        policy = permitPayload.policy,
        quotePrice = permitPayload.requiredPrice,
      )
    }.getOrElse { err ->
      PremiumStoreBuyResult(success = false, error = err.message ?: "Premium name purchase failed.")
    }
  }

  fun isValidLabel(label: String): Boolean {
    val normalized = normalizeLabel(label)
    if (normalized.isBlank()) return false
    if (normalized.length > 63) return false
    if (normalized.first() == '-' || normalized.last() == '-') return false
    return normalized.all { ch ->
      ch in 'a'..'z' || ch in '0'..'9' || ch == '-'
    }
  }

  fun normalizeLabel(label: String): String = label.trim().lowercase()

  private fun mapPermitErrorMessage(message: String): String {
    val normalized = message.lowercase()
    if (
      normalized.contains("self verification required") ||
      normalized.contains("self nullifier not available") ||
      normalized.contains("older verification record without a short-name credential")
    ) {
      return "Short names (5 chars or less) require one-time Self verification. Open Verify Identity, complete it, then try again."
    }
    return message
  }

  private fun requestPowChallenge(
    label: String,
    tld: String,
    wallet: String,
  ): PowChallenge {
    val payload =
      JSONObject()
        .put("label", label)
        .put("tld", tld)
        .put("wallet", wallet)
    val req =
      Request.Builder()
        .url("$HEAVEN_API_URL/api/names/challenge")
        .post(payload.toString().toRequestBody(jsonType))
        .build()

    client.newCall(req).execute().use { response ->
      val bodyText = response.body?.string().orEmpty()
      val body = runCatching { JSONObject(bodyText) }.getOrElse { JSONObject() }
      if (!response.isSuccessful) {
        val msg = body.optString("error", "Failed to create PoW challenge.")
        throw IllegalStateException(msg)
      }

      val challengeId = body.optString("challengeId", "")
      val challenge = body.optString("challenge", "")
      val difficulty = body.optInt("difficulty", -1)
      val expiresAt =
        body.optString("expiresAt", "").trim().toLongOrNull()
          ?: body.optLong("expiresAt", -1L).takeIf { it > 0L }
          ?: -1L
      if (challengeId.isBlank() || challenge.isBlank() || difficulty < 0 || expiresAt <= 0L) {
        throw IllegalStateException("Invalid PoW challenge response.")
      }
      return PowChallenge(
        challengeId = challengeId,
        challenge = challenge,
        difficulty = difficulty,
        expiresAt = expiresAt,
      )
    }
  }

  private fun requestPermit(
    label: String,
    tld: String,
    wallet: String,
    recipient: String,
    durationSeconds: Long,
    maxPrice: BigInteger?,
    challenge: PowChallenge?,
  ): PermitTxPayload {
    val payload =
      JSONObject()
        .put("label", label)
        .put("tld", tld)
        .put("wallet", wallet)
        .put("recipient", recipient)
        .put("durationSeconds", durationSeconds)
    if (maxPrice != null && maxPrice >= BigInteger.ZERO) {
      payload.put("maxPrice", maxPrice.toString())
    }

    if (challenge != null) {
      val powNonce = solvePow(challenge.challenge, challenge.difficulty, challenge.expiresAt)
        ?: throw IllegalStateException("Unable to solve PoW challenge before expiry. Try again.")
      payload.put("challengeId", challenge.challengeId)
      payload.put("powNonce", powNonce)
    }

    val req =
      Request.Builder()
        .url("$HEAVEN_API_URL/api/names/permit")
        .post(payload.toString().toRequestBody(jsonType))
        .build()

    client.newCall(req).execute().use { response ->
      val bodyText = response.body?.string().orEmpty()
      val body = runCatching { JSONObject(bodyText) }.getOrElse { JSONObject() }
      if (!response.isSuccessful) {
        val msg = body.optString("error", "Failed to fetch name permit.")
        throw IllegalStateException(mapPermitErrorMessage(msg))
      }

      val txObj = body.optJSONObject("tx") ?: throw IllegalStateException("Permit response missing tx payload.")
      val quoteObj = body.optJSONObject("quote") ?: throw IllegalStateException("Permit response missing quote payload.")
      val txTo = txObj.optString("to", "").trim()
      val txData = txObj.optString("data", "").trim()
      val requiredPrice = quoteObj.optString("price", "").trim().toBigIntegerOrNull()
        ?: throw IllegalStateException("Permit response missing quote price.")
      val duration =
        quoteObj.optString("durationSeconds", "").trim().toLongOrNull()
          ?: quoteObj.optLong("durationSeconds", -1L).takeIf { it > 0L }
          ?: throw IllegalStateException("Permit response missing quote duration.")
      val policy = body.optString("policy", "UNKNOWN")
      if (!txTo.startsWith("0x") || txTo.length != 42 || !txData.startsWith("0x")) {
        throw IllegalStateException("Permit response returned invalid transaction payload.")
      }

      return PermitTxPayload(
        txTo = txTo,
        txData = txData,
        requiredPrice = requiredPrice,
        durationSeconds = duration,
        policy = policy,
      )
    }
  }

  private fun solvePow(challenge: String, difficulty: Int, expiresAt: Long): String? {
    val solveDeadline = (expiresAt - 2L).coerceAtLeast(0L)
    if ((System.currentTimeMillis() / 1000L) >= solveDeadline) return null

    val requiredPrefix = "0".repeat(difficulty.coerceAtLeast(0))
    for (attempt in 0 until POW_MAX_ATTEMPTS) {
      if ((attempt and 2047) == 0 && (System.currentTimeMillis() / 1000L) >= solveDeadline) {
        return null
      }
      val nonce = attempt.toString()
      val digest = keccak256Hex("$challenge:$nonce")
      if (digest.startsWith(requiredPrefix)) return nonce
    }
    return null
  }

  private fun keccak256Hex(input: String): String {
    val digest = Keccak.Digest256()
    val bytes = input.toByteArray(StandardCharsets.UTF_8)
    digest.update(bytes, 0, bytes.size)
    return digest.digest().joinToString(separator = "") { b ->
      "%02x".format(b)
    }
  }

  private fun encodeApproveCall(spender: String, value: BigInteger): String {
    val function =
      Function(
        "approve",
        listOf(Address(spender), Uint256(value.max(BigInteger.ZERO))),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun getListing(parentNode: String, label: String): PremiumStoreListing {
    val function =
      Function(
        "quote",
        listOf(
          Bytes32(P256Utils.hexToBytes(parentNode.removePrefix("0x"))),
          Utf8String(label),
        ),
        emptyList(),
      )
    val callData = FunctionEncoder.encode(function)
    val result = ethCall(PREMIUM_NAME_STORE, callData)
    return parseListing(result)
  }

  private suspend fun submitCallWithFallback(
    activity: FragmentActivity,
    account: TempoPasskeyManager.PasskeyAccount,
    to: String,
    callData: String,
    minimumGasLimit: Long,
    rpId: String,
    sessionKey: SessionKeyManager.SessionKey?,
    preferSelfPay: Boolean,
  ): String {
    val nonce = withContext(Dispatchers.IO) { TempoClient.getNonce(account.address) }
    val fees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }
    val gasLimit =
      withContext(Dispatchers.IO) {
        val estimated = estimateGas(from = account.address, to = to, valueWei = BigInteger.ZERO, data = callData)
        withGasBuffer(estimated = estimated, minimum = minimumGasLimit)
      }

    fun buildTx(
      feeMode: TempoTransaction.FeeMode,
      txFees: TempoClient.Eip1559Fees,
    ): TempoTransaction.UnsignedTx =
      TempoTransaction.UnsignedTx(
        nonce = nonce,
        maxPriorityFeePerGas = txFees.maxPriorityFeePerGas,
        maxFeePerGas = txFees.maxFeePerGas,
        feeMode = feeMode,
        gasLimit = gasLimit,
        calls =
          listOf(
            TempoTransaction.Call(
              to = P256Utils.hexToBytes(to),
              value = 0,
              input = P256Utils.hexToBytes(callData),
            ),
          ),
      )

    suspend fun signTx(unsignedTx: TempoTransaction.UnsignedTx): String {
      val sigHash = TempoTransaction.signatureHash(unsignedTx)
      return if (sessionKey != null) {
        val keychainSig = SessionKeyManager.signWithSessionKey(
          sessionKey = sessionKey,
          userAddress = account.address,
          txHash = sigHash,
        )
        TempoTransaction.encodeSignedSessionKey(unsignedTx, keychainSig)
      } else {
        val assertion =
          TempoPasskeyManager.sign(
            activity = activity,
            challenge = sigHash,
            account = account,
            rpId = rpId,
          )
        TempoTransaction.encodeSignedWebAuthn(unsignedTx, assertion)
      }
    }

    suspend fun submitRelay(): String {
      val tx = buildTx(feeMode = TempoTransaction.FeeMode.RELAY_SPONSORED, txFees = fees)
      val signed = signTx(tx)
      return withContext(Dispatchers.IO) {
        TempoClient.sendSponsoredRawTransaction(
          signedTxHex = signed,
          senderAddress = account.address,
        )
      }
    }

    suspend fun submitSelf(): String {
      withContext(Dispatchers.IO) { runCatching { TempoClient.fundAddress(account.address) } }
      val selfFees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }
      val tx = buildTx(feeMode = TempoTransaction.FeeMode.SELF, txFees = selfFees)
      val signed = signTx(tx)
      return withContext(Dispatchers.IO) { TempoClient.sendRawTransaction(signed) }
    }

    val txHash =
      if (preferSelfPay) {
        runCatching { submitSelf() }.getOrElse { selfErr ->
          runCatching { submitRelay() }.getOrElse { relayErr ->
            throw IllegalStateException(
              "Transaction submit failed: self=${selfErr.message}; relay=${relayErr.message}",
              relayErr,
            )
          }
        }
      } else {
        runCatching { submitRelay() }.getOrElse { relayErr ->
          runCatching { submitSelf() }.getOrElse { selfErr ->
            throw IllegalStateException(
              "Transaction submit failed: relay=${relayErr.message}; self=${selfErr.message}",
              selfErr,
            )
          }
        }
      }

    val receipt = withContext(Dispatchers.IO) { TempoClient.waitForTransactionReceipt(txHash) }
    if (!receipt.isSuccess) {
      throw IllegalStateException("Transaction reverted on-chain: $txHash")
    }
    return txHash
  }

  private fun parseListing(resultHex: String): PremiumStoreListing {
    val clean = resultHex.removePrefix("0x").lowercase()
    if (clean.isBlank()) {
      return PremiumStoreListing(price = BigInteger.ZERO, durationSeconds = 0L, enabled = false)
    }

    val padded = clean.padStart(64 * 3, '0')
    if (padded.length < 64 * 3) {
      return PremiumStoreListing(price = BigInteger.ZERO, durationSeconds = 0L, enabled = false)
    }

    val price = padded.substring(0, 64).toBigIntegerOrNull(16) ?: BigInteger.ZERO
    val durationWord = padded.substring(64, 128).toBigIntegerOrNull(16) ?: BigInteger.ZERO
    val duration = durationWord.min(BigInteger.valueOf(Long.MAX_VALUE)).toLong()
    val enabled = (padded.substring(128, 192).toBigIntegerOrNull(16) ?: BigInteger.ZERO) != BigInteger.ZERO
    return PremiumStoreListing(price = price, durationSeconds = duration, enabled = enabled)
  }

  private fun parseUint256(resultHex: String): BigInteger {
    val clean = resultHex.removePrefix("0x").ifBlank { "0" }
    return clean.toBigIntegerOrNull(16) ?: BigInteger.ZERO
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

  private fun estimateGas(
    from: String,
    to: String,
    valueWei: BigInteger,
    data: String,
  ): Long {
    val txObj =
      JSONObject()
        .put("from", from)
        .put("to", to)
        .put("value", "0x${valueWei.toString(16)}")
        .put("data", data)
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", "eth_estimateGas")
        .put("params", JSONArray().put(txObj).put("latest"))

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
      val resultHex = body.optString("result", "").trim()
      if (!resultHex.startsWith("0x")) {
        throw IllegalStateException("RPC eth_estimateGas missing result")
      }
      val clean = resultHex.removePrefix("0x").ifBlank { "0" }
      return clean.toLongOrNull(16)
        ?: throw IllegalStateException("Invalid eth_estimateGas result: $resultHex")
    }
  }

  private fun withGasBuffer(estimated: Long, minimum: Long): Long {
    val buffered =
      if (Long.MAX_VALUE - estimated < GAS_LIMIT_BUFFER) Long.MAX_VALUE else estimated + GAS_LIMIT_BUFFER
    return maxOf(buffered, minimum).coerceAtMost(GAS_LIMIT_MAX)
  }
}
