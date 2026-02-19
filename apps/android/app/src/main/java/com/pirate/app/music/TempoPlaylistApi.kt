package com.pirate.app.music

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
import org.bouncycastle.jcajce.provider.digest.Keccak
import org.json.JSONArray
import org.json.JSONObject
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.datatypes.Address
import org.web3j.abi.datatypes.DynamicArray
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Type
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Uint8
import java.util.Locale

data class TempoPlaylistTxResult(
  val success: Boolean,
  val txHash: String? = null,
  val playlistId: String? = null,
  val usedSelfPayFallback: Boolean = false,
  val error: String? = null,
)

object TempoPlaylistApi {
  const val PLAYLIST_V1 = "0xeF6a21324548155630670397DA68318E126510EF"
  const val PLAYLIST_SHARE_V1 = "0x1912cEa18eAFC17cd0f21F58fCF87E699Be512Aa"

  private const val GAS_LIMIT_CREATE_MIN = 800_000L
  private const val GAS_LIMIT_SET_TRACKS_MIN = 100_000L
  private const val GAS_LIMIT_UPDATE_META_MIN = 100_000L
  private const val GAS_LIMIT_DELETE_MIN = 100_000L
  private const val GAS_LIMIT_SHARE_MIN = 800_000L
  private const val GAS_LIMIT_UNSHARE_MIN = 100_000L
  private const val GAS_LIMIT_BUFFER = 250_000L

  private val EXPIRING_NONCE_KEY = ByteArray(32) { 0xFF.toByte() }
  private const val EXPIRY_WINDOW_SEC = 25L
  private const val MAX_UNDERPRICED_RETRIES = 4
  private const val RETRY_DELAY_MS = 220L

  private val client = OkHttpClient()
  private val jsonType = "application/json; charset=utf-8".toMediaType()

  suspend fun createPlaylist(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    name: String,
    coverCid: String,
    visibility: Int,
    trackIds: List<String>,
  ): TempoPlaylistTxResult {
    val safeName = truncateUtf8(name.trim(), maxBytes = 64)
    if (safeName.isBlank()) {
      return TempoPlaylistTxResult(success = false, error = "Playlist name is required")
    }

    val normalizedTracks =
      runCatching { normalizeTrackIds(trackIds) }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }

    val data =
      encodeCreatePlaylist(
        name = safeName,
        coverCid = truncateUtf8(coverCid.trim(), maxBytes = 128),
        visibility = visibility,
        trackIds = normalizedTracks,
      )

    return submitContractCall(
      account = account,
      sessionKey = sessionKey,
      contract = PLAYLIST_V1,
      callData = data,
      minimumGasLimit = GAS_LIMIT_CREATE_MIN,
      opLabel = "create playlist",
      parsePlaylistId = true,
    )
  }

  suspend fun setTracks(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    playlistId: String,
    trackIds: List<String>,
  ): TempoPlaylistTxResult {
    val pid =
      runCatching { normalizeBytes32(playlistId, "playlistId") }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }
    val normalizedTracks =
      runCatching { normalizeTrackIds(trackIds) }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }

    val data = encodeSetTracks(playlistId = pid, trackIds = normalizedTracks)
    return submitContractCall(
      account = account,
      sessionKey = sessionKey,
      contract = PLAYLIST_V1,
      callData = data,
      minimumGasLimit = GAS_LIMIT_SET_TRACKS_MIN,
      opLabel = "set tracks",
    )
  }

  suspend fun updateMeta(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    playlistId: String,
    name: String,
    coverCid: String,
    visibility: Int,
  ): TempoPlaylistTxResult {
    val pid =
      runCatching { normalizeBytes32(playlistId, "playlistId") }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }
    val safeName = truncateUtf8(name.trim(), maxBytes = 64)
    if (safeName.isBlank()) {
      return TempoPlaylistTxResult(success = false, error = "Playlist name is required")
    }

    val data =
      encodeUpdateMeta(
        playlistId = pid,
        name = safeName,
        coverCid = truncateUtf8(coverCid.trim(), maxBytes = 128),
        visibility = visibility,
      )

    return submitContractCall(
      account = account,
      sessionKey = sessionKey,
      contract = PLAYLIST_V1,
      callData = data,
      minimumGasLimit = GAS_LIMIT_UPDATE_META_MIN,
      opLabel = "update playlist meta",
    )
  }

  suspend fun deletePlaylist(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    playlistId: String,
  ): TempoPlaylistTxResult {
    val pid =
      runCatching { normalizeBytes32(playlistId, "playlistId") }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }
    val data = encodeDeletePlaylist(pid)

    return submitContractCall(
      account = account,
      sessionKey = sessionKey,
      contract = PLAYLIST_V1,
      callData = data,
      minimumGasLimit = GAS_LIMIT_DELETE_MIN,
      opLabel = "delete playlist",
    )
  }

  suspend fun sharePlaylist(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    playlistId: String,
    grantee: String,
  ): TempoPlaylistTxResult {
    val pid =
      runCatching { normalizeBytes32(playlistId, "playlistId") }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }
    val recipient =
      runCatching { normalizeAddress(grantee) }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }

    val data = encodeSharePlaylist(pid, recipient)
    return submitContractCall(
      account = account,
      sessionKey = sessionKey,
      contract = PLAYLIST_SHARE_V1,
      callData = data,
      minimumGasLimit = GAS_LIMIT_SHARE_MIN,
      opLabel = "share playlist",
    )
  }

  suspend fun unsharePlaylist(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    playlistId: String,
    grantee: String,
  ): TempoPlaylistTxResult {
    val pid =
      runCatching { normalizeBytes32(playlistId, "playlistId") }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }
    val recipient =
      runCatching { normalizeAddress(grantee) }
        .getOrElse { error -> return TempoPlaylistTxResult(success = false, error = error.message) }

    val data = encodeUnsharePlaylist(pid, recipient)
    return submitContractCall(
      account = account,
      sessionKey = sessionKey,
      contract = PLAYLIST_SHARE_V1,
      callData = data,
      minimumGasLimit = GAS_LIMIT_UNSHARE_MIN,
      opLabel = "unshare playlist",
    )
  }

  private suspend fun submitContractCall(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    contract: String,
    callData: String,
    minimumGasLimit: Long,
    opLabel: String,
    parsePlaylistId: Boolean = false,
  ): TempoPlaylistTxResult {
    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val normalizedContract = normalizeAddress(contract)
      val gasLimit =
        withContext(Dispatchers.IO) {
          val estimated = estimateGas(from = account.address, to = normalizedContract, data = callData)
          withBuffer(estimated = estimated, minimum = minimumGasLimit)
        }

      var fees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }

      suspend fun submitWithMode(
        feeMode: TempoTransaction.FeeMode,
        txFees: TempoClient.Eip1559Fees,
      ): String {
        var attemptFees = txFees
        var lastUnderpriced: Throwable? = null

        repeat(MAX_UNDERPRICED_RETRIES + 1) { attempt ->
          val tx =
            TempoTransaction.UnsignedTx(
              nonceKeyBytes = EXPIRING_NONCE_KEY,
              nonce = 0L,
              validBeforeSec = nowSec() + EXPIRY_WINDOW_SEC,
              maxPriorityFeePerGas = attemptFees.maxPriorityFeePerGas,
              maxFeePerGas = attemptFees.maxFeePerGas,
              feeMode = feeMode,
              gasLimit = gasLimit,
              calls =
                listOf(
                  TempoTransaction.Call(
                    to = P256Utils.hexToBytes(normalizedContract),
                    value = 0,
                    input = P256Utils.hexToBytes(callData),
                  ),
                ),
            )

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
          if (!txHash.isNullOrBlank()) return txHash

          val err = result.exceptionOrNull() ?: IllegalStateException("Unknown $opLabel submission failure")
          if (!isReplacementUnderpriced(err) || attempt >= MAX_UNDERPRICED_RETRIES) {
            throw err
          }
          lastUnderpriced = err
          attemptFees = aggressivelyBumpFees(attemptFees)
          delay(RETRY_DELAY_MS)
        }

        throw (lastUnderpriced ?: IllegalStateException("replacement transaction underpriced"))
      }

      val relayTxHash =
        runCatching {
          submitWithMode(TempoTransaction.FeeMode.RELAY_SPONSORED, fees)
        }.getOrElse { relayErr ->
          withContext(Dispatchers.IO) {
            runCatching { TempoClient.fundAddress(account.address) }
          }
          fees = aggressivelyBumpFees(fees)
          runCatching {
            submitWithMode(TempoTransaction.FeeMode.SELF, fees)
          }.getOrElse { selfErr ->
            throw IllegalStateException(
              "$opLabel failed with relay and self-pay fallback. relay=${relayErr.message}; self=${selfErr.message}",
              selfErr,
            )
          }
        }

      val receipt =
        withContext(Dispatchers.IO) {
          TempoClient.waitForTransactionReceipt(
            txHash = relayTxHash,
            timeoutMs = (EXPIRY_WINDOW_SEC + 20L) * 1000L,
          )
        }
      if (!receipt.isSuccess) {
        throw IllegalStateException("$opLabel reverted on-chain: ${receipt.txHash}")
      }

      val playlistId =
        if (parsePlaylistId) {
          runCatching { extractCreatedPlaylistIdFromReceipt(relayTxHash) }.getOrNull()
        } else {
          null
        }

      TempoPlaylistTxResult(
        success = true,
        txHash = relayTxHash,
        playlistId = playlistId,
        usedSelfPayFallback = false,
      )
    }.getOrElse { error ->
      TempoPlaylistTxResult(
        success = false,
        error = error.message ?: "$opLabel failed",
      )
    }
  }

  private fun encodeCreatePlaylist(
    name: String,
    coverCid: String,
    visibility: Int,
    trackIds: List<String>,
  ): String {
    val function =
      Function(
        "createPlaylist",
        listOf(
          Utf8String(name),
          Utf8String(coverCid),
          Uint8(visibility.toLong().coerceAtLeast(0L)),
          DynamicArray(Bytes32::class.java, trackIds.map { id -> Bytes32(P256Utils.hexToBytes(id)) }),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeSetTracks(
    playlistId: String,
    trackIds: List<String>,
  ): String {
    val function =
      Function(
        "setTracks",
        listOf(
          Bytes32(P256Utils.hexToBytes(playlistId)),
          DynamicArray(Bytes32::class.java, trackIds.map { id -> Bytes32(P256Utils.hexToBytes(id)) }),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeUpdateMeta(
    playlistId: String,
    name: String,
    coverCid: String,
    visibility: Int,
  ): String {
    val function =
      Function(
        "updateMeta",
        listOf(
          Bytes32(P256Utils.hexToBytes(playlistId)),
          Utf8String(name),
          Utf8String(coverCid),
          Uint8(visibility.toLong().coerceAtLeast(0L)),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeDeletePlaylist(playlistId: String): String {
    val function =
      Function(
        "deletePlaylist",
        listOf(Bytes32(P256Utils.hexToBytes(playlistId))),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeSharePlaylist(
    playlistId: String,
    grantee: String,
  ): String {
    val function =
      Function(
        "sharePlaylist",
        listOf(
          Bytes32(P256Utils.hexToBytes(playlistId)),
          Address(grantee),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeUnsharePlaylist(
    playlistId: String,
    grantee: String,
  ): String {
    val function =
      Function(
        "unsharePlaylist",
        listOf(
          Bytes32(P256Utils.hexToBytes(playlistId)),
          Address(grantee),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun normalizeTrackIds(trackIds: List<String>): List<String> {
    val out = ArrayList<String>(trackIds.size)
    val seen = LinkedHashSet<String>()
    for (raw in trackIds) {
      val normalized = normalizeBytes32(raw, "trackId")
      if (seen.add(normalized)) out.add(normalized)
    }
    return out
  }

  private fun normalizeAddress(value: String): String {
    val clean = value.trim().removePrefix("0x").removePrefix("0X").lowercase(Locale.US)
    require(clean.length == 40 && clean.all { it.isDigit() || it in 'a'..'f' }) {
      "Invalid address: $value"
    }
    return "0x$clean"
  }

  private fun normalizeBytes32(
    value: String,
    fieldName: String,
  ): String {
    val clean = value.trim().removePrefix("0x").removePrefix("0X").lowercase(Locale.US)
    require(clean.isNotEmpty() && clean.length <= 64 && clean.all { it.isDigit() || it in 'a'..'f' }) {
      "Invalid $fieldName"
    }
    return "0x${clean.padStart(64, '0')}"
  }

  private fun truncateUtf8(
    value: String,
    maxBytes: Int,
  ): String {
    if (value.isEmpty()) return value
    if (value.toByteArray(Charsets.UTF_8).size <= maxBytes) return value

    var out = value
    while (out.isNotEmpty() && out.toByteArray(Charsets.UTF_8).size > maxBytes) {
      out = out.dropLast(1)
    }
    return out
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
          JSONArray().put(
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

  private fun withBuffer(
    estimated: Long,
    minimum: Long,
  ): Long {
    val buffered = saturatingAdd(estimated.coerceAtLeast(0L), GAS_LIMIT_BUFFER)
    return maxOf(minimum, buffered)
  }

  private fun aggressivelyBumpFees(fees: TempoClient.Eip1559Fees): TempoClient.Eip1559Fees {
    val bumpedPriority = bumpForReplacement(fees.maxPriorityFeePerGas)
    val bumpedMax = bumpForReplacement(maxOf(fees.maxFeePerGas, bumpedPriority))
    return TempoClient.Eip1559Fees(
      maxPriorityFeePerGas = bumpedPriority,
      maxFeePerGas = maxOf(bumpedMax, bumpedPriority),
    )
  }

  private fun bumpForReplacement(value: Long): Long {
    if (value <= 0L) return 1L
    val bump = value / 5L // +20%
    return saturatingAdd(value, maxOf(1L, bump))
  }

  private fun isReplacementUnderpriced(error: Throwable): Boolean {
    return error.message?.contains("replacement transaction underpriced", ignoreCase = true) == true
  }

  private fun saturatingAdd(
    a: Long,
    b: Long,
  ): Long = if (Long.MAX_VALUE - a < b) Long.MAX_VALUE else a + b

  private fun nowSec(): Long = System.currentTimeMillis() / 1000L

  private fun extractCreatedPlaylistIdFromReceipt(txHash: String): String? {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", "eth_getTransactionReceipt")
        .put("params", JSONArray().put(txHash))

    val req =
      Request.Builder()
        .url(TempoClient.RPC_URL)
        .post(payload.toString().toRequestBody(jsonType))
        .build()

    client.newCall(req).execute().use { response ->
      if (!response.isSuccessful) return null
      val body = JSONObject(response.body?.string().orEmpty())
      val receipt = body.optJSONObject("result") ?: return null
      val logs = receipt.optJSONArray("logs") ?: return null
      val topic0 = topicHash("PlaylistCreated(bytes32,address,uint32,uint8,uint32,bytes32,uint64,string,string)")
      val playlistContract = PLAYLIST_V1.lowercase(Locale.US)

      for (i in 0 until logs.length()) {
        val log = logs.optJSONObject(i) ?: continue
        val address = log.optString("address", "").trim().lowercase(Locale.US)
        if (address != playlistContract) continue

        val topics = log.optJSONArray("topics") ?: continue
        val first = topics.optString(0, "").trim().lowercase(Locale.US)
        if (first != topic0) continue

        val rawPlaylistId = topics.optString(1, "").trim()
        if (rawPlaylistId.isBlank()) continue
        return runCatching { normalizeBytes32(rawPlaylistId, "playlistId") }.getOrNull()
      }
    }

    return null
  }

  private fun topicHash(signature: String): String {
    val digest = Keccak.Digest256().digest(signature.toByteArray(Charsets.UTF_8))
    return "0x" + digest.joinToString("") { "%02x".format(it) }
  }
}
