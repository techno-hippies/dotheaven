package com.pirate.app.tempo

import android.app.Activity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class TempoSessionAuthorizationResult(
  val success: Boolean,
  val sessionKey: SessionKeyManager.SessionKey? = null,
  val txHash: String? = null,
  val error: String? = null,
)

object TempoSessionKeyApi {
  private const val GAS_LIMIT_AUTHORIZE_SESSION_KEY = 650_000L

  /**
   * Authorizes a new ephemeral session key for the passkey account.
   * This requires two passkey prompts:
   * 1) sign KeyAuthorization digest
   * 2) sign authorization transaction
   */
  suspend fun authorizeSessionKey(
    activity: Activity,
    account: TempoPasskeyManager.PasskeyAccount,
    rpId: String = account.rpId,
  ): TempoSessionAuthorizationResult {
    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val sessionKey = SessionKeyManager.generate(ownerAddress = account.address)

      val keyAuthDigest = SessionKeyManager.buildKeyAuthDigest(sessionKey)
      val keyAuthAssertion =
        TempoPasskeyManager.sign(
          activity = activity,
          challenge = keyAuthDigest,
          account = account,
          rpId = rpId,
        )
      val signedKeyAuthorization =
        SessionKeyManager.buildSignedKeyAuthorization(sessionKey, keyAuthAssertion)

      val nonce = withContext(Dispatchers.IO) { TempoClient.getNonce(account.address) }
      val fees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }

      val tx =
        TempoTransaction.UnsignedTx(
          nonce = nonce,
          maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
          maxFeePerGas = fees.maxFeePerGas,
          feeMode = TempoTransaction.FeeMode.RELAY_SPONSORED,
          gasLimit = GAS_LIMIT_AUTHORIZE_SESSION_KEY,
          calls =
            listOf(
              TempoTransaction.Call(
                to = P256Utils.hexToBytes(account.address),
                value = 0,
                input = ByteArray(0),
              ),
            ),
          keyAuthorization = signedKeyAuthorization,
        )

      val txSigHash = TempoTransaction.signatureHash(tx)
      val txAssertion =
        TempoPasskeyManager.sign(
          activity = activity,
          challenge = txSigHash,
          account = account,
          rpId = rpId,
        )

      val signedTxHex = TempoTransaction.encodeSignedWebAuthn(tx, txAssertion)
      val txHash = withContext(Dispatchers.IO) {
        TempoClient.sendSponsoredRawTransaction(
          signedTxHex = signedTxHex,
          senderAddress = account.address,
        )
      }
      val receipt = withContext(Dispatchers.IO) { TempoClient.waitForTransactionReceipt(txHash) }
      if (!receipt.isSuccess) {
        throw IllegalStateException("Session key authorization reverted on-chain: $txHash")
      }

      val persistedSessionKey = sessionKey.copy(keyAuthorization = signedKeyAuthorization)
      SessionKeyManager.save(activity, persistedSessionKey)
      TempoSessionAuthorizationResult(
        success = true,
        sessionKey = persistedSessionKey,
        txHash = txHash,
      )
    }.getOrElse { err ->
      TempoSessionAuthorizationResult(
        success = false,
        error = err.message ?: "Session key authorization failed.",
      )
    }
  }
}
