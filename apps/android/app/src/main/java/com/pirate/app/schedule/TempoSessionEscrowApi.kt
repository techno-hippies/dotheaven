package com.pirate.app.schedule

import com.pirate.app.tempo.TempoClient
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

object TempoSessionEscrowApi {
  private const val RPC_URL = TempoClient.RPC_URL
  private const val ESCROW_ADDRESS = TempoClient.SESSION_ESCROW_V1
  private const val MAX_BOOKING_SCAN = 300

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

    val nowSec = System.currentTimeMillis() / 1000
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

    return@withContext rows
      .sortedBy { it.startTimeSec }
      .take(maxResults.coerceAtLeast(1))
  }

  private fun getNextBookingId(): Long? {
    val data = encodeNoArgs("nextBookingId")
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
}
