package com.pirate.app.scrobble

import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private data class SubmissionOutcome(
  val txHash: String,
  val submittedFresh: Boolean,
)

internal data class SessionCallSubmission(
  val txHash: String,
  val usedSelfPayFallback: Boolean,
)

private val scrobbleExpiringNonceKey = ByteArray(32) { 0xFF.toByte() } // TIP-1009 nonceKey=uint256.max
private const val scrobbleExpiryWindowSec = 25L
private const val maxUnderpricedRetries = 4
private const val retryDelayMs = 220L

internal suspend fun submitScrobbleSessionKeyContractCall(
  account: TempoPasskeyManager.PasskeyAccount,
  sessionKey: SessionKeyManager.SessionKey,
  callData: String,
  minimumGasLimit: Long,
): SessionCallSubmission {
  val gasLimit =
    withContext(Dispatchers.IO) {
      val estimated =
        estimateGas(
          from = account.address,
          to = TempoScrobbleApi.SCROBBLE_V4,
          data = callData,
        )
      withBuffer(estimated = estimated, minimum = minimumGasLimit)
    }

  val fees =
    withContext(Dispatchers.IO) {
      val suggested = TempoClient.getSuggestedFees()
      val floored = withRelayMinimumFeeFloor(suggested)
      withAddressBidFloor(account.address, floored)
    }

  fun buildTx(
    feeMode: TempoTransaction.FeeMode,
    txFees: TempoClient.Eip1559Fees,
  ): TempoTransaction.UnsignedTx =
    TempoTransaction.UnsignedTx(
      nonceKeyBytes = scrobbleExpiringNonceKey,
      nonce = 0L,
      validBeforeSec = nowSec() + scrobbleExpiryWindowSec,
      maxPriorityFeePerGas = txFees.maxPriorityFeePerGas,
      maxFeePerGas = txFees.maxFeePerGas,
      feeMode = feeMode,
      gasLimit = gasLimit,
      calls =
        listOf(
          TempoTransaction.Call(
            to = P256Utils.hexToBytes(TempoScrobbleApi.SCROBBLE_V4),
            value = 0,
            input = P256Utils.hexToBytes(callData),
          ),
        ),
    )

  suspend fun submitWithMode(
    feeMode: TempoTransaction.FeeMode,
    initialFees: TempoClient.Eip1559Fees,
  ): SubmissionOutcome {
    var feesForAttempt = withAddressBidFloor(account.address, initialFees)
    var lastUnderpriced: Throwable? = null

    repeat(maxUnderpricedRetries + 1) { attempt ->
      val tx = buildTx(feeMode, feesForAttempt)
      val sigHash = TempoTransaction.signatureHash(tx)
      val keychainSig =
        SessionKeyManager.signWithSessionKey(
          sessionKey = sessionKey,
          userAddress = account.address,
          txHash = sigHash,
        )
      val signedTxHex = TempoTransaction.encodeSignedSessionKey(tx, keychainSig)

      val result =
        withContext(Dispatchers.IO) {
          runCatching {
            when (feeMode) {
              TempoTransaction.FeeMode.RELAY_SPONSORED ->
                TempoClient.sendSponsoredRawTransaction(
                  signedTxHex = signedTxHex,
                  senderAddress = account.address,
                )
              TempoTransaction.FeeMode.SELF -> TempoClient.sendRawTransaction(signedTxHex)
            }
          }
        }
      val txHash = result.getOrNull()
      if (!txHash.isNullOrBlank()) {
        rememberAddressBidFloor(account.address, feesForAttempt)
        return SubmissionOutcome(txHash = txHash, submittedFresh = true)
      }

      val err = result.exceptionOrNull() ?: IllegalStateException("Unknown tx submission failure")
      if (!isReplacementUnderpriced(err)) throw err
      lastUnderpriced = err
      if (attempt >= maxUnderpricedRetries) return@repeat

      feesForAttempt = aggressivelyBumpFees(feesForAttempt)
      if (feeMode == TempoTransaction.FeeMode.RELAY_SPONSORED) {
        feesForAttempt = withRelayMinimumFeeFloor(feesForAttempt)
      }
      rememberAddressBidFloor(account.address, feesForAttempt)
      delay(retryDelayMs)
    }

    throw lastUnderpriced ?: IllegalStateException("replacement transaction underpriced")
  }

  var usedSelfPayFallback = false
  var selfPayFeesUsed: TempoClient.Eip1559Fees? = null
  val submission =
    runCatching {
      submitWithMode(TempoTransaction.FeeMode.RELAY_SPONSORED, fees)
    }.getOrElse { relayErr ->
      usedSelfPayFallback = true
      withContext(Dispatchers.IO) {
        runCatching { TempoClient.fundAddress(account.address) }
      }
      val selfPayFees = aggressivelyBumpFees(withAddressBidFloor(account.address, fees))
      selfPayFeesUsed = selfPayFees
      runCatching {
        submitWithMode(TempoTransaction.FeeMode.SELF, selfPayFees)
      }.getOrElse { selfErr ->
        throw IllegalStateException(
          "Relay submit failed: ${relayErr.message}; self-pay fallback failed: ${selfErr.message}",
          selfErr,
        )
      }
    }

  val canonicalTxHash = submission.txHash
  if (!submission.submittedFresh) {
    throw IllegalStateException(
      "Scrobble submission not fresh at $canonicalTxHash; replacement rejected (underpriced)." +
        " gas=$gasLimit relay=${fees.maxPriorityFeePerGas}/${fees.maxFeePerGas}" +
        " self=${selfPayFeesUsed?.maxPriorityFeePerGas ?: 0L}/${selfPayFeesUsed?.maxFeePerGas ?: 0L}",
    )
  }
  return SessionCallSubmission(txHash = canonicalTxHash, usedSelfPayFallback = usedSelfPayFallback)
}
