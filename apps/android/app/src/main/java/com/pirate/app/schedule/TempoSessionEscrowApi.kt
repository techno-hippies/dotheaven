package com.pirate.app.schedule

import android.util.Log
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoTransaction
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.bouncycastle.jcajce.provider.digest.Keccak
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.generated.Uint256

private enum class EscrowBookingStatus(val code: Int) {
  None(0),
  Booked(1),
  Cancelled(2),
  Attested(3),
  Disputed(4),
  Resolved(5),
  Finalized(6),
}

private enum class EscrowSlotStatus(val code: Int) {
  Open(0),
  Booked(1),
  Cancelled(2),
  Settled(3),
}

private data class EscrowBooking(
  val id: Long,
  val slotId: Long,
  val guest: String,
  val amountRaw: BigInteger,
  val status: EscrowBookingStatus,
)

private data class EscrowSlot(
  val id: Long,
  val host: String,
  val startTimeSec: Long,
  val durationMins: Int,
  val priceRaw: BigInteger,
  val status: EscrowSlotStatus,
)

data class UpcomingBooking(
  val bookingId: Long,
  val counterpartyAddress: String,
  val startTimeSec: Long,
  val durationMins: Int,
  val isHost: Boolean,
  val amountUsd: String,
  val isLive: Boolean,
)

enum class HostSlotStatus {
  Open,
  Booked,
  Cancelled,
  Settled,
}

data class HostAvailabilitySlot(
  val slotId: Long,
  val startTimeSec: Long,
  val durationMins: Int,
  val status: HostSlotStatus,
  val priceUsd: String,
)

data class EscrowTxResult(
  val success: Boolean,
  val txHash: String? = null,
  val usedSelfPayFallback: Boolean = false,
  val error: String? = null,
)

object TempoSessionEscrowApi {
  private const val TAG = "TempoSessionEscrowApi"
  private const val RPC_URL = TempoClient.RPC_URL
  private const val ESCROW_ADDRESS = TempoClient.SESSION_ESCROW_V1
  private const val MAX_BOOKING_SCAN = 300
  private const val MAX_SLOT_SCAN = 400

  private const val GAS_LIMIT_BUFFER = 250_000L
  private const val GAS_LIMIT_MAX = 3_000_000L
  private const val GAS_LIMIT_SET_BASE_PRICE = 180_000L
  private const val GAS_LIMIT_CREATE_SLOT = 260_000L
  private const val GAS_LIMIT_CANCEL_SLOT = 180_000L
  private const val GAS_LIMIT_CANCEL_BOOKING = 220_000L
  // Tempo expiring nonce windows must stay strictly below 30s in practice.
  private const val EXPIRY_WINDOW_SEC = 25L

  private val EXPIRING_NONCE_KEY = ByteArray(32) { 0xFF.toByte() }

  private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
  private val httpClient = OkHttpClient()
  private val rawPerUsd = BigDecimal("1000000")

  suspend fun fetchUpcomingUserBookings(
    userAddress: String,
    maxResults: Int = 20,
  ): List<UpcomingBooking> = withContext(Dispatchers.IO) {
    val user = normalizeAddress(userAddress) ?: return@withContext emptyList()
    val nextBookingId = getNextBookingId() ?: return@withContext emptyList()
    if (nextBookingId <= 1L) return@withContext emptyList()

    val startId = maxOf(1L, nextBookingId - MAX_BOOKING_SCAN)
    val bookingIds = (startId until nextBookingId).toList()
    if (bookingIds.isEmpty()) return@withContext emptyList()

    val bookings = coroutineScope {
      bookingIds.map { id ->
        async { getBooking(id) }
      }.awaitAll()
    }.filterNotNull()
      .filter { it.status != EscrowBookingStatus.None && it.status != EscrowBookingStatus.Finalized }

    if (bookings.isEmpty()) return@withContext emptyList()

    val slotsById = coroutineScope {
      bookings
        .map { it.slotId }
        .distinct()
        .map { slotId ->
          async { slotId to getSlot(slotId) }
        }
        .awaitAll()
        .mapNotNull { (slotId, slot) -> slot?.let { slotId to it } }
        .toMap()
    }

    val nowSec = nowSec()
    val rows = bookings.mapNotNull { booking ->
      val slot = slotsById[booking.slotId] ?: return@mapNotNull null
      val host = normalizeAddress(slot.host) ?: return@mapNotNull null
      val guest = normalizeAddress(booking.guest) ?: return@mapNotNull null
      val isHost = host == user
      val isGuest = guest == user
      if (!isHost && !isGuest) return@mapNotNull null
      if (booking.status != EscrowBookingStatus.Booked) return@mapNotNull null

      val endSec = slot.startTimeSec + slot.durationMins.toLong() * 60L
      if (endSec < nowSec) return@mapNotNull null

      UpcomingBooking(
        bookingId = booking.id,
        counterpartyAddress = if (isHost) guest else host,
        startTimeSec = slot.startTimeSec,
        durationMins = slot.durationMins,
        isHost = isHost,
        amountUsd = formatTokenAmount(booking.amountRaw),
        isLive = nowSec in slot.startTimeSec until endSec,
      )
    }

    rows.sortedBy { it.startTimeSec }.take(maxResults.coerceAtLeast(1))
  }

  suspend fun fetchHostAvailabilitySlots(
    hostAddress: String,
    maxResults: Int = 200,
  ): List<HostAvailabilitySlot> = withContext(Dispatchers.IO) {
    val host = normalizeAddress(hostAddress) ?: return@withContext emptyList()
    val nextSlotId = getNextSlotId() ?: return@withContext emptyList()
    if (nextSlotId <= 1L) return@withContext emptyList()

    val startId = maxOf(1L, nextSlotId - MAX_SLOT_SCAN)
    val slotIds = (startId until nextSlotId).toList()
    if (slotIds.isEmpty()) return@withContext emptyList()

    val slots = coroutineScope {
      slotIds.map { id ->
        async { getSlot(id) }
      }.awaitAll()
    }.filterNotNull()

    val nowSec = nowSec()
    slots
      .asSequence()
      .filter { normalizeAddress(it.host) == host }
      .filter { slot ->
        val endSec = slot.startTimeSec + slot.durationMins.toLong() * 60L
        endSec >= nowSec
      }
      .map { slot ->
        HostAvailabilitySlot(
          slotId = slot.id,
          startTimeSec = slot.startTimeSec,
          durationMins = slot.durationMins,
          status = mapSlotStatus(slot.status),
          priceUsd = formatTokenAmount(slot.priceRaw),
        )
      }
      .sortedBy { it.startTimeSec }
      .take(maxResults.coerceAtLeast(1))
      .toList()
  }

  suspend fun fetchHostBasePriceUsd(hostAddress: String): String? = withContext(Dispatchers.IO) {
    val host = normalizeAddress(hostAddress) ?: return@withContext null
    val data = "0x${functionSelector("hostBasePrice(address)")}${encodeAddressWord(host)}"
    val result = ethCall(data) ?: return@withContext null
    val words = splitWords(result)
    if (words.isEmpty()) return@withContext null
    val raw = parseWordUint(words[0])
    if (raw <= BigInteger.ZERO) return@withContext null
    formatTokenAmount(raw)
  }

  suspend fun setHostBasePrice(
    userAddress: String,
    sessionKey: SessionKeyManager.SessionKey,
    priceUsd: String,
  ): EscrowTxResult {
    val priceRaw = parseUsdToRaw(priceUsd)
      ?: return EscrowTxResult(success = false, error = "Enter a valid positive base price.")

    val callData = encodeFunctionCall(
      signature = "setHostBasePrice(uint256)",
      uintArgs = listOf(priceRaw),
    )
    return submitEscrowWrite(
      userAddress = userAddress,
      sessionKey = sessionKey,
      callData = callData,
      minimumGasLimit = GAS_LIMIT_SET_BASE_PRICE,
      opLabel = "set base price",
    )
  }

  suspend fun createSlot(
    userAddress: String,
    sessionKey: SessionKeyManager.SessionKey,
    startTimeSec: Long,
    durationMins: Int,
    graceMins: Int,
    minOverlapMins: Int,
    cancelCutoffMins: Int,
  ): EscrowTxResult {
    if (durationMins <= 0) return EscrowTxResult(success = false, error = "Duration must be positive.")
    if (startTimeSec <= nowSec()) return EscrowTxResult(success = false, error = "Slot start time must be in the future.")

    val callData = encodeFunctionCall(
      signature = "createSlot(uint48,uint32,uint32,uint32,uint32)",
      uintArgs = listOf(
        BigInteger.valueOf(startTimeSec),
        BigInteger.valueOf(durationMins.toLong()),
        BigInteger.valueOf(graceMins.toLong()),
        BigInteger.valueOf(minOverlapMins.toLong()),
        BigInteger.valueOf(cancelCutoffMins.toLong()),
      ),
    )

    return submitEscrowWrite(
      userAddress = userAddress,
      sessionKey = sessionKey,
      callData = callData,
      minimumGasLimit = GAS_LIMIT_CREATE_SLOT,
      opLabel = "create slot",
    )
  }

  suspend fun cancelSlot(
    userAddress: String,
    sessionKey: SessionKeyManager.SessionKey,
    slotId: Long,
  ): EscrowTxResult {
    if (slotId <= 0L) return EscrowTxResult(success = false, error = "Invalid slot id.")

    val callData = encodeFunctionCall(
      signature = "cancelSlot(uint256)",
      uintArgs = listOf(BigInteger.valueOf(slotId)),
    )

    return submitEscrowWrite(
      userAddress = userAddress,
      sessionKey = sessionKey,
      callData = callData,
      minimumGasLimit = GAS_LIMIT_CANCEL_SLOT,
      opLabel = "cancel slot",
    )
  }

  suspend fun cancelBooking(
    userAddress: String,
    sessionKey: SessionKeyManager.SessionKey,
    bookingId: Long,
    asHost: Boolean,
  ): EscrowTxResult {
    if (bookingId <= 0L) return EscrowTxResult(success = false, error = "Invalid booking id.")

    val signature = if (asHost) "cancelBookingAsHost(uint256)" else "cancelBookingAsGuest(uint256)"
    val callData = encodeFunctionCall(
      signature = signature,
      uintArgs = listOf(BigInteger.valueOf(bookingId)),
    )

    return submitEscrowWrite(
      userAddress = userAddress,
      sessionKey = sessionKey,
      callData = callData,
      minimumGasLimit = GAS_LIMIT_CANCEL_BOOKING,
      opLabel = "cancel booking",
    )
  }

  private suspend fun submitEscrowWrite(
    userAddress: String,
    sessionKey: SessionKeyManager.SessionKey,
    callData: String,
    minimumGasLimit: Long,
    opLabel: String,
  ): EscrowTxResult = withContext(Dispatchers.IO) {
    runCatching {
      val sender = normalizeAddress(userAddress)
        ?: throw IllegalStateException("Invalid signer address.")

      if (!SessionKeyManager.isValid(sessionKey, ownerAddress = sender)) {
        throw IllegalStateException("Missing valid Tempo session key. Please sign in again.")
      }

      val chainId = TempoClient.getChainId()
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId")
      }

      val gasLimit = withGasBuffer(
        estimated = estimateGas(from = sender, to = ESCROW_ADDRESS, data = callData),
        minimum = minimumGasLimit,
      )
      val fees = TempoClient.getSuggestedFees()

      fun buildTx(feeMode: TempoTransaction.FeeMode, txFees: TempoClient.Eip1559Fees): TempoTransaction.UnsignedTx {
        return TempoTransaction.UnsignedTx(
          nonceKeyBytes = EXPIRING_NONCE_KEY,
          nonce = 0L,
          validBeforeSec = nowSec() + EXPIRY_WINDOW_SEC,
          maxPriorityFeePerGas = txFees.maxPriorityFeePerGas,
          maxFeePerGas = txFees.maxFeePerGas,
          feeMode = feeMode,
          gasLimit = gasLimit,
          calls = listOf(
            TempoTransaction.Call(
              to = P256Utils.hexToBytes(ESCROW_ADDRESS),
              value = 0,
              input = P256Utils.hexToBytes(callData),
            ),
          ),
        )
      }

      suspend fun signTx(unsignedTx: TempoTransaction.UnsignedTx): String {
        val txHash = TempoTransaction.signatureHash(unsignedTx)
        val keychainSig = SessionKeyManager.signWithSessionKey(
          sessionKey = sessionKey,
          userAddress = sender,
          txHash = txHash,
        )
        return TempoTransaction.encodeSignedSessionKey(unsignedTx, keychainSig)
      }

      suspend fun submitRelay(): String {
        val unsignedTx = buildTx(TempoTransaction.FeeMode.RELAY_SPONSORED, fees)
        val signedTx = signTx(unsignedTx)
        return TempoClient.sendSponsoredRawTransaction(
          signedTxHex = signedTx,
          senderAddress = sender,
        )
      }

      suspend fun submitSelfPay(): String {
        runCatching { TempoClient.fundAddress(sender) }
        val selfFees = TempoClient.getSuggestedFees()
        val unsignedTx = buildTx(TempoTransaction.FeeMode.SELF, selfFees)
        val signedTx = signTx(unsignedTx)
        return TempoClient.sendRawTransaction(signedTx)
      }

      var usedSelfPayFallback = false
      val txHash = runCatching { submitRelay() }.getOrElse { relayErr ->
        usedSelfPayFallback = true
        Log.w(TAG, "$opLabel relay submit failed; trying self-pay fallback: ${relayErr.message}")
        runCatching { submitSelfPay() }.getOrElse { selfErr ->
          throw IllegalStateException(
            "$opLabel failed: relay=${relayErr.message}; self=${selfErr.message}",
            selfErr,
          )
        }
      }

      val receipt = TempoClient.waitForTransactionReceipt(
        txHash = txHash,
        timeoutMs = (EXPIRY_WINDOW_SEC + 30L) * 1000L,
      )
      if (!receipt.isSuccess) {
        throw IllegalStateException("$opLabel reverted on-chain: ${receipt.txHash}")
      }

      Log.d(TAG, "$opLabel success mode=${if (usedSelfPayFallback) "self" else "relay"} tx=$txHash")
      EscrowTxResult(
        success = true,
        txHash = txHash,
        usedSelfPayFallback = usedSelfPayFallback,
      )
    }.getOrElse { err ->
      EscrowTxResult(success = false, error = err.message ?: "$opLabel failed")
    }
  }

  private fun getNextBookingId(): Long? {
    val data = encodeNoArgs("nextBookingId")
    val result = ethCall(data) ?: return null
    val words = splitWords(result)
    if (words.isEmpty()) return null
    return parseWordUint(words[0]).toLongSafe()
  }

  private fun getNextSlotId(): Long? {
    val data = encodeNoArgs("nextSlotId")
    val result = ethCall(data) ?: return null
    val words = splitWords(result)
    if (words.isEmpty()) return null
    return parseWordUint(words[0]).toLongSafe()
  }

  private fun getBooking(bookingId: Long): EscrowBooking? {
    val data = encodeSingleUintArg("getBooking", bookingId)
    val result = ethCall(data) ?: return null
    val words = splitWords(result)
    if (words.size < 11) return null

    val statusCode = parseWordUint(words[3]).toIntSafe()
    val status = EscrowBookingStatus.entries.firstOrNull { it.code == statusCode } ?: EscrowBookingStatus.None

    return EscrowBooking(
      id = bookingId,
      slotId = parseWordUint(words[0]).toLongSafe(),
      guest = parseWordAddress(words[1]),
      amountRaw = parseWordUint(words[2]),
      status = status,
    )
  }

  private fun getSlot(slotId: Long): EscrowSlot? {
    val data = encodeSingleUintArg("getSlot", slotId)
    val result = ethCall(data) ?: return null
    val words = splitWords(result)
    if (words.size < 8) return null

    val statusCode = parseWordUint(words[7]).toIntSafe()
    val status = EscrowSlotStatus.entries.firstOrNull { it.code == statusCode } ?: EscrowSlotStatus.Open

    return EscrowSlot(
      id = slotId,
      host = parseWordAddress(words[0]),
      startTimeSec = parseWordUint(words[1]).toLongSafe(),
      durationMins = parseWordUint(words[2]).toIntSafe(),
      priceRaw = parseWordUint(words[3]),
      status = status,
    )
  }

  private fun encodeNoArgs(functionName: String): String {
    return FunctionEncoder.encode(Function(functionName, emptyList(), emptyList()))
  }

  private fun encodeSingleUintArg(functionName: String, value: Long): String {
    return FunctionEncoder.encode(
      Function(
        functionName,
        listOf(Uint256(BigInteger.valueOf(value))),
        emptyList(),
      ),
    )
  }

  private fun encodeFunctionCall(signature: String, uintArgs: List<BigInteger>): String {
    val selector = functionSelector(signature)
    val encodedArgs = uintArgs.joinToString(separator = "") { arg -> encodeUintWord(arg) }
    return "0x$selector$encodedArgs"
  }

  private fun functionSelector(signature: String): String {
    val digest = Keccak.Digest256().digest(signature.toByteArray(Charsets.UTF_8))
    return P256Utils.bytesToHex(digest).take(8)
  }

  private fun encodeUintWord(value: BigInteger): String {
    require(value >= BigInteger.ZERO) { "uint must be non-negative" }
    return value.toString(16).padStart(64, '0')
  }

  private fun encodeAddressWord(address: String): String {
    val normalized = normalizeAddress(address) ?: throw IllegalArgumentException("invalid address")
    return normalized.removePrefix("0x").padStart(64, '0')
  }

  private fun ethCall(data: String): String? {
    val payload = JSONObject()
      .put("jsonrpc", "2.0")
      .put("id", 1)
      .put(
        "method",
        "eth_call",
      )
      .put(
        "params",
        JSONArray()
          .put(
            JSONObject()
              .put("to", ESCROW_ADDRESS)
              .put("data", data),
          )
          .put("latest"),
      )
      .toString()
      .toRequestBody(JSON_MEDIA_TYPE)

    val request = Request.Builder()
      .url(RPC_URL)
      .post(payload)
      .build()

    return runCatching {
      httpClient.newCall(request).execute().use { response ->
        if (!response.isSuccessful) return null
        val body = response.body?.string().orEmpty()
        val json = JSONObject(body)
        if (json.has("error")) return null
        val result = json.optString("result", "")
        if (!result.startsWith("0x") || result.length <= 2) return null
        result
      }
    }.getOrNull()
  }

  private fun estimateGas(
    from: String,
    to: String,
    data: String,
  ): Long {
    val txObj = JSONObject()
      .put("from", from)
      .put("to", to)
      .put("value", "0x0")
      .put("data", data)

    val payload = JSONObject()
      .put("jsonrpc", "2.0")
      .put("id", 1)
      .put("method", "eth_estimateGas")
      .put("params", JSONArray().put(txObj).put("latest"))

    val request = Request.Builder()
      .url(RPC_URL)
      .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
      .build()

    return httpClient.newCall(request).execute().use { response ->
      if (!response.isSuccessful) {
        throw IllegalStateException("RPC failed: ${response.code}")
      }
      val body = JSONObject(response.body?.string().orEmpty())
      val error = body.optJSONObject("error")
      if (error != null) {
        throw IllegalStateException(error.optString("message", error.toString()))
      }
      val resultHex = body.optString("result", "").trim()
      if (!resultHex.startsWith("0x")) {
        throw IllegalStateException("RPC eth_estimateGas missing result")
      }
      val clean = resultHex.removePrefix("0x").ifBlank { "0" }
      clean.toLongOrNull(16) ?: throw IllegalStateException("Invalid eth_estimateGas result: $resultHex")
    }
  }

  private fun withGasBuffer(estimated: Long, minimum: Long): Long {
    val buffered =
      if (Long.MAX_VALUE - estimated < GAS_LIMIT_BUFFER) Long.MAX_VALUE else estimated + GAS_LIMIT_BUFFER
    return maxOf(buffered, minimum).coerceAtMost(GAS_LIMIT_MAX)
  }

  private fun splitWords(rawHex: String): List<String> {
    val clean = rawHex.removePrefix("0x")
    if (clean.length < 64 || clean.length % 64 != 0) return emptyList()
    return clean.chunked(64)
  }

  private fun parseWordAddress(word: String): String {
    return "0x${word.takeLast(40)}".lowercase()
  }

  private fun parseWordUint(word: String): BigInteger {
    return runCatching { BigInteger(word, 16) }.getOrDefault(BigInteger.ZERO)
  }

  private fun normalizeAddress(address: String?): String? {
    val trimmed = address?.trim().orEmpty()
    if (!trimmed.startsWith("0x", ignoreCase = true) || trimmed.length != 42) return null
    return "0x${trimmed.substring(2).lowercase()}"
  }

  private fun parseUsdToRaw(priceUsd: String): BigInteger? {
    val normalized = priceUsd.trim()
    if (normalized.isBlank()) return null
    val decimal = runCatching { BigDecimal(normalized) }.getOrNull() ?: return null
    if (decimal <= BigDecimal.ZERO) return null
    return decimal.multiply(rawPerUsd).setScale(0, RoundingMode.DOWN).toBigInteger().takeIf { it > BigInteger.ZERO }
  }

  private fun mapSlotStatus(status: EscrowSlotStatus): HostSlotStatus = when (status) {
    EscrowSlotStatus.Open -> HostSlotStatus.Open
    EscrowSlotStatus.Booked -> HostSlotStatus.Booked
    EscrowSlotStatus.Cancelled -> HostSlotStatus.Cancelled
    EscrowSlotStatus.Settled -> HostSlotStatus.Settled
  }

  private fun BigInteger.toLongSafe(): Long {
    return if (this > BigInteger.valueOf(Long.MAX_VALUE)) Long.MAX_VALUE else this.toLong()
  }

  private fun BigInteger.toIntSafe(): Int {
    return if (this > BigInteger.valueOf(Int.MAX_VALUE.toLong())) Int.MAX_VALUE else this.toInt()
  }

  private fun formatTokenAmount(raw: BigInteger): String {
    val usd = BigDecimal(raw).divide(rawPerUsd, 6, RoundingMode.DOWN).stripTrailingZeros()
    return usd.toPlainString()
  }

  private fun nowSec(): Long = System.currentTimeMillis() / 1000L
}
