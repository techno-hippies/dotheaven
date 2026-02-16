package com.pirate.app.lit

import android.content.Context
import com.pirate.app.auth.PirateAuthUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Process-local coordinator for native Lit auth context creation.
 *
 * The native bridge caches a single auth context in memory and rejects executeJs calls
 * if the cached context is missing or mismatched for network/rpc/pkp.
 */
object LitAuthContextManager {
  private data class CacheKey(
    val network: String,
    val rpcUrl: String,
    val pkpPublicKey: String,
    val authMethodType: Int,
    val authMethodId: String,
    val accessToken: String,
    val passkeyRpId: String,
  )

  private val mutex = Mutex()

  @Volatile
  private var cachedKey: CacheKey? = null

  suspend fun ensureFromState(
    state: PirateAuthUiState,
    forceRefresh: Boolean = false,
  ) {
    val key = buildCacheKey(state)
    mutex.withLock {
      if (!forceRefresh && cachedKey == key) return

      val authConfigJson = PirateAuthConfig.defaultAuthConfigJson(key.passkeyRpId)
      try {
        withContext(Dispatchers.IO) {
          val raw = LitRust.createAuthContextFromPasskeyCallbackRaw(
            network = key.network,
            rpcUrl = key.rpcUrl,
            pkpPublicKey = key.pkpPublicKey,
            authMethodType = key.authMethodType,
            authMethodId = key.authMethodId,
            accessToken = key.accessToken,
            authConfigJson = authConfigJson,
          )
          LitRust.unwrapEnvelope(raw)
        }
      } catch (error: Throwable) {
        cachedKey = null
        if (isExpiredAuthChallengeError(error)) {
          throw IllegalStateException("Lit auth session expired; please sign in again", error)
        }
        throw error
      }
      cachedKey = key
    }
  }

  suspend fun ensureFromSavedState(
    context: Context,
    forceRefresh: Boolean = false,
  ) {
    val state = PirateAuthUiState.load(context)
    ensureFromState(state, forceRefresh = forceRefresh)
  }

  suspend fun <T> runWithStateRecovery(
    state: PirateAuthUiState,
    block: suspend () -> T,
  ): T {
    ensureFromState(state)
    return try {
      block()
    } catch (error: Throwable) {
      if (!isMissingOrMismatchedContextError(error)) throw error
      ensureFromState(state, forceRefresh = true)
      block()
    }
  }

  suspend fun <T> runWithSavedStateRecovery(
    context: Context,
    block: suspend () -> T,
  ): T {
    val state = PirateAuthUiState.load(context)
    return runWithStateRecovery(state, block)
  }

  fun invalidateCache() {
    cachedKey = null
  }

  fun isMissingOrMismatchedContextError(error: Throwable): Boolean {
    val msg = collectMessages(error)
    return msg.contains("no auth context cached") ||
      msg.contains("create authcontext first") ||
      msg.contains("cached auth context does not match requested network/rpcurl") ||
      msg.contains("publickey does not match cached auth context pkp")
  }

  fun isExpiredAuthChallengeError(error: Throwable): Boolean {
    val msg = collectMessages(error)
    return msg.contains("invalid blockhash used as challenge")
  }

  private fun collectMessages(error: Throwable): String {
    val parts = ArrayList<String>(4)
    var cur: Throwable? = error
    while (cur != null) {
      cur.message?.lowercase()?.let { parts.add(it) }
      cur = cur.cause
    }
    return parts.joinToString("\n")
  }

  private fun buildCacheKey(state: PirateAuthUiState): CacheKey {
    val pkpPublicKey = state.pkpPublicKey?.trim().orEmpty()
    val authMethodType = state.authMethodType
    val authMethodId = state.authMethodId?.trim().orEmpty()
    val accessToken = state.accessToken?.trim().orEmpty()
    if (pkpPublicKey.isEmpty() || authMethodType == null || authMethodId.isEmpty() || accessToken.isEmpty()) {
      throw IllegalStateException("Missing auth data required to create Lit auth context")
    }

    return CacheKey(
      network = state.litNetwork.trim(),
      rpcUrl = state.litRpcUrl.trim(),
      pkpPublicKey = pkpPublicKey,
      authMethodType = authMethodType,
      authMethodId = authMethodId,
      accessToken = accessToken,
      passkeyRpId = state.passkeyRpId.trim().lowercase(),
    )
  }
}
