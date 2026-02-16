package com.pirate.app.lit

import android.util.Log
import com.reown.appkit.client.AppKit
import com.reown.appkit.client.Modal
import com.reown.appkit.client.models.request.Request
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.web3j.crypto.Keys
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val TAG = "WalletAuth"
private val JSON_MT = "application/json; charset=utf-8".toMediaType()

private const val AUTH_METHOD_TYPE_ETH_WALLET = 1
private const val LIT_RELAYER_URL = "https://lit-sponsorship-api.vercel.app"

data class WalletAuthResult(
  val pkpPublicKey: String,
  val pkpEthAddress: String,
  val pkpTokenId: String,
  val authMethodType: Int,
  val authMethodId: String,
  val accessToken: String,
  val eoaAddress: String,
)

/**
 * Delegate that bridges AppKit session events into coroutines.
 * Must be set before any wallet interactions.
 */
object WalletAuthDelegate : AppKit.ModalDelegate {
  private var onSessionApproved: ((String) -> Unit)? = null
  private var onSessionRejected: ((String) -> Unit)? = null
  private var onSignatureResult: ((Result<String>) -> Unit)? = null

  fun setSessionCallbacks(
    onApproved: (String) -> Unit,
    onRejected: (String) -> Unit,
  ) {
    onSessionApproved = onApproved
    onSessionRejected = onRejected
  }

  fun setSignatureCallback(callback: (Result<String>) -> Unit) {
    onSignatureResult = callback
  }

  fun clearCallbacks() {
    onSessionApproved = null
    onSessionRejected = null
    onSignatureResult = null
  }

  override fun onSessionApproved(approvedSession: Modal.Model.ApprovedSession) {
    Log.d(TAG, "Session approved: ${approvedSession::class.simpleName}")
    val address = when (approvedSession) {
      is Modal.Model.ApprovedSession.WalletConnectSession -> {
        // accounts format: "eip155:1:0xABC..."
        approvedSession.accounts.firstOrNull()?.split(":")?.lastOrNull() ?: ""
      }
      is Modal.Model.ApprovedSession.CoinbaseSession -> {
        approvedSession.address
      }
    }
    onSessionApproved?.invoke(address)
  }

  override fun onSessionRejected(rejectedSession: Modal.Model.RejectedSession) {
    Log.d(TAG, "Session rejected: ${rejectedSession.reason}")
    onSessionRejected?.invoke(rejectedSession.reason)
  }

  override fun onSessionRequestResponse(response: Modal.Model.SessionRequestResponse) {
    Log.d(TAG, "Request response: ${response.result::class.simpleName}")
    when (val result = response.result) {
      is Modal.Model.JsonRpcResponse.JsonRpcResult -> {
        val sig = result.result as? String ?: ""
        Log.d(TAG, "Signature: ${sig.take(20)}...")
        onSignatureResult?.invoke(Result.success(sig))
      }
      is Modal.Model.JsonRpcResponse.JsonRpcError -> {
        Log.e(TAG, "Sign error: ${result.message} (code ${result.code})")
        onSignatureResult?.invoke(Result.failure(IllegalStateException("Wallet sign failed: ${result.message}")))
      }
    }
  }

  override fun onConnectionStateChange(state: Modal.Model.ConnectionState) {
    Log.d(TAG, "Connection state: isAvailable=${state.isAvailable}")
  }

  override fun onSessionDelete(deletedSession: Modal.Model.DeletedSession) {
    Log.d(TAG, "Session deleted")
  }

  override fun onSessionUpdate(updatedSession: Modal.Model.UpdatedSession) {}
  override fun onSessionEvent(sessionEvent: Modal.Model.SessionEvent) {}
  override fun onSessionExtend(session: Modal.Model.Session) {}
  override fun onProposalExpired(proposal: Modal.Model.ExpiredProposal) {}
  override fun onRequestExpired(request: Modal.Model.ExpiredRequest) {}
  override fun onError(error: Modal.Model.Error) {
    Log.e(TAG, "AppKit error: ${error.throwable.message}")
  }
}

object WalletAuth {

  private val httpClient = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .build()

  init {
    AppKit.setDelegate(WalletAuthDelegate)
  }

  /**
   * Check if a wallet is already connected via AppKit.
   */
  fun isConnected(): Boolean = AppKit.getAccount() != null

  /**
   * Get the currently connected address, or null.
   */
  fun getConnectedAddress(): String? = AppKit.getAccount()?.address

  /**
   * Wait for wallet connection via AppKit modal (shown by the UI layer).
   * The UI should call navController.openAppKit() or show AppKitSheet before this.
   * Returns the connected EOA address.
   */
  suspend fun waitForConnection(): String = suspendCancellableCoroutine { cont ->
    // Check if already connected
    val existing = AppKit.getAccount()?.address
    if (!existing.isNullOrBlank()) {
      cont.resume(existing)
      return@suspendCancellableCoroutine
    }

    WalletAuthDelegate.setSessionCallbacks(
      onApproved = { address ->
        if (address.isNotBlank()) {
          cont.resume(address)
        } else {
          cont.resumeWithException(IllegalStateException("Wallet connected but no address returned"))
        }
      },
      onRejected = { reason ->
        cont.resumeWithException(IllegalStateException("Wallet connection rejected: $reason"))
      },
    )

    cont.invokeOnCancellation {
      WalletAuthDelegate.clearCallbacks()
    }
  }

  /**
   * Request personal_sign from the connected wallet.
   */
  suspend fun personalSign(message: String, address: String): String =
    suspendCancellableCoroutine { cont ->
      val hexMsg = message.toByteArray(Charsets.UTF_8)
        .joinToString(separator = "", prefix = "0x") { "%02x".format(it) }

      val params = """["$hexMsg", "$address"]"""
      val request = Request(
        method = "personal_sign",
        params = params,
        chainId = "eip155:1",
      )

      WalletAuthDelegate.setSignatureCallback { result ->
        result.onSuccess { sig -> cont.resume(sig) }
        result.onFailure { err -> cont.resumeWithException(err) }
      }

      AppKit.request(
        request = request,
        onSuccess = { _ ->
          Log.d(TAG, "personal_sign request sent to wallet")
        },
        onError = { throwable ->
          Log.e(TAG, "personal_sign request failed: ${throwable.message}")
          cont.resumeWithException(throwable)
        },
      )

      cont.invokeOnCancellation {
        WalletAuthDelegate.clearCallbacks()
      }
    }

  /**
   * Full auth flow: wait for connection, sign SIWE, mint/find PKP, create Lit auth context.
   * The wallet modal must already be open when this is called.
   */
  suspend fun connectAndAuth(
    litNetwork: String,
    litRpcUrl: String,
  ): WalletAuthResult {
    // 1. Wait for wallet connection
    Log.d(TAG, "Step 1: Waiting for wallet connection...")
    val address = waitForConnection()
    val checksumAddress = Keys.toChecksumAddress(address)
    Log.d(TAG, "Connected: $checksumAddress")

    // 2. Derive authMethodId
    val authMethodId = deriveEoaAuthMethodId(checksumAddress)
    Log.d(TAG, "authMethodId: $authMethodId")

    // 3. Check if PKP already exists
    Log.d(TAG, "Looking up existing PKPs...")
    var pkpInfo = lookupExistingPkp(litNetwork, litRpcUrl, authMethodId)

    if (pkpInfo == null) {
      Log.d(TAG, "No existing PKP, minting via relayer...")
      pkpInfo = mintPkpViaRelayer(checksumAddress, litNetwork)
      Log.d(TAG, "Minted PKP: ${pkpInfo.getString("pkpEthAddress")}")
    } else {
      Log.d(TAG, "Found existing PKP: ${pkpInfo.getString("pkpEthAddress")}")
    }

    val pkpPublicKey = pkpInfo.getString("pkpPublicKey").let { v ->
      if (v.startsWith("0x") || v.startsWith("0X")) v else "0x$v"
    }
    val pkpEthAddress = pkpInfo.getString("pkpEthAddress")
    val pkpTokenId = pkpInfo.optString("pkpTokenId", pkpInfo.optString("tokenId", ""))

    // 4. Build SIWE and request signature from wallet
    Log.d(TAG, "Step 4: Requesting SIWE signature...")
    val accessToken = createSiweAuthSig(checksumAddress)
    Log.d(TAG, "SIWE signature received")

    // 5. Create Lit auth context
    Log.d(TAG, "Step 5: Creating Lit auth context...")
    val authConfigJson = PirateAuthConfig.defaultAuthConfigJson(PirateAuthConfig.DEFAULT_PASSKEY_RP_ID)
    withContext(Dispatchers.IO) {
      val raw = LitRust.createAuthContextFromPasskeyCallbackRaw(
        network = litNetwork,
        rpcUrl = litRpcUrl,
        pkpPublicKey = pkpPublicKey,
        authMethodType = AUTH_METHOD_TYPE_ETH_WALLET,
        authMethodId = authMethodId,
        accessToken = accessToken,
        authConfigJson = authConfigJson,
      )
      LitRust.unwrapEnvelope(raw)
    }
    Log.d(TAG, "Auth context created successfully")

    return WalletAuthResult(
      pkpPublicKey = pkpPublicKey,
      pkpEthAddress = pkpEthAddress,
      pkpTokenId = pkpTokenId,
      authMethodType = AUTH_METHOD_TYPE_ETH_WALLET,
      authMethodId = authMethodId,
      accessToken = accessToken,
      eoaAddress = checksumAddress,
    )
  }

  // ── SIWE ──────────────────────────────────────────────────────────

  private suspend fun createSiweAuthSig(checksumAddress: String): String {
    val domain = "dotheaven.org"
    val uri = "https://dotheaven.org"
    val issuedAt = Instant.now().toString()
    val expiration = Instant.now().plus(24, ChronoUnit.HOURS).toString()
    val nonce = generateNonce()

    val siweMessage = buildString {
      append("$domain wants you to sign in with your Ethereum account:\n")
      append("$checksumAddress\n")
      append("\n")
      append("Authorize Heaven session\n")
      append("\n")
      append("URI: $uri\n")
      append("Version: 1\n")
      append("Chain ID: 1\n")
      append("Nonce: $nonce\n")
      append("Issued At: $issuedAt\n")
      append("Expiration Time: $expiration")
    }

    val signature = personalSign(siweMessage, checksumAddress)

    val authSig = JSONObject()
      .put("sig", signature)
      .put("derivedVia", "web3.eth.personal.sign")
      .put("signedMessage", siweMessage)
      .put("address", checksumAddress)

    return authSig.toString()
  }

  // ── Lit relayer ───────────────────────────────────────────────────

  private suspend fun mintPkpViaRelayer(address: String, litNetwork: String): JSONObject =
    withContext(Dispatchers.IO) {
      val payload = JSONObject()
        .put("userAddress", address)
        .put("litNetwork", litNetwork)
        .toString()
        .toRequestBody(JSON_MT)

      val req = okhttp3.Request.Builder()
        .url("$LIT_RELAYER_URL/api/mint-user-pkp")
        .post(payload)
        .header("Content-Type", "application/json")
        .build()

      httpClient.newCall(req).execute().use { resp ->
        val body = resp.body?.string().orEmpty()
        if (!resp.isSuccessful) {
          val err = runCatching { JSONObject(body).optString("error", body) }.getOrDefault(body)
          throw IllegalStateException("PKP mint failed (${resp.code}): $err")
        }
        JSONObject(body)
      }
    }

  private suspend fun lookupExistingPkp(
    litNetwork: String,
    litRpcUrl: String,
    authMethodId: String,
  ): JSONObject? = withContext(Dispatchers.IO) {
    try {
      val raw = LitRust.viewPkpsByAuthDataRaw(
        network = litNetwork,
        rpcUrl = litRpcUrl,
        authMethodType = AUTH_METHOD_TYPE_ETH_WALLET,
        authMethodId = authMethodId,
        limit = 1,
        offset = 0,
      )
      val result = LitRust.unwrapEnvelope(raw)
      val pkps = result.optJSONArray("pkps")
      if (pkps != null && pkps.length() > 0) {
        val pkp = pkps.getJSONObject(0)
        JSONObject()
          .put("pkpPublicKey", pkp.optString("pubkey", pkp.optString("publicKey", "")))
          .put("pkpEthAddress", pkp.optString("ethAddress", pkp.optString("eth_address", "")))
          .put("pkpTokenId", pkp.optString("tokenId", pkp.optString("token_id", "")))
      } else {
        null
      }
    } catch (e: Exception) {
      Log.w(TAG, "PKP lookup failed, will mint new: ${e.message}")
      null
    }
  }

  // ── Crypto helpers ────────────────────────────────────────────────

  private fun deriveEoaAuthMethodId(checksumAddress: String): String {
    val input = "$checksumAddress:lit"
    val hash = org.bouncycastle.jcajce.provider.digest.Keccak.Digest256().digest(
      input.toByteArray(Charsets.UTF_8),
    )
    return "0x" + hash.joinToString("") { "%02x".format(it) }
  }

  private fun generateNonce(): String {
    val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return (1..16).map { chars.random() }.joinToString("")
  }
}
