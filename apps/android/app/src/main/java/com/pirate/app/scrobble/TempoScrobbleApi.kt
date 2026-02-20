package com.pirate.app.scrobble

import android.app.Activity
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.TypeReference
import org.web3j.abi.datatypes.Address
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Uint32
import org.web3j.abi.datatypes.generated.Uint64
import org.web3j.abi.datatypes.generated.Uint8

data class TempoScrobbleInput(
  val artist: String,
  val title: String,
  val album: String?,
  val durationSec: Int,
  val playedAtSec: Long,
)

data class TempoScrobbleSubmitResult(
  val success: Boolean,
  val txHash: String? = null,
  val trackId: String? = null,
  val usedRegisterPath: Boolean = false,
  val pendingConfirmation: Boolean = false,
  val usedSelfPayFallback: Boolean = false,
  val error: String? = null,
)

object TempoScrobbleApi {
  /** `SCROBBLE_V4` from `contracts/tempo/.env` */
  const val SCROBBLE_V4 = "0xe00e82086480E61AaC8d5ad8B05B56A582dD0000"

  private const val GAS_LIMIT_SCROBBLE_ONLY = 420_000L
  private const val GAS_LIMIT_REGISTER_AND_SCROBBLE = 900_000L
  private const val GAS_LIMIT_SET_TRACK_COVER = 320_000L
  private const val GAS_LIMIT_SET_TRACK_LYRICS = 340_000L
  private const val SELECTOR_SET_TRACK_COVER_FOR = "886599ab"
  private const val SELECTOR_SET_TRACK_LYRICS_FOR = "a911a251"
  private val SCROBBLE_EXPIRING_NONCE_KEY = ByteArray(32) { 0xFF.toByte() } // TIP-1009 nonceKey=uint256.max
  private const val SCROBBLE_EXPIRY_WINDOW_SEC = 25L
  private const val MAX_UNDERPRICED_RETRIES = 4
  private const val RETRY_DELAY_MS = 220L

  private val supportCacheLock = Any()
  @Volatile private var cachedSetTrackCoverForSupport: Boolean? = null
  @Volatile private var cachedSetTrackLyricsForSupport: Boolean? = null

  private val getTrackOutputParameters: List<TypeReference<*>> =
    listOf(
      object : TypeReference<Utf8String>() {},
      object : TypeReference<Utf8String>() {},
      object : TypeReference<Utf8String>() {},
      object : TypeReference<Uint8>() {},
      object : TypeReference<Bytes32>() {},
      object : TypeReference<Uint64>() {},
      object : TypeReference<Utf8String>() {},
      object : TypeReference<Uint32>() {},
    )
  private val getTrackLyricsOutputParameters: List<TypeReference<*>> =
    listOf(object : TypeReference<Utf8String>() {})

  suspend fun submitScrobbleWithPasskey(
    activity: Activity,
    account: TempoPasskeyManager.PasskeyAccount,
    input: TempoScrobbleInput,
  ): TempoScrobbleSubmitResult {
    return submitScrobbleWithPasskeyInternal(
      activity = activity,
      account = account,
      input = input,
      contractAddress = SCROBBLE_V4,
      gasLimitScrobbleOnly = GAS_LIMIT_SCROBBLE_ONLY,
      gasLimitRegisterAndScrobble = GAS_LIMIT_REGISTER_AND_SCROBBLE,
      maxUnderpricedRetries = MAX_UNDERPRICED_RETRIES,
      retryDelayMs = RETRY_DELAY_MS,
      expiringNonceKey = SCROBBLE_EXPIRING_NONCE_KEY,
      expiryWindowSec = SCROBBLE_EXPIRY_WINDOW_SEC,
    )
  }

  suspend fun submitScrobble(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    input: TempoScrobbleInput,
  ): TempoScrobbleSubmitResult {
    return submitScrobbleWithSessionKeyInternal(
      account = account,
      sessionKey = sessionKey,
      input = input,
      gasLimitScrobbleOnly = GAS_LIMIT_SCROBBLE_ONLY,
      gasLimitRegisterAndScrobble = GAS_LIMIT_REGISTER_AND_SCROBBLE,
    )
  }

  suspend fun readTrackCoverRef(trackId: String): String? {
    val normalizedTrackId = normalizeTrackId(trackId)
    return withContext(Dispatchers.IO) {
      val callData =
        FunctionEncoder.encode(
          Function(
            "getTrack",
            listOf(Bytes32(P256Utils.hexToBytes(normalizedTrackId))),
            getTrackOutputParameters,
          ),
        )
      try {
        val result = ethCall(SCROBBLE_V4, callData)
        val decoded = decodeFunctionResult(result, getTrackOutputParameters)
        decodeUtf8Field(decoded, index = 6)
      } catch (err: Throwable) {
        if (isTrackNotRegistered(err)) null else throw err
      }
    }
  }

  suspend fun readTrackLyricsRef(trackId: String): String? {
    val normalizedTrackId = normalizeTrackId(trackId)
    return withContext(Dispatchers.IO) {
      val callData =
        FunctionEncoder.encode(
          Function(
            "getTrackLyrics",
            listOf(Bytes32(P256Utils.hexToBytes(normalizedTrackId))),
            getTrackLyricsOutputParameters,
          ),
        )
      val result = ethCall(SCROBBLE_V4, callData)
      val decoded = decodeFunctionResult(result, getTrackLyricsOutputParameters)
      decodeUtf8Field(decoded, index = 0)
    }
  }

  suspend fun ensureTrackCoverSynced(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    trackId: String,
    coverRef: String,
  ): String {
    if (!contractSupportsSetTrackCoverFor()) {
      throw IllegalStateException(
        "Track cover sync unavailable: contract $SCROBBLE_V4 does not expose setTrackCoverFor(address,bytes32,string)",
      )
    }
    val normalizedTrackId = normalizeTrackId(trackId)
    val normalizedCoverRef = normalizeTrackRef(coverRef, fieldName = "coverRef")

    val registered = withContext(Dispatchers.IO) { isTrackRegistered(normalizedTrackId) }
    if (!registered) {
      throw IllegalStateException("track not registered")
    }

    val existing = readTrackCoverRef(normalizedTrackId)
    if (!existing.isNullOrBlank()) return existing

    val callData =
      FunctionEncoder.encode(
        Function(
          "setTrackCoverFor",
          listOf(
            Address(account.address),
            Bytes32(P256Utils.hexToBytes(normalizedTrackId)),
            Utf8String(normalizedCoverRef),
          ),
          emptyList(),
        ),
      )

    val submission =
      submitScrobbleSessionKeyContractCall(
        account = account,
        sessionKey = sessionKey,
        callData = callData,
        minimumGasLimit = GAS_LIMIT_SET_TRACK_COVER,
      )
    val receipt = awaitScrobbleReceipt(submission.txHash)
    if (!receipt.isSuccess) {
      val afterRevert = runCatching { readTrackCoverRef(normalizedTrackId) }.getOrNull()
      if (!afterRevert.isNullOrBlank()) return afterRevert
      throw IllegalStateException("Track cover tx reverted on-chain: ${receipt.txHash}")
    }

    val synced = runCatching { readTrackCoverRef(normalizedTrackId) }.getOrNull()
    return synced ?: normalizedCoverRef
  }

  suspend fun ensureTrackLyricsSynced(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    trackId: String,
    lyricsRef: String,
  ): String {
    if (!contractSupportsSetTrackLyricsFor()) {
      throw IllegalStateException(
        "Track lyrics sync unavailable: contract $SCROBBLE_V4 does not expose setTrackLyricsFor(address,bytes32,string)",
      )
    }
    val normalizedTrackId = normalizeTrackId(trackId)
    val normalizedLyricsRef = normalizeTrackRef(lyricsRef, fieldName = "lyricsRef")

    val registered = withContext(Dispatchers.IO) { isTrackRegistered(normalizedTrackId) }
    if (!registered) {
      throw IllegalStateException("track not registered")
    }

    val existing = readTrackLyricsRef(normalizedTrackId)
    if (!existing.isNullOrBlank()) return existing

    val callData =
      FunctionEncoder.encode(
        Function(
          "setTrackLyricsFor",
          listOf(
            Address(account.address),
            Bytes32(P256Utils.hexToBytes(normalizedTrackId)),
            Utf8String(normalizedLyricsRef),
          ),
          emptyList(),
        ),
      )

    val submission =
      submitScrobbleSessionKeyContractCall(
        account = account,
        sessionKey = sessionKey,
        callData = callData,
        minimumGasLimit = GAS_LIMIT_SET_TRACK_LYRICS,
      )
    val receipt = awaitScrobbleReceipt(submission.txHash)
    if (!receipt.isSuccess) {
      val afterRevert = runCatching { readTrackLyricsRef(normalizedTrackId) }.getOrNull()
      if (!afterRevert.isNullOrBlank()) return afterRevert
      throw IllegalStateException("Track lyrics tx reverted on-chain: ${receipt.txHash}")
    }

    val synced = runCatching { readTrackLyricsRef(normalizedTrackId) }.getOrNull()
    return synced ?: normalizedLyricsRef
  }

  suspend fun getTrackCoverRef(trackId: String): String? = readTrackCoverRef(trackId)

  suspend fun getTrackLyricsRef(trackId: String): String? = readTrackLyricsRef(trackId)

  suspend fun contractSupportsSetTrackCoverFor(): Boolean {
    val cached = cachedSetTrackCoverForSupport
    if (cached != null) return cached
    return withContext(Dispatchers.IO) {
      val supports = contractRuntimeContainsSelector(SELECTOR_SET_TRACK_COVER_FOR)
      synchronized(supportCacheLock) {
        cachedSetTrackCoverForSupport = supports
      }
      supports
    }
  }

  suspend fun contractSupportsSetTrackLyricsFor(): Boolean {
    val cached = cachedSetTrackLyricsForSupport
    if (cached != null) return cached
    return withContext(Dispatchers.IO) {
      val supports = contractRuntimeContainsSelector(SELECTOR_SET_TRACK_LYRICS_FOR)
      synchronized(supportCacheLock) {
        cachedSetTrackLyricsForSupport = supports
      }
      supports
    }
  }

}
