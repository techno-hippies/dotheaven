package com.pirate.app.scrobble.aa

import com.pirate.app.lit.LitRust
import com.pirate.app.music.TrackIds
import android.util.Log
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
import org.web3j.abi.datatypes.Bool
import org.web3j.abi.datatypes.DynamicArray
import org.web3j.abi.datatypes.DynamicBytes
import org.web3j.abi.datatypes.DynamicStruct
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Type
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Uint192
import org.web3j.abi.datatypes.generated.Uint256
import org.web3j.abi.datatypes.generated.Uint32
import org.web3j.abi.datatypes.generated.Uint64
import java.math.BigInteger
import org.bouncycastle.jcajce.provider.digest.Keccak

data class SubmitScrobbleInput(
  val artist: String,
  val title: String,
  val album: String?,
  val durationSec: Int,
  val playedAtSec: Long,
)

data class AASubmitResult(
  val userOpHash: String,
  val sender: String,
)

/**
 * Kotlin port of the AA scrobble submit flow:
 * - build UserOp targeting ScrobbleV4 via SimpleAccount.execute()
 * - /quotePaymaster
 * - compute userOpHash via EntryPoint.getUserOpHash
 * - PKP sign toEthSignedMessageHash(userOpHash)
 * - /sendUserOp
 */
class AAScrobbleClient(
  private val rpcUrl: String = DEFAULT_AA_RPC_URL,
  private val gatewayUrl: String = DEFAULT_GATEWAY_URL,
  private val gatewayKey: String = DEFAULT_GATEWAY_KEY,
) {
  companion object {
    private const val TAG = "AAScrobbleClient"
    private const val DEFAULT_AA_RPC_URL = "https://carrot.megaeth.com/rpc"
    private const val DEFAULT_GATEWAY_URL = "https://aa-sepolia.dotheaven.org"
    // Optional (gateway may run in open mode, but supports protected endpoints with a bearer token).
    private const val DEFAULT_GATEWAY_KEY = ""

    private const val ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
    private const val FACTORY = "0xB66BF4066F40b36Da0da34916799a069CBc79408"
    private const val SCROBBLE_V4 = "0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1"

    private val VERIFICATION_GAS_LIMIT = BigInteger.valueOf(2_000_000L)
    private val CALL_GAS_LIMIT = BigInteger.valueOf(2_000_000L)
    private val MAX_PRIORITY_FEE = BigInteger.valueOf(1_000_000L)
    private val MAX_FEE = BigInteger.valueOf(2_000_000L)
    private val PRE_VERIFICATION_GAS = BigInteger.valueOf(100_000L)

    private val JSON = "application/json; charset=utf-8".toMediaType()
  }

  private val http = OkHttpClient()

  suspend fun submitScrobble(
    input: SubmitScrobbleInput,
    userEthAddress: String,
    userPkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): AASubmitResult {
    val user = normalizeAddress(userEthAddress)

    // 1) sender = factory.getAddress(user, 0)
    val sender = callGetAddress(user)

    // 2) initCode if account not deployed
    val needsInit = ethGetCode(sender).trim() == "0x"
    val initCodeBytes =
      if (needsInit) {
        val createData = encodeCreateAccount(user)
        hexToBytes(FACTORY) + hexToBytes(createData)
      } else {
        ByteArray(0)
      }

    // 3) nonce = entrypoint.getNonce(sender, 0)
    val nonce = callGetNonce(sender)

    // 4) build inner calldata (register+scrobble or scrobble-only)
    val parts = TrackIds.computeMetaParts(input.title, input.artist, input.album)
    val trackIdHex = "0x${parts.trackId.toHex()}"
    val registered =
      runCatching { callIsRegistered(trackIdHex) }
        .getOrElse { err ->
          Log.w(TAG, "isRegistered check failed; defaulting to registerAndScrobbleBatch", err)
          false
        }

    val playedAt = input.playedAtSec.coerceAtLeast(0L)
    val innerCalldata =
      if (registered) {
        encodeScrobbleBatch(
          user = user,
          trackIds = listOf(trackIdHex),
          timestamps = listOf(playedAt),
        )
      } else {
        encodeRegisterAndScrobbleBatch(
          user = user,
          kind = parts.kind,
          payloadBytes32 = parts.payload,
          title = input.title,
          artist = input.artist,
          album = input.album.orEmpty(),
          durationSec = input.durationSec.coerceAtLeast(0),
          trackId = trackIdHex,
          timestamp = playedAt,
        )
      }

    // 5) wrap in execute(ScrobbleV4, 0, inner)
    val callData = encodeExecute(dest = SCROBBLE_V4, funcHex = innerCalldata)

    // 6) build unsigned userOp
    val accountGasLimits = packUints128(VERIFICATION_GAS_LIMIT, CALL_GAS_LIMIT)
    val gasFees = packUints128(MAX_PRIORITY_FEE, MAX_FEE)

    val userOp =
      JSONObject()
        .put("sender", sender)
        .put("nonce", u256Hex(nonce))
        .put("initCode", bytesToHex0x(initCodeBytes))
        .put("callData", callData)
        .put("accountGasLimits", bytesToHex0x(accountGasLimits))
        .put("preVerificationGas", u256Hex(PRE_VERIFICATION_GAS))
        .put("gasFees", bytesToHex0x(gasFees))
        .put("paymasterAndData", "0x")
        .put("signature", "0x")

    // 7) quote paymaster
    val quoteRes =
      postJson(
        url = "${gatewayUrl.trimEnd('/')}/quotePaymaster",
        body = JSONObject().put("userOp", userOp),
      )
    val quoteErr = quoteRes.optString("error", "").trim()
    if (quoteErr.isNotEmpty()) {
      val detail = quoteRes.opt("detail")?.toString()?.takeIf { it.isNotBlank() }
      throw IllegalStateException("$quoteErr${if (!detail.isNullOrBlank()) ": $detail" else ""}")
    }
    val paymasterAndData = quoteRes.optString("paymasterAndData", "").trim()
    if (!paymasterAndData.startsWith("0x") || paymasterAndData.length < 42) {
      throw IllegalStateException("Invalid paymasterAndData from gateway")
    }
    userOp.put("paymasterAndData", paymasterAndData)

    // 8) compute userOpHash via EntryPoint.getUserOpHash(userOp)
    val userOpHashHex =
      callGetUserOpHash(
        sender = sender,
        nonce = nonce,
        initCode = initCodeBytes,
        callData = hexToBytes(callData),
        accountGasLimits = accountGasLimits,
        preVerificationGas = PRE_VERIFICATION_GAS,
        gasFees = gasFees,
        paymasterAndData = hexToBytes(paymasterAndData),
      )

    // 9) PKP sign EIP-191 hash of the userOpHash bytes
    val ethSignedHash = toEthSignedMessageHash(hexToBytes(userOpHashHex))
    val signature = pkpSignDigest(
      digest32 = ethSignedHash,
      userPkpPublicKey = userPkpPublicKey,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
    )
    userOp.put("signature", signature)

    // 10) send userOp
    val sendRes =
      postJson(
        url = "${gatewayUrl.trimEnd('/')}/sendUserOp",
        body = JSONObject().put("userOp", userOp).put("userOpHash", userOpHashHex),
      )
    val sendErr = sendRes.optString("error", "").trim()
    if (sendErr.isNotEmpty()) {
      val detail = sendRes.opt("detail")?.toString()?.takeIf { it.isNotBlank() }
      throw IllegalStateException("$sendErr${if (!detail.isNullOrBlank()) ": $detail" else ""}")
    }
    val resultHash = sendRes.optString("userOpHash", "").ifBlank { userOpHashHex }
    if (!resultHash.startsWith("0x")) {
      val err = sendRes.optString("error", "sendUserOp failed")
      val detail = sendRes.opt("detail")?.toString()?.takeIf { it.isNotBlank() } ?: ""
      throw IllegalStateException("$err${if (detail.isNotEmpty()) ": $detail" else ""}")
    }

    return AASubmitResult(userOpHash = resultHash, sender = sender)
  }

  // ── Gateway ──────────────────────────────────────────────────────────

  private fun postJson(url: String, body: JSONObject): JSONObject {
    val req =
      Request.Builder()
        .url(url)
        .apply {
          if (gatewayKey.isNotBlank()) {
            header("authorization", "Bearer ${gatewayKey.trim()}")
          }
        }
        .post(body.toString().toRequestBody(JSON))
        .build()
    http.newCall(req).execute().use { res ->
      val raw = res.body?.string().orEmpty()
      val json = runCatching { JSONObject(raw) }.getOrElse { JSONObject().put("raw", raw) }
      if (!res.isSuccessful) {
        val err = json.optString("error", res.message.ifBlank { "HTTP ${res.code}" }).ifBlank { "HTTP ${res.code}" }
        val detail = json.opt("detail")?.toString()?.takeIf { it.isNotBlank() }
        val bodyHint = json.optString("raw", "").takeIf { it.isNotBlank() }?.let { " body=${it.take(800)}" } ?: ""
        throw IllegalStateException(
          buildString {
            append(err)
            if (!detail.isNullOrBlank()) append(": ").append(detail)
            if (bodyHint.isNotBlank()) append(bodyHint)
          },
        )
      }
      return json
    }
  }

  // ── RPC ──────────────────────────────────────────────────────────────

  private fun rpcJson(method: String, params: JSONArray): JSONObject {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", method)
        .put("params", params)

    val req =
      Request.Builder()
        .url(rpcUrl)
        .post(payload.toString().toRequestBody(JSON))
        .build()

    http.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("RPC failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
      val err = json.optJSONObject("error")
      if (err != null) {
        throw IllegalStateException(err.optString("message", err.toString()))
      }
      return json
    }
  }

  private fun ethCall(to: String, data: String): String {
    val params =
      JSONArray()
        .put(JSONObject().put("to", to).put("data", data))
        .put("latest")
    val json = rpcJson("eth_call", params)
    return json.optString("result", "0x")
  }

  private fun ethGetCode(address: String): String {
    val params = JSONArray().put(address).put("latest")
    val json = rpcJson("eth_getCode", params)
    return json.optString("result", "0x")
  }

  // ── Contract Calls ───────────────────────────────────────────────────

  private fun callGetAddress(user: String): String {
    val function =
      Function(
        "getAddress",
        listOf(Address(user), Uint256(BigInteger.ZERO)),
        listOf(object : TypeReference<Address>() {}),
      )
    val data = FunctionEncoder.encode(function)
    val out = ethCall(FACTORY, data)
    val decoded = FunctionReturnDecoder.decode(out, function.outputParameters)
    val addr = (decoded.firstOrNull() as? Address)?.value ?: ""
    return normalizeAddress(addr)
  }

  private fun encodeCreateAccount(user: String): String {
    val function =
      Function(
        "createAccount",
        listOf(Address(user), Uint256(BigInteger.ZERO)),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun callGetNonce(sender: String): BigInteger {
    val function =
      Function(
        "getNonce",
        listOf(Address(sender), Uint192(BigInteger.ZERO)),
        listOf(object : TypeReference<Uint256>() {}),
      )
    val data = FunctionEncoder.encode(function)
    val out = ethCall(ENTRYPOINT, data)
    val decoded = FunctionReturnDecoder.decode(out, function.outputParameters)
    return (decoded.firstOrNull() as? Uint256)?.value ?: BigInteger.ZERO
  }

  private fun callIsRegistered(trackId: String): Boolean {
    val trackIdBytes = hexToBytes(trackId)
    if (trackIdBytes.size != 32) return false
    val function =
      Function(
        "isRegistered",
        listOf(Bytes32(trackIdBytes)),
        listOf(object : TypeReference<Bool>() {}),
      )
    val data = FunctionEncoder.encode(function)
    val out = ethCall(SCROBBLE_V4, data)
    val decoded = FunctionReturnDecoder.decode(out, function.outputParameters)
    return (decoded.firstOrNull() as? Bool)?.value ?: false
  }

  private fun callGetUserOpHash(
    sender: String,
    nonce: BigInteger,
    initCode: ByteArray,
    callData: ByteArray,
    accountGasLimits: ByteArray,
    preVerificationGas: BigInteger,
    gasFees: ByteArray,
    paymasterAndData: ByteArray,
  ): String {
    val struct =
      DynamicStruct(
        Address(sender),
        Uint256(nonce),
        DynamicBytes(initCode),
        DynamicBytes(callData),
        Bytes32(accountGasLimits),
        Uint256(preVerificationGas),
        Bytes32(gasFees),
        DynamicBytes(paymasterAndData),
        DynamicBytes(ByteArray(0)),
      )

    val function =
      Function(
        "getUserOpHash",
        listOf(struct),
        listOf(object : TypeReference<Bytes32>() {}),
      )
    val data = FunctionEncoder.encode(function)
    val out = ethCall(ENTRYPOINT, data)
    val decoded = FunctionReturnDecoder.decode(out, function.outputParameters)
    val bytes = (decoded.firstOrNull() as? Bytes32)?.value ?: ByteArray(32)
    return bytesToHex0x(bytes)
  }

  private fun encodeExecute(dest: String, funcHex: String): String {
    val function =
      Function(
        "execute",
        listOf(Address(dest), Uint256(BigInteger.ZERO), DynamicBytes(hexToBytes(funcHex))),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  private fun encodeScrobbleBatch(
    user: String,
    trackIds: List<String>,
    timestamps: List<Long>,
  ): String {
    val ids =
      trackIds.map { Bytes32(hexToBytes(it)) }
    val ts =
      timestamps.map { Uint64(BigInteger.valueOf(it)) }

    val function =
      Function(
        "scrobbleBatch",
        listOf(
          Address(user),
          DynamicArray(Bytes32::class.java, ids),
          DynamicArray(Uint64::class.java, ts),
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
          DynamicArray(
            org.web3j.abi.datatypes.generated.Uint8::class.java,
            listOf(org.web3j.abi.datatypes.generated.Uint8(BigInteger.valueOf(kind.toLong()))),
          ),
          DynamicArray(Bytes32::class.java, listOf(Bytes32(payloadBytes32))),
          DynamicArray(Utf8String::class.java, listOf(Utf8String(title))),
          DynamicArray(Utf8String::class.java, listOf(Utf8String(artist))),
          DynamicArray(Utf8String::class.java, listOf(Utf8String(album))),
          DynamicArray(Uint32::class.java, listOf(Uint32(BigInteger.valueOf(durationSec.toLong())))),
          DynamicArray(Bytes32::class.java, listOf(Bytes32(hexToBytes(trackId)))),
          DynamicArray(Uint64::class.java, listOf(Uint64(BigInteger.valueOf(timestamp)))),
        ),
        emptyList(),
      )
    return FunctionEncoder.encode(function)
  }

  // ── PKP signing (Lit Action) ─────────────────────────────────────────

  private fun pkpSignDigest(
    digest32: ByteArray,
    userPkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ): String {
    if (digest32.size != 32) throw IllegalArgumentException("digest must be 32 bytes")

    val litActionCode =
      """
        (async () => {
          const toSign = new Uint8Array(jsParams.toSign);
          await Lit.Actions.signEcdsa({
            toSign,
            publicKey: jsParams.publicKey,
            sigName: "sig",
          });
        })();
      """.trimIndent()

    val jsParams =
      JSONObject()
        .put("toSign", JSONArray(digest32.map { (it.toInt() and 0xff) }))
        .put("publicKey", userPkpPublicKey)

    val raw =
      LitRust.executeJsRaw(
        network = litNetwork,
        rpcUrl = litRpcUrl,
        code = litActionCode,
        ipfsId = "",
        jsParamsJson = jsParams.toString(),
        useSingleNode = false,
      )
    val env = LitRust.unwrapEnvelope(raw)
    val sig = env.optJSONObject("signatures")?.optJSONObject("sig")
      ?: throw IllegalStateException("No signature returned from PKP")

    val (r, s, recidOrV) = extractLitSignature(sig)
    val v = if (recidOrV >= 27) recidOrV else recidOrV + 27
    val vHex = v.toString(16).padStart(2, '0')
    val out = "0x${r}${s}${vHex}"

    // Validate hex shape locally so bundler errors point to the real root-cause.
    val bytes =
      runCatching { hexToBytes(out) }
        .getOrElse { err ->
          throw IllegalStateException(
            "Invalid assembled signature hex: ${err.message ?: err}; sig=${sig}",
            err,
          )
        }
    if (bytes.size != 65) {
      throw IllegalStateException("Assembled signature must be 65 bytes, got ${bytes.size} bytes; sig=${sig}")
    }
    return out
  }

  // ── Hashing ──────────────────────────────────────────────────────────

  private fun toEthSignedMessageHash(message32: ByteArray): ByteArray {
    if (message32.size != 32) throw IllegalArgumentException("message must be 32 bytes")
    val prefix = "\u0019Ethereum Signed Message:\n32".toByteArray(Charsets.UTF_8)
    val toHash = ByteArray(prefix.size + message32.size)
    System.arraycopy(prefix, 0, toHash, 0, prefix.size)
    System.arraycopy(message32, 0, toHash, prefix.size, message32.size)
    val d = Keccak.Digest256()
    d.update(toHash, 0, toHash.size)
    return d.digest()
  }

  private fun extractLitSignature(sig: JSONObject): Triple<String, String, Int> {
    val recid = parseRecoveryId(sig) ?: 0

    // Prefer canonical `signature` field when present (avoids schema differences for r/s).
    val signatureField = sig.optString("signature", "").trim()
    if (signatureField.isNotBlank()) {
      val sigHex = normalizeHexNoPrefix(signatureField)

      if (sigHex.length == 130) {
        val r = sigHex.substring(0, 64)
        val s = sigHex.substring(64, 128)
        val v = sigHex.substring(128, 130).toInt(16)
        return Triple(r, s, v)
      }

      if (sigHex.length < 128) {
        throw IllegalStateException("Lit signature is shorter than 64 bytes (hex chars=${sigHex.length}): ${sig}")
      }

      // Some providers append metadata bytes; keep only r||s and use recid.
      val r = sigHex.substring(0, 64)
      val s = sigHex.substring(64, 128)
      return Triple(r, s, recid)
    }

    val rField = sig.optString("r", "").trim()
    val sField = sig.optString("s", "").trim()
    if (rField.isNotBlank() && sField.isNotBlank()) {
      val r = normalizeHexWord32(rField)
      val s = normalizeHexWord32(sField)
      return Triple(r, s, recid)
    }

    throw IllegalStateException("Unsupported Lit signature shape: ${sig}")
  }

  private fun parseRecoveryId(sig: JSONObject): Int? {
    val keys = listOf("recid", "recoveryId", "recovery_id", "v")
    for (key in keys) {
      val any = sig.opt(key) ?: continue
      when (any) {
        is Number -> return any.toInt()
        is String -> {
          val trimmed = any.trim()
          if (trimmed.isEmpty()) continue
          trimmed.toIntOrNull()?.let { return it }
          val hex = trimmed.removePrefix("0x").removePrefix("0X")
          hex.toIntOrNull(16)?.let { return it }
        }
      }
    }
    return null
  }

  private fun normalizeHexNoPrefix(input: String): String {
    var trimmed = input.trim()

    // Some Lit responses encode hex as a quoted JSON string: "\"0xabc...\"".
    while (trimmed.length >= 2) {
      val first = trimmed.first()
      val last = trimmed.last()
      val isQuoted =
        (first == '"' && last == '"') ||
          (first == '\'' && last == '\'')
      if (!isQuoted) break
      trimmed = trimmed.substring(1, trimmed.length - 1).trim()
    }

    var hex = trimmed.removePrefix("0x").removePrefix("0X")
    if (hex.isEmpty()) throw IllegalStateException("empty hex string")
    if (!hex.all { it.isDigit() || (it.lowercaseChar() in 'a'..'f') }) {
      throw IllegalStateException("contains non-hex characters: $input")
    }
    if (hex.length % 2 != 0) hex = "0$hex"
    return hex.lowercase()
  }

  private fun normalizeHexWord32(input: String): String {
    val hex = normalizeHexNoPrefix(input)
    if (hex.length > 64) {
      val prefix = hex.substring(0, hex.length - 64)
      if (prefix.all { it == '0' }) {
        return hex.substring(hex.length - 64)
      }
      throw IllegalStateException("hex word exceeds 32 bytes and is not zero-prefixed: $input")
    }
    return hex.padStart(64, '0')
  }
}

// ── Hex helpers ───────────────────────────────────────────────────────────

private fun normalizeAddress(value: String): String {
  val v = value.trim()
  if (!v.startsWith("0x") || v.length != 42) throw IllegalArgumentException("Invalid address: $value")
  return v.lowercase()
}

private fun u256Hex(value: BigInteger): String {
  val v = if (value.signum() < 0) BigInteger.ZERO else value
  return "0x" + v.toString(16)
}

private fun packUints128(high: BigInteger, low: BigInteger): ByteArray {
  val h = high.and(BigInteger.ONE.shiftLeft(128).subtract(BigInteger.ONE))
  val l = low.and(BigInteger.ONE.shiftLeft(128).subtract(BigInteger.ONE))
  val combined = h.shiftLeft(128).or(l)
  val raw = combined.toByteArray()

  // BigInteger gives signed bytes; normalize to 32 bytes big-endian.
  val out = ByteArray(32)
  val src = if (raw.size > 32) raw.copyOfRange(raw.size - 32, raw.size) else raw
  System.arraycopy(src, 0, out, 32 - src.size, src.size)
  return out
}

private fun hexToBytes(hex: String): ByteArray {
  val clean = hex.trim().removePrefix("0x").removePrefix("0X")
  if (clean.isEmpty()) return ByteArray(0)
  if (clean.length % 2 != 0) throw IllegalArgumentException("Invalid hex: $hex")
  val out = ByteArray(clean.length / 2)
  var i = 0
  while (i < clean.length) {
    out[i / 2] = clean.substring(i, i + 2).toInt(16).toByte()
    i += 2
  }
  return out
}

private fun bytesToHex0x(bytes: ByteArray): String {
  val hexChars = "0123456789abcdef"
  val out = CharArray(bytes.size * 2)
  var i = 0
  for (b in bytes) {
    val v = b.toInt() and 0xff
    out[i++] = hexChars[v ushr 4]
    out[i++] = hexChars[v and 0x0f]
  }
  return "0x" + String(out)
}

private fun ByteArray.toHex(): String {
  val hexChars = "0123456789abcdef"
  val out = CharArray(this.size * 2)
  var i = 0
  for (b in this) {
    val v = b.toInt() and 0xff
    out[i++] = hexChars[v ushr 4]
    out[i++] = hexChars[v and 0x0f]
  }
  return String(out)
}
