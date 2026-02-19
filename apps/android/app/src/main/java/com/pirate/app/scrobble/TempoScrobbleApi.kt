package com.pirate.app.scrobble

import android.app.Activity
import com.pirate.app.music.TrackIds
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.FunctionReturnDecoder
import org.web3j.abi.TypeReference
import org.web3j.abi.datatypes.Address
import org.web3j.abi.datatypes.DynamicArray
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Type
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
  private data class SubmissionOutcome(
    val txHash: String,
    val submittedFresh: Boolean,
  )

  private data class SessionCallSubmission(
    val txHash: String,
    val usedSelfPayFallback: Boolean,
  )

  /** `SCROBBLE_V4` from `contracts/tempo/.env` */
  const val SCROBBLE_V4 = "0xe00e82086480E61AaC8d5ad8B05B56A582dD0000"

  private const val GAS_LIMIT_SCROBBLE_ONLY = 420_000L
  private const val GAS_LIMIT_REGISTER_AND_SCROBBLE = 900_000L
  private const val GAS_LIMIT_SET_TRACK_COVER = 320_000L
  private const val GAS_LIMIT_SET_TRACK_LYRICS = 340_000L
  private const val GAS_LIMIT_BUFFER = 250_000L
  private const val MAX_TRACK_REF_BYTES = 128
  private const val SELECTOR_SET_TRACK_COVER_FOR = "886599ab"
  private const val SELECTOR_SET_TRACK_LYRICS_FOR = "a911a251"
  private val SCROBBLE_EXPIRING_NONCE_KEY = ByteArray(32) { 0xFF.toByte() } // TIP-1009 nonceKey=uint256.max
  private const val SCROBBLE_EXPIRY_WINDOW_SEC = 25L
  private const val MAX_UNDERPRICED_RETRIES = 4
  private const val RETRY_DELAY_MS = 220L
  private const val RELAY_MIN_PRIORITY_FEE_PER_GAS = 6_000_000_000L
  private const val RELAY_MIN_MAX_FEE_PER_GAS = 120_000_000_000L

  private val lastBidByAddress = mutableMapOf<String, TempoClient.Eip1559Fees>()
  private val supportCacheLock = Any()
  @Volatile private var cachedSetTrackCoverForSupport: Boolean? = null
  @Volatile private var cachedSetTrackLyricsForSupport: Boolean? = null

  private val jsonType = "application/json; charset=utf-8".toMediaType()
  private val client = OkHttpClient()
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
    val safeTitle = truncateUtf8(input.title.trim(), maxBytes = 128)
    val safeArtist = truncateUtf8(input.artist.trim(), maxBytes = 128)
    val safeAlbum = truncateUtf8(input.album.orEmpty().trim(), maxBytes = 128)

    if (safeTitle.isBlank() || safeArtist.isBlank()) {
      return TempoScrobbleSubmitResult(success = false, error = "title/artist required")
    }

    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val parts = TrackIds.computeMetaParts(safeTitle, safeArtist, safeAlbum)
      val trackIdHex = "0x${P256Utils.bytesToHex(parts.trackId)}"
      val isRegistered = withContext(Dispatchers.IO) { isTrackRegistered(trackIdHex) }

      val callData =
        if (isRegistered) {
          encodeScrobbleBatch(
            user = account.address,
            trackIds = listOf(trackIdHex),
            timestamps = listOf(input.playedAtSec.coerceAtLeast(0L)),
          )
        } else {
          encodeRegisterAndScrobbleBatch(
            user = account.address,
            kind = parts.kind,
            payloadBytes32 = parts.payload,
            title = safeTitle,
            artist = safeArtist,
            album = safeAlbum,
            durationSec = input.durationSec.coerceAtLeast(0),
            trackId = trackIdHex,
            timestamp = input.playedAtSec.coerceAtLeast(0L),
          )
        }

      val gasLimit = withContext(Dispatchers.IO) {
        val estimated =
          estimateGas(
            from = account.address,
            to = SCROBBLE_V4,
            data = callData,
          )
        val minLimit = if (isRegistered) GAS_LIMIT_SCROBBLE_ONLY else GAS_LIMIT_REGISTER_AND_SCROBBLE
        withBuffer(estimated = estimated, minimum = minLimit)
      }

      var fees = withContext(Dispatchers.IO) {
        val suggested = TempoClient.getSuggestedFees()
        withAddressBidFloor(account.address, withRelayMinimumFeeFloor(suggested))
      }

      var txHash: String? = null
      var lastError: Throwable? = null
      for (attempt in 0..MAX_UNDERPRICED_RETRIES) {
        val tx =
          TempoTransaction.UnsignedTx(
            nonceKeyBytes = SCROBBLE_EXPIRING_NONCE_KEY,
            nonce = 0L,
            validBeforeSec = nowSec() + SCROBBLE_EXPIRY_WINDOW_SEC,
            maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
            maxFeePerGas = fees.maxFeePerGas,
            feeMode = TempoTransaction.FeeMode.RELAY_SPONSORED,
            gasLimit = gasLimit,
            calls =
              listOf(
                TempoTransaction.Call(
                  to = P256Utils.hexToBytes(SCROBBLE_V4),
                  value = 0,
                  input = P256Utils.hexToBytes(callData),
                ),
              ),
          )

        val sigHash = TempoTransaction.signatureHash(tx)
        val assertion =
          TempoPasskeyManager.sign(
            activity = activity,
            challenge = sigHash,
            account = account,
            rpId = account.rpId,
          )
        val signedTxHex = TempoTransaction.encodeSignedWebAuthn(tx, assertion)

        val submitted = withContext(Dispatchers.IO) {
          runCatching {
            TempoClient.sendSponsoredRawTransaction(
              signedTxHex = signedTxHex,
              senderAddress = account.address,
            )
          }
        }
        val hash = submitted.getOrNull()
        if (!hash.isNullOrBlank()) {
          txHash = hash
          rememberAddressBidFloor(account.address, fees)
          break
        }
        val err = submitted.exceptionOrNull() ?: IllegalStateException("Unknown tx submission failure")
        lastError = err
        if (!isReplacementUnderpriced(err)) throw err
        if (attempt >= MAX_UNDERPRICED_RETRIES) break
        fees = withAddressBidFloor(account.address, withRelayMinimumFeeFloor(aggressivelyBumpFees(fees)))
        rememberAddressBidFloor(account.address, fees)
        delay(RETRY_DELAY_MS)
      }

      val canonicalTxHash = txHash ?: throw (lastError ?: IllegalStateException("Tempo scrobble tx failed"))
      val receipt = awaitScrobbleReceipt(canonicalTxHash)
      if (!receipt.isSuccess) {
        throw IllegalStateException("Scrobble tx reverted on-chain: ${receipt.txHash}")
      }

      TempoScrobbleSubmitResult(
        success = true,
        txHash = canonicalTxHash,
        trackId = trackIdHex,
        usedRegisterPath = !isRegistered,
        pendingConfirmation = false,
        usedSelfPayFallback = false,
      )
    }.getOrElse { err ->
      TempoScrobbleSubmitResult(
        success = false,
        error = err.message ?: "Tempo scrobble tx failed",
      )
    }
  }

  suspend fun submitScrobble(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    input: TempoScrobbleInput,
  ): TempoScrobbleSubmitResult {
    val safeTitle = truncateUtf8(input.title.trim(), maxBytes = 128)
    val safeArtist = truncateUtf8(input.artist.trim(), maxBytes = 128)
    val safeAlbum = truncateUtf8(input.album.orEmpty().trim(), maxBytes = 128)

    if (safeTitle.isBlank() || safeArtist.isBlank()) {
      return TempoScrobbleSubmitResult(success = false, error = "title/artist required")
    }

    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val parts = TrackIds.computeMetaParts(safeTitle, safeArtist, safeAlbum)
      val trackIdHex = "0x${P256Utils.bytesToHex(parts.trackId)}"
      val isRegistered = withContext(Dispatchers.IO) { isTrackRegistered(trackIdHex) }

      val callData =
        if (isRegistered) {
          encodeScrobbleBatch(
            user = account.address,
            trackIds = listOf(trackIdHex),
            timestamps = listOf(input.playedAtSec.coerceAtLeast(0L)),
          )
        } else {
          encodeRegisterAndScrobbleBatch(
            user = account.address,
            kind = parts.kind,
            payloadBytes32 = parts.payload,
            title = safeTitle,
            artist = safeArtist,
            album = safeAlbum,
            durationSec = input.durationSec.coerceAtLeast(0),
            trackId = trackIdHex,
            timestamp = input.playedAtSec.coerceAtLeast(0L),
          )
        }

      val gasLimit = withContext(Dispatchers.IO) {
        val estimated =
          estimateGas(
            from = account.address,
            to = SCROBBLE_V4,
            data = callData,
          )
        val minLimit = if (isRegistered) GAS_LIMIT_SCROBBLE_ONLY else GAS_LIMIT_REGISTER_AND_SCROBBLE
        withBuffer(estimated = estimated, minimum = minLimit)
      }

      val fees = withContext(Dispatchers.IO) {
        val suggested = TempoClient.getSuggestedFees()
        val floored = withRelayMinimumFeeFloor(suggested)
        withAddressBidFloor(account.address, floored)
      }
      fun buildTx(
        feeMode: TempoTransaction.FeeMode,
        txFees: TempoClient.Eip1559Fees,
      ): TempoTransaction.UnsignedTx =
        TempoTransaction.UnsignedTx(
          nonceKeyBytes = SCROBBLE_EXPIRING_NONCE_KEY,
          nonce = 0L,
          validBeforeSec = nowSec() + SCROBBLE_EXPIRY_WINDOW_SEC,
          maxPriorityFeePerGas = txFees.maxPriorityFeePerGas,
          maxFeePerGas = txFees.maxFeePerGas,
          feeMode = feeMode,
          gasLimit = gasLimit,
          calls =
            listOf(
              TempoTransaction.Call(
                to = P256Utils.hexToBytes(SCROBBLE_V4),
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

        repeat(MAX_UNDERPRICED_RETRIES + 1) { attempt ->
          val tx = buildTx(feeMode, feesForAttempt)
          val sigHash = TempoTransaction.signatureHash(tx)
          val keychainSig =
            SessionKeyManager.signWithSessionKey(
              sessionKey = sessionKey,
              userAddress = account.address,
              txHash = sigHash,
            )
          val signedTxHex = TempoTransaction.encodeSignedSessionKey(tx, keychainSig)

          val result = withContext(Dispatchers.IO) {
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
          if (attempt >= MAX_UNDERPRICED_RETRIES) return@repeat

          feesForAttempt = aggressivelyBumpFees(feesForAttempt)
          if (feeMode == TempoTransaction.FeeMode.RELAY_SPONSORED) {
            feesForAttempt = withRelayMinimumFeeFloor(feesForAttempt)
          }
          rememberAddressBidFloor(account.address, feesForAttempt)
          delay(RETRY_DELAY_MS)
        }

        throw lastUnderpriced ?: IllegalStateException("replacement transaction underpriced")
      }

      var usedSelfPayFallback = false
      var selfPayFeesUsed: TempoClient.Eip1559Fees? = null
      var submission = runCatching {
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

      var canonicalTxHash = submission.txHash
      if (!submission.submittedFresh) {
        throw IllegalStateException(
          "Scrobble submission not fresh at $canonicalTxHash; replacement rejected (underpriced)." +
            " gas=$gasLimit relay=${fees.maxPriorityFeePerGas}/${fees.maxFeePerGas}" +
            " self=${selfPayFeesUsed?.maxPriorityFeePerGas ?: 0L}/${selfPayFeesUsed?.maxFeePerGas ?: 0L}",
        )
      }

      val receipt = awaitScrobbleReceipt(canonicalTxHash)
      if (!receipt.isSuccess) {
        throw IllegalStateException("Scrobble tx reverted on-chain: ${receipt.txHash}")
      }
      TempoScrobbleSubmitResult(
        success = true,
        txHash = canonicalTxHash,
        trackId = trackIdHex,
        usedRegisterPath = !isRegistered,
        pendingConfirmation = false,
        usedSelfPayFallback = usedSelfPayFallback,
      )
    }.getOrElse { err ->
      TempoScrobbleSubmitResult(
        success = false,
        error = err.message ?: "Tempo scrobble tx failed",
      )
    }
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
      submitSessionKeyContractCall(
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
      submitSessionKeyContractCall(
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

  private fun encodeScrobbleBatch(
    user: String,
    trackIds: List<String>,
    timestamps: List<Long>,
  ): String {
    val function =
      Function(
        "scrobbleBatch",
        listOf(
          Address(user),
          DynamicArray(Bytes32::class.java, trackIds.map { id -> Bytes32(P256Utils.hexToBytes(id)) }),
          DynamicArray(Uint64::class.java, timestamps.map { ts -> Uint64(ts.coerceAtLeast(0L)) }),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeRegisterAndScrobbleBatch(
    user: String,
    kind: Int,
    payloadBytes32: ByteArray,
    title: String,
    artist: String,
    album: String,
    durationSec: Int,
    trackId: String,
    timestamp: Long,
  ): String {
    val function =
      Function(
        "registerAndScrobbleBatch",
        listOf(
          Address(user),
          DynamicArray(Uint8::class.java, listOf(Uint8(kind.toLong().coerceAtLeast(0L)))),
          DynamicArray(Bytes32::class.java, listOf(Bytes32(payloadBytes32))),
          DynamicArray(Utf8String::class.java, listOf(Utf8String(title))),
          DynamicArray(Utf8String::class.java, listOf(Utf8String(artist))),
          DynamicArray(Utf8String::class.java, listOf(Utf8String(album))),
          DynamicArray(Uint32::class.java, listOf(Uint32(durationSec.coerceAtLeast(0).toLong()))),
          DynamicArray(Bytes32::class.java, listOf(Bytes32(P256Utils.hexToBytes(trackId)))),
          DynamicArray(Uint64::class.java, listOf(Uint64(timestamp.coerceAtLeast(0L)))),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun isTrackRegistered(trackId: String): Boolean {
    val callData =
      FunctionEncoder.encode(
        Function(
          "isRegistered",
          listOf(Bytes32(P256Utils.hexToBytes(trackId))),
          emptyList(),
        ),
      )
    val result = ethCall(SCROBBLE_V4, callData)
    val clean = result.removePrefix("0x").ifBlank { "0" }
    return clean.toBigIntegerOrNull(16)?.let { it != java.math.BigInteger.ZERO } ?: false
  }

  private suspend fun submitSessionKeyContractCall(
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
            to = SCROBBLE_V4,
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
        nonceKeyBytes = SCROBBLE_EXPIRING_NONCE_KEY,
        nonce = 0L,
        validBeforeSec = nowSec() + SCROBBLE_EXPIRY_WINDOW_SEC,
        maxPriorityFeePerGas = txFees.maxPriorityFeePerGas,
        maxFeePerGas = txFees.maxFeePerGas,
        feeMode = feeMode,
        gasLimit = gasLimit,
        calls =
          listOf(
            TempoTransaction.Call(
              to = P256Utils.hexToBytes(SCROBBLE_V4),
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

      repeat(MAX_UNDERPRICED_RETRIES + 1) { attempt ->
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
        if (attempt >= MAX_UNDERPRICED_RETRIES) return@repeat

        feesForAttempt = aggressivelyBumpFees(feesForAttempt)
        if (feeMode == TempoTransaction.FeeMode.RELAY_SPONSORED) {
          feesForAttempt = withRelayMinimumFeeFloor(feesForAttempt)
        }
        rememberAddressBidFloor(account.address, feesForAttempt)
        delay(RETRY_DELAY_MS)
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

  private fun ethGetCode(contractAddress: String): String {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", "eth_getCode")
        .put(
          "params",
          JSONArray()
            .put(contractAddress)
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

  private fun contractRuntimeContainsSelector(selectorHex: String): Boolean {
    val runtime = ethGetCode(SCROBBLE_V4).removePrefix("0x").lowercase()
    if (runtime.isBlank()) return false
    return runtime.contains(selectorHex.lowercase())
  }

  private fun estimateGas(
    from: String,
    to: String,
    data: String,
  ): Long {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", "eth_estimateGas")
        .put(
          "params",
          JSONArray()
            .put(
              JSONObject()
                .put("from", from)
                .put("to", to)
                .put("data", data),
            ),
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
      val hex = body.optString("result", "0x0").removePrefix("0x").ifBlank { "0" }
      return hex.toLongOrNull(16) ?: 0L
    }
  }

  private fun truncateUtf8(value: String, maxBytes: Int): String {
    if (value.isEmpty()) return value
    if (value.toByteArray(Charsets.UTF_8).size <= maxBytes) return value

    var out = value
    while (out.isNotEmpty() && out.toByteArray(Charsets.UTF_8).size > maxBytes) {
      out = out.dropLast(1)
    }
    return out
  }

  private fun isReceiptTimeout(error: Throwable): Boolean =
    error.message?.contains("Timed out waiting for transaction receipt", ignoreCase = true) == true

  private suspend fun awaitScrobbleReceipt(txHash: String): TempoClient.TransactionReceipt {
    val timeoutMs = (SCROBBLE_EXPIRY_WINDOW_SEC + 5L) * 1000L
    val receipt =
      withContext(Dispatchers.IO) {
        try {
          TempoClient.waitForTransactionReceipt(txHash, timeoutMs = timeoutMs)
        } catch (error: Throwable) {
          if (!isReceiptTimeout(error)) throw error
          null
        }
      }
    if (receipt != null) return receipt

    val txStillKnown = withContext(Dispatchers.IO) { TempoClient.hasTransaction(txHash) }
    if (!txStillKnown) {
      throw IllegalStateException("Scrobble tx dropped before inclusion: $txHash")
    }

    delay(2_000L)
    val lateReceipt = withContext(Dispatchers.IO) { TempoClient.getTransactionReceipt(txHash) }
    if (lateReceipt != null) return lateReceipt
    throw IllegalStateException("Scrobble tx not confirmed before expiry: $txHash")
  }

  private fun isReplacementUnderpriced(error: Throwable): Boolean =
    error.message?.contains("replacement transaction underpriced", ignoreCase = true) == true

  private fun decodeUtf8Field(
    decoded: List<Type<*>>,
    index: Int,
  ): String? {
    val value = (decoded.getOrNull(index) as? Utf8String)?.value?.trim().orEmpty()
    return value.ifBlank { null }
  }

  private fun normalizeTrackId(trackId: String): String {
    val clean = trackId.trim().removePrefix("0x").removePrefix("0X")
    require(clean.length == 64 && clean.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
      "Invalid trackId"
    }
    return "0x${clean.lowercase()}"
  }

  private fun normalizeTrackRef(
    value: String,
    fieldName: String,
  ): String {
    val normalized = value.trim()
    require(normalized.isNotEmpty()) { "$fieldName is required" }
    val length = normalized.toByteArray(Charsets.UTF_8).size
    require(length <= MAX_TRACK_REF_BYTES) {
      "$fieldName exceeds max length ($length > $MAX_TRACK_REF_BYTES)"
    }
    return normalized
  }

  private fun isTrackNotRegistered(error: Throwable): Boolean {
    val message = error.message?.trim()?.lowercase().orEmpty()
    return message.contains("not registered")
  }

  @Suppress("UNCHECKED_CAST")
  private fun decodeFunctionResult(
    result: String,
    outputs: List<TypeReference<*>>,
  ): List<Type<*>> = FunctionReturnDecoder.decode(result, outputs as List<TypeReference<Type<*>>>)

  private fun applyReplacementFeeFloor(
    suggested: TempoClient.Eip1559Fees,
    existingTx: TempoClient.SenderNonceTransaction?,
  ): TempoClient.Eip1559Fees {
    if (existingTx == null || existingTx.isMined) return suggested

    val existingPriority = existingTx.maxPriorityFeePerGas ?: existingTx.gasPrice ?: 0L
    val existingMaxFee = existingTx.maxFeePerGas ?: existingTx.gasPrice ?: 0L
    val existingBid = maxOf(existingTx.gasPrice ?: 0L, existingMaxFee)
    if (existingPriority <= 0L && existingMaxFee <= 0L && existingBid <= 0L) return suggested

    // Stuck nonce replacement on Tempo occasionally requires a much stronger bid than a
    // standard 10-25% bump. We floor to ~2x the prior gas bid to force acceptance.
    val minPriority = maxOf(bumpForReplacement(existingPriority), saturatingMul(existingBid, 2))
    val minMaxFee = maxOf(bumpForReplacement(existingMaxFee), saturatingMul(existingBid, 2))

    val priority = maxOf(suggested.maxPriorityFeePerGas, minPriority)
    val maxFee = maxOf(
      suggested.maxFeePerGas,
      minMaxFee,
      saturatingAdd(priority, 1_000_000L),
    )
    return TempoClient.Eip1559Fees(
      maxPriorityFeePerGas = priority,
      maxFeePerGas = maxFee,
    )
  }

  private fun bumpForReplacement(value: Long): Long {
    if (value <= 0L) return value
    val twentyFivePercent = maxOf(1L, value / 4L)
    return saturatingAdd(value, twentyFivePercent)
  }

  private fun saturatingAdd(a: Long, b: Long): Long =
    if (Long.MAX_VALUE - a < b) Long.MAX_VALUE else a + b

  private fun saturatingMul(a: Long, factor: Int): Long =
    if (a > Long.MAX_VALUE / factor) Long.MAX_VALUE else a * factor

  private fun aggressivelyBumpFees(fees: TempoClient.Eip1559Fees): TempoClient.Eip1559Fees {
    val priority = maxOf(bumpForReplacement(fees.maxPriorityFeePerGas), saturatingMul(fees.maxPriorityFeePerGas, 2))
    val maxFee = maxOf(
      bumpForReplacement(fees.maxFeePerGas),
      saturatingMul(fees.maxFeePerGas, 2),
      saturatingAdd(priority, 1_000_000L),
    )
    return TempoClient.Eip1559Fees(maxPriorityFeePerGas = priority, maxFeePerGas = maxFee)
  }

  private fun withRelayMinimumFeeFloor(fees: TempoClient.Eip1559Fees): TempoClient.Eip1559Fees {
    val priority = maxOf(fees.maxPriorityFeePerGas, RELAY_MIN_PRIORITY_FEE_PER_GAS)
    val maxFee = maxOf(
      fees.maxFeePerGas,
      RELAY_MIN_MAX_FEE_PER_GAS,
      saturatingAdd(priority, 1_000_000L),
    )
    return TempoClient.Eip1559Fees(maxPriorityFeePerGas = priority, maxFeePerGas = maxFee)
  }

  private fun withAddressBidFloor(
    address: String,
    fees: TempoClient.Eip1559Fees,
  ): TempoClient.Eip1559Fees {
    val key = address.trim().lowercase()
    if (key.isBlank()) return fees
    val previous = synchronized(lastBidByAddress) { lastBidByAddress[key] } ?: return fees
    val priority = maxOf(fees.maxPriorityFeePerGas, previous.maxPriorityFeePerGas)
    val maxFee = maxOf(fees.maxFeePerGas, previous.maxFeePerGas, saturatingAdd(priority, 1_000_000L))
    return TempoClient.Eip1559Fees(maxPriorityFeePerGas = priority, maxFeePerGas = maxFee)
  }

  private fun rememberAddressBidFloor(
    address: String,
    fees: TempoClient.Eip1559Fees,
  ) {
    val key = address.trim().lowercase()
    if (key.isBlank()) return
    synchronized(lastBidByAddress) {
      val previous = lastBidByAddress[key]
      if (previous == null) {
        lastBidByAddress[key] = fees
      } else {
        lastBidByAddress[key] =
          TempoClient.Eip1559Fees(
            maxPriorityFeePerGas = maxOf(previous.maxPriorityFeePerGas, fees.maxPriorityFeePerGas),
            maxFeePerGas = maxOf(previous.maxFeePerGas, fees.maxFeePerGas),
          )
      }
    }
  }

  private fun withBuffer(
    estimated: Long,
    minimum: Long,
  ): Long {
    if (estimated <= 0L) return minimum
    val padded = saturatingAdd(saturatingMul(estimated, 3) / 2, GAS_LIMIT_BUFFER)
    return maxOf(minimum, padded)
  }

  private fun nowSec(): Long = System.currentTimeMillis() / 1000L
}
