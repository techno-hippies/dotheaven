package com.pirate.app.music

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.lit.LitRust
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import org.bouncycastle.jcajce.provider.digest.Keccak
import org.web3j.crypto.ECDSASignature
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign

/**
 * Song Publish Service — Kotlin port of song-publish.ts
 *
 * Orchestrates the full publish pipeline:
 * 1. Read files from URIs
 * 2. Upload cover to Arweave via heaven-api proxy
 * 3. Pre-upload audio/vocals/instrumental/canvas to Filebase via heaven-api proxy
 * 3. Build metadata JSONs
 * 4. SHA-256 hash all content + sign EIP-191 via PKP
 * 5. Call song-publish-v2 Lit Action (storage-agnostic params + lyrics alignment + translation)
 * 6. Sign EIP-712 typed data for Story registration via PKP
 * 7. Call story-register-sponsor-v1 Lit Action (mint NFT, register IP, attach license)
 * 8. Register on ContentRegistry (MegaETH) for subgraph indexing
 * 9. Write cover ref on-chain via track-cover-v5
 * 10. Auto-translate lyrics (best-effort)
 */
object SongPublishService {

  private const val TAG = "SongPublish"
  private const val IPFS_GATEWAY = "https://ipfs.filebase.io/ipfs/"
  private const val HEAVEN_API_URL = "https://heaven-api.deletion-backup782.workers.dev"
  private const val ARWEAVE_GATEWAY = "https://arweave.net"
  private const val MAX_ARWEAVE_COVER_BYTES = 100 * 1024

  // ── CID maps (mirrors action-cids.ts) ──────────────────────────

  private val CID_MAP = mapOf(
    "naga-dev" to mapOf(
      "songPublishV2" to "QmYzNwWVJSAs2aMgdEBufzKftxzACJ7kxmQKSWqVJrseYT",
      "storyRegisterSponsor" to "QmZ38qG34PKnENxzV8eejbRwiqQf2aRFKuNKqJNTXvU43Q",
      "lyricsTranslate" to "QmViMXk72SZdjoWWuXP6kUsxB3BHzrK2ZN934YPFKmXBeV",
      "contentRegisterMegaethV1" to "QmRFuAAYCmri8kTCmJupF9AZWhYmvKnhNhVyqr5trRfZhS",
      "trackCoverV5" to "QmdoZnj6BsXASda2VUqN7M1zPDktoBQMkn2WvW1PsbRiUb",
    ),
  )

  // ── Encrypted API keys (bound to song-publish-v1/v2 action CID) ────

  private fun actionBoundEncryptedKey(
    actionCid: String,
    dataToEncryptHash: String,
    ciphertextByCid: Map<String, String>,
    keyLabel: String,
  ) = JSONObject().apply {
    val ciphertext = ciphertextByCid[actionCid]
      ?: throw IllegalStateException("Missing $keyLabel for action CID: $actionCid")
    put("ciphertext", ciphertext)
    put("dataToEncryptHash", dataToEncryptHash)
    put("accessControlConditions", JSONArray().put(JSONObject().apply {
      put("conditionType", "evmBasic")
      put("contractAddress", "")
      put("standardContractType", "")
      put("chain", "ethereum")
      put("method", "")
      put("parameters", JSONArray().put(":currentActionIpfsId"))
      put("returnValueTest", JSONObject().put("comparator", "=").put("value", actionCid))
    }))
  }

  private val songPublishFilebaseCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("songPublishV2") to "lnvxDJMtF1yqGN7cAj9ZKBdkoCgJ4JExWKiy7/u6O0ebNj4aagBJ9MAqulSHrJx7DrVne1L78etCAxYdH6KXERYdL6TZZc4TDAEbT0EAZRhleFyH7P1yO65ryGekd85Tj7tCytYN/zdg7OYd+eCr6+ouqBszY4M+RvjP9UerLyW9/TXdP1v670y/ov+hMLaI1P8pnixXbBqb5xoKmTZ9PxRymzC2XUhbLyjD/nDMHVIOBDVGLvQC",
  )

  private val songPublishElevenlabsCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("songPublishV2") to "uTJ6xvhguWO1H8NqauuOD0orVBeoBEXGu1NlGIPegSnmXz7LbLgNhthJRQdfk9936YuJtmTKw2epxfRSMLWbPOV2ZJyp7cKUfYMrKTLn32o02afacl81HhehuxfwMOId88KaS8wmFSsq6as80qOj4+tWzDBFxymcnGmSZ1vJSl3R/FmJ/AI=",
  )

  private val songPublishOpenrouterCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("songPublishV2") to "qh5DyFLLEVx2NaFx1FHQKw+1HhqaaiM0l4wTJwhRsZfl7zl/xKjfTdOaVHxYkJJakDr1j1XbMCOxJHD5GH3o0u+KAngydXuY1NGkVKx5F19KCj92+OG1VXQG/io41UPLQfYnUxnvthial/7+czfEJI6XFtjesgn6/9IJACMA9kiBTaU71VhcbMgWFhjcyPF89f1PX8opr4sUDiwC",
  )

  private fun filebaseEncryptedKey(songPublishCid: String) = actionBoundEncryptedKey(
    actionCid = songPublishCid,
    dataToEncryptHash = "23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4",
    ciphertextByCid = songPublishFilebaseCiphertextByCid,
    keyLabel = "songPublish.filebase_api_key",
  )

  private fun elevenlabsEncryptedKey(songPublishCid: String) = actionBoundEncryptedKey(
    actionCid = songPublishCid,
    dataToEncryptHash = "6d1863a0dd36fcff73e8d00eaec3f038d143e4bea663b57f8b9810d786b73f6c",
    ciphertextByCid = songPublishElevenlabsCiphertextByCid,
    keyLabel = "songPublish.elevenlabs_api_key",
  )

  private fun openrouterEncryptedKey(songPublishCid: String) = actionBoundEncryptedKey(
    actionCid = songPublishCid,
    dataToEncryptHash = "2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092",
    ciphertextByCid = songPublishOpenrouterCiphertextByCid,
    keyLabel = "songPublish.openrouter_api_key",
  )

  // ── Encrypted keys (bound to lyrics-translate-v1 action CID) ────

  private val lyricsFilebaseCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("lyricsTranslate") to "tKYa+oVjx6F2Ja3rm4OWeinfcyENLf3dwSIIMEa7g/XQP/wnGE9nXGiR2JMuXGYpLx03kppJfMdbv25N+yRjORw8KDuKHAMXGZqFbXTmYMxls8tH1zpaHxLlcicKVxIXeReXvSOgJVZ9cELNSMDSByVBNM6ka70jPT6RdFbCrs9mUyQUb0XZaEyzmjTjZ/K2/Uqz7pwkxu+3iBHBnKLCDV8hoBQdXO9CLspRXCycy7LCPNSUpSMC",
  )

  private val lyricsOpenrouterCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("lyricsTranslate") to "o/7W0AEqLIdlO6GriIAs5iwxPJ/3JG2ctRysJKRZN0j67xW1kl23sD9fkTRCXr2FhnmFMfSoLB5r0cGD7hAEP3J7jCZIJa0k+xrWn7gjnORKqMpZl1G5LR+V9MV1UVSmrydFubnmnNWF3pBGkvUGDVl/RrYGgUJ0G9XOSYqHjxcFZ6VDcKw/ByOMOL/OmM8QDOVnV5Va6E+76EUC",
  )

  private fun lyricsFilebaseEncryptedKey(lyricsTranslateCid: String) = actionBoundEncryptedKey(
    actionCid = lyricsTranslateCid,
    dataToEncryptHash = "23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4",
    ciphertextByCid = lyricsFilebaseCiphertextByCid,
    keyLabel = "lyricsTranslate.filebase_api_key",
  )

  private fun lyricsOpenrouterEncryptedKey(lyricsTranslateCid: String) = actionBoundEncryptedKey(
    actionCid = lyricsTranslateCid,
    dataToEncryptHash = "2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092",
    ciphertextByCid = lyricsOpenrouterCiphertextByCid,
    keyLabel = "lyricsTranslate.openrouter_api_key",
  )

  // ── Language mapping ────────────────────────────────────────────

  val LANG_CODE_TO_NAME = mapOf(
    "en" to "English", "es" to "Spanish", "fr" to "French", "de" to "German",
    "it" to "Italian", "pt" to "Portuguese", "ru" to "Russian", "ja" to "Japanese",
    "ko" to "Korean", "zh" to "Mandarin Chinese", "ar" to "Arabic", "hi" to "Hindi",
    "tr" to "Turkish", "th" to "Thai", "vi" to "Vietnamese", "id" to "Indonesian",
    "tl" to "Tagalog", "sw" to "Swahili",
  )

  private val AUTO_TRANSLATE_LANGS = listOf("zh", "en")

  // ── Form data model ─────────────────────────────────────────────

  data class SongFormData(
    val title: String = "",
    val artist: String = "",
    val genre: String = "pop",
    val primaryLanguage: String = "en",
    val secondaryLanguage: String = "",
    val lyrics: String = "",
    val coverUri: Uri? = null,
    val audioUri: Uri? = null,
    val vocalsUri: Uri? = null,
    val instrumentalUri: Uri? = null,
    val canvasUri: Uri? = null,
    val license: String = "non-commercial", // "non-commercial" | "commercial-use" | "commercial-remix"
    val revShare: Int = 0,
    val mintingFee: String = "0",
    val attestation: Boolean = false,
  )

  data class PublishResult(
    val ipId: String,
    val tokenId: String,
    val audioCid: String,
    val instrumentalCid: String,
    val coverCid: String,
    val canvasCid: String? = null,
    val licenseTermsIds: List<String> = emptyList(),
  )

  // ── Helpers ─────────────────────────────────────────────────────

  private fun sha256Hex(data: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(data)
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun sha256HexString(text: String): String = sha256Hex(text.toByteArray(Charsets.UTF_8))

  private fun keccak256(data: ByteArray): ByteArray {
    val digest = Keccak.Digest256()
    return digest.digest(data)
  }

  private fun normalizeHexNoPrefix(value: String): String {
    var cleaned = value.trim().trim('"').replace("\\", "")
    if (cleaned.startsWith("0x") || cleaned.startsWith("0X")) {
      cleaned = cleaned.substring(2)
    }
    cleaned = cleaned.lowercase()
    if (cleaned.isEmpty()) return ""
    if (!cleaned.all { it in '0'..'9' || it in 'a'..'f' }) {
      throw IllegalStateException("Invalid hex string from Lit signature payload: '$value'")
    }
    return if (cleaned.length % 2 == 1) "0$cleaned" else cleaned
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = normalizeHexNoPrefix(hex)
    if (clean.isEmpty()) return ByteArray(0)
    val out = ByteArray(clean.length / 2)
    for (i in out.indices) {
      val hi = clean[2 * i].digitToInt(16)
      val lo = clean[2 * i + 1].digitToInt(16)
      out[i] = ((hi shl 4) or lo).toByte()
    }
    return out
  }

  private fun parseRecoveryId(sig: JSONObject): Int? {
    val keys = listOf("recid", "recoveryId", "recovery_id", "v")
    for (key in keys) {
      if (!sig.has(key)) continue
      val raw = sig.opt(key) ?: continue
      val parsed = when (raw) {
        is Number -> raw.toInt()
        is String -> {
          val txt = raw.trim().trim('"').replace("\\", "")
          val noPrefix = txt.removePrefix("0x").removePrefix("0X")
          noPrefix.toIntOrNull(16) ?: txt.toIntOrNull()
        }
        else -> null
      } ?: continue
      return when (parsed) {
        0, 1 -> parsed
        27, 28 -> parsed - 27
        else -> null
      }
    }
    return null
  }

  private fun extractLitSignature(sig: JSONObject): Triple<ByteArray, ByteArray, Int?> {
    val hintedRecovery = parseRecoveryId(sig)

    val signatureField = sig.optString("signature", "").trim()
    if (signatureField.isNotBlank()) {
      val sigHex = normalizeHexNoPrefix(signatureField)
      if (sigHex.length >= 128) {
        val r = hexToBytes(sigHex.substring(0, 64))
        val s = hexToBytes(sigHex.substring(64, 128))
        val sigV = if (sigHex.length >= 130) {
          val vRaw = sigHex.substring(128, 130).toInt(16)
          when (vRaw) {
            0, 1 -> vRaw
            27, 28 -> vRaw - 27
            else -> null
          }
        } else {
          null
        }
        return Triple(r, s, sigV ?: hintedRecovery)
      }
    }

    val rHex = sig.optString("r", "").trim()
    val sHex = sig.optString("s", "").trim()
    if (rHex.isNotBlank() && sHex.isNotBlank()) {
      val r = hexToBytes(normalizeHexNoPrefix(rHex).padStart(64, '0'))
      val s = hexToBytes(normalizeHexNoPrefix(sHex).padStart(64, '0'))
      return Triple(r, s, hintedRecovery)
    }

    throw IllegalStateException("Unsupported Lit signature shape: $sig")
  }

  private fun recoverVForDigest(
    expectedAddress: String,
    digest32: ByteArray,
    r: ByteArray,
    s: ByteArray,
    hintedRecovery: Int?,
  ): Int {
    val expectedNo0x = expectedAddress.removePrefix("0x").lowercase()
    val candidates = buildList {
      if (hintedRecovery != null && hintedRecovery in 0..1) add(hintedRecovery)
      addAll(listOf(0, 1).filterNot { it in this })
    }

    val ecdsaSig = ECDSASignature(BigInteger(1, r), BigInteger(1, s))
    return candidates.firstOrNull { v ->
      runCatching {
        val pub = Sign.recoverFromSignature(v, ecdsaSig, digest32) ?: return@runCatching false
        Keys.getAddress(pub).lowercase() == expectedNo0x
      }.getOrDefault(false)
    } ?: throw IllegalStateException("Could not recover signer for $expectedAddress")
  }

  private fun parseLitSignatureFromResult(result: JSONObject): JSONObject {
    result.optJSONObject("signatures")?.optJSONObject("sig")?.let { return it }
    val response = result.optString("response", "")
    if (response.isNotBlank()) {
      runCatching { JSONObject(response) }.getOrNull()?.let { return it }
    }
    throw IllegalStateException("No signature returned from PKP")
  }

  private fun deriveEthAddressFromPkpPublicKey(pkpPublicKey: String): String? {
    val clean = pkpPublicKey.trim().removePrefix("0x").removePrefix("0X")
    val withoutPrefix = if (clean.startsWith("04") && clean.length == 130) clean.drop(2) else clean
    if (withoutPrefix.length != 128) return null
    return runCatching {
      "0x" + Keys.getAddress(BigInteger(withoutPrefix, 16)).lowercase()
    }.getOrNull()
  }

  private fun readUri(context: Context, uri: Uri): ByteArray {
    val stream = context.contentResolver.openInputStream(uri)
      ?: throw IllegalStateException("Cannot open URI: $uri")
    return stream.use { it.readBytes() }
  }

  private fun getMimeType(context: Context, uri: Uri): String {
    return context.contentResolver.getType(uri) ?: "application/octet-stream"
  }

  private suspend fun executeJsResultWithAuthRecovery(
    context: Context,
    network: String,
    rpcUrl: String,
    code: String = "",
    ipfsId: String = "",
    jsParamsJson: String = "",
    useSingleNode: Boolean = false,
  ): JSONObject {
    val raw = LitAuthContextManager.runWithSavedStateRecovery(context) {
      LitRust.executeJsRaw(
        network = network,
        rpcUrl = rpcUrl,
        code = code,
        ipfsId = ipfsId,
        jsParamsJson = jsParamsJson,
        useSingleNode = useSingleNode,
      )
    }
    return LitRust.unwrapEnvelope(raw)
  }

  /**
   * Upload files to Filebase via heaven-api proxy.
   * Returns map of slot name → CID.
   */
  private fun proxyUpload(
    files: List<Triple<String, ByteArray, String>>, // slot, data, contentType
  ): Map<String, String> {
    val boundary = "----HeavenPublish${System.currentTimeMillis()}"
    val url = URL("$HEAVEN_API_URL/api/upload")
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = "POST"
    conn.doOutput = true
    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
    conn.connectTimeout = 120_000
    conn.readTimeout = 120_000

    conn.outputStream.use { out ->
      for ((slot, data, contentType) in files) {
        val ext = contentType.substringAfter("/", "bin")
        out.write("--$boundary\r\n".toByteArray())
        out.write("Content-Disposition: form-data; name=\"$slot\"; filename=\"$slot.$ext\"\r\n".toByteArray())
        out.write("Content-Type: $contentType\r\n\r\n".toByteArray())
        out.write(data)
        out.write("\r\n".toByteArray())
      }
      out.write("--$boundary--\r\n".toByteArray())
    }

    if (conn.responseCode !in 200..299) {
      val err = conn.errorStream?.bufferedReader()?.readText() ?: "HTTP ${conn.responseCode}"
      throw IllegalStateException("Upload failed: $err")
    }

    val body = conn.inputStream.bufferedReader().readText()
    val json = JSONObject(body)
    val slots = json.getJSONObject("slots")
    val result = mutableMapOf<String, String>()
    for (key in slots.keys()) {
      result[key] = slots.getJSONObject(key).getString("cid")
    }
    return result
  }

  private data class ArweaveCoverUpload(
    val id: String,
    val ref: String,
    val arweaveUrl: String,
  )

  private fun contentTypeToExt(contentType: String): String {
    return when (contentType.lowercase()) {
      "image/png" -> "png"
      "image/webp" -> "webp"
      "image/gif" -> "gif"
      else -> "jpg"
    }
  }

  private fun prepareCoverForArweave(
    bytes: ByteArray,
    contentType: String,
  ): Pair<ByteArray, String> {
    if (bytes.size <= MAX_ARWEAVE_COVER_BYTES && contentType.startsWith("image/")) {
      return bytes to contentType
    }

    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      ?: throw IllegalStateException("Could not decode cover image for Arweave upload")

    val maxDims = intArrayOf(1024, 896, 768, 640, 512, 448, 384, 320, 256)
    val qualities = intArrayOf(86, 80, 74, 68, 62, 56, 50, 44)

    try {
      for (maxDim in maxDims) {
        val scale = minOf(1f, maxDim.toFloat() / maxOf(bitmap.width, bitmap.height).toFloat())
        val targetW = maxOf(1, (bitmap.width * scale).toInt())
        val targetH = maxOf(1, (bitmap.height * scale).toInt())

        val scaled = if (targetW == bitmap.width && targetH == bitmap.height) {
          bitmap
        } else {
          Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
        }

        try {
          for (q in qualities) {
            val baos = ByteArrayOutputStream()
            if (!scaled.compress(Bitmap.CompressFormat.JPEG, q, baos)) continue
            val out = baos.toByteArray()
            if (out.size <= MAX_ARWEAVE_COVER_BYTES) {
              return out to "image/jpeg"
            }
          }
        } finally {
          if (scaled !== bitmap) scaled.recycle()
        }
      }
    } finally {
      bitmap.recycle()
    }

    throw IllegalStateException("Unable to compress cover below $MAX_ARWEAVE_COVER_BYTES bytes for Arweave upload")
  }

  private fun uploadCoverToArweave(
    coverBytes: ByteArray,
    coverContentType: String,
  ): ArweaveCoverUpload {
    val (preparedBytes, preparedType) = prepareCoverForArweave(coverBytes, coverContentType)
    val boundary = "----HeavenArweaveCover${System.currentTimeMillis()}"
    val url = URL("$HEAVEN_API_URL/api/arweave/cover")
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = "POST"
    conn.doOutput = true
    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
    conn.connectTimeout = 120_000
    conn.readTimeout = 120_000

    val ext = contentTypeToExt(preparedType)
    val tags = """[{"key":"App-Name","value":"Heaven"},{"key":"Upload-Source","value":"android-song-publish"}]"""

    conn.outputStream.use { out ->
      out.write("--$boundary\r\n".toByteArray())
      out.write("Content-Disposition: form-data; name=\"file\"; filename=\"cover.$ext\"\r\n".toByteArray())
      out.write("Content-Type: $preparedType\r\n\r\n".toByteArray())
      out.write(preparedBytes)
      out.write("\r\n".toByteArray())

      out.write("--$boundary\r\n".toByteArray())
      out.write("Content-Disposition: form-data; name=\"contentType\"\r\n\r\n".toByteArray())
      out.write(preparedType.toByteArray())
      out.write("\r\n".toByteArray())

      out.write("--$boundary\r\n".toByteArray())
      out.write("Content-Disposition: form-data; name=\"tags\"\r\n\r\n".toByteArray())
      out.write(tags.toByteArray())
      out.write("\r\n".toByteArray())

      out.write("--$boundary--\r\n".toByteArray())
    }

    val responseBody = if (conn.responseCode in 200..299) {
      conn.inputStream.bufferedReader().readText()
    } else {
      conn.errorStream?.bufferedReader()?.readText() ?: "HTTP ${conn.responseCode}"
    }

    if (conn.responseCode !in 200..299) {
      throw IllegalStateException("Arweave cover upload failed: $responseBody")
    }

    val json = JSONObject(responseBody)
    val id = json.optString("id", "")
    val ref = json.optString("ref", "")
    val arweaveUrl = json.optString("arweaveUrl", "")
      .ifBlank { if (id.isNotBlank()) "$ARWEAVE_GATEWAY/$id" else "" }

    if (id.isBlank() || ref.isBlank() || !ref.startsWith("ar://")) {
      throw IllegalStateException("Invalid Arweave cover upload response: $responseBody")
    }

    return ArweaveCoverUpload(
      id = id,
      ref = ref,
      arweaveUrl = arweaveUrl,
    )
  }

  /**
   * Sign an EIP-191 message via PKP using a Lit Action.
   */
  private suspend fun signMessageWithPKP(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    pkpPublicKey: String,
    expectedAddress: String,
    message: String,
  ): String {
    val code = """
      (async () => {
        await Lit.Actions.ethPersonalSignMessageEcdsa({
          message: jsParams.message,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
      })();
    """.trimIndent()

    val jsParams = JSONObject().apply {
      put("publicKey", pkpPublicKey)
      put("message", message)
    }

    val result = executeJsResultWithAuthRecovery(
      context = context,
      network = litNetwork,
      rpcUrl = litRpcUrl,
      code = code,
      jsParamsJson = jsParams.toString(),
    )
    val sig = parseLitSignatureFromResult(result)
    val (r, s, hintedRecovery) = extractLitSignature(sig)

    val messageBytes = message.toByteArray(Charsets.UTF_8)
    val prefix = "\u0019Ethereum Signed Message:\n${messageBytes.size}".toByteArray(Charsets.UTF_8)
    val digest = keccak256(prefix + messageBytes)
    val recoveredV = recoverVForDigest(expectedAddress, digest, r, s, hintedRecovery)

    val sigBytes = ByteArray(65)
    System.arraycopy(r, 0, sigBytes, 0, 32)
    System.arraycopy(s, 0, sigBytes, 32, 32)
    sigBytes[64] = (27 + recoveredV).toByte()
    return "0x" + sigBytes.joinToString("") { "%02x".format(it) }
  }

  /**
   * Sign EIP-712 typed data via PKP using a Lit Action.
   */
  private suspend fun signTypedDataWithPKP(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    pkpPublicKey: String,
    expectedAddress: String,
    typedDataHashHex: String,
  ): String {
    val code = """
      (async () => {
        const hashBytes = [];
        const hex = jsParams.hashHex.replace('0x', '');
        for (let i = 0; i < hex.length; i += 2) {
          hashBytes.push(parseInt(hex.substr(i, 2), 16));
        }
        const toSign = new Uint8Array(hashBytes);
        await Lit.Actions.signEcdsa({
          toSign: toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
      })();
    """.trimIndent()

    val jsParams = JSONObject().apply {
      put("publicKey", pkpPublicKey)
      put("hashHex", typedDataHashHex)
    }

    val result = executeJsResultWithAuthRecovery(
      context = context,
      network = litNetwork,
      rpcUrl = litRpcUrl,
      code = code,
      jsParamsJson = jsParams.toString(),
    )
    val sig = parseLitSignatureFromResult(result)
    val (r, s, hintedRecovery) = extractLitSignature(sig)

    val digest = hexToBytes(typedDataHashHex)
    if (digest.size != 32) throw IllegalStateException("typedDataHashHex must be 32 bytes")
    val recoveredV = recoverVForDigest(expectedAddress, digest, r, s, hintedRecovery)

    val sigBytes = ByteArray(65)
    System.arraycopy(r, 0, sigBytes, 0, 32)
    System.arraycopy(s, 0, sigBytes, 32, 32)
    sigBytes[64] = (27 + recoveredV).toByte()
    return "0x" + sigBytes.joinToString("") { "%02x".format(it) }
  }

  /**
   * Compute EIP-712 typed data hash for Story registration.
   * Uses the same domain/types as the SolidJS version.
   */
  private suspend fun computeStoryTypedDataHash(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    recipient: String,
    ipMetadataHash: String,
    nftMetadataHash: String,
    commercialRevShare: Int,
    defaultMintingFee: String,
    timestamp: Long,
    nonce: String,
  ): String {
    // We compute this on-device via a Lit Action (ethers is available there)
    // This avoids needing an ethers dependency in the Kotlin app
    val code = """
      (async () => {
        const domain = {
          name: 'Heaven Song Registration',
          version: '1',
          chainId: 1315,
        };
        const types = {
          RegisterSong: [
            { name: 'recipient', type: 'address' },
            { name: 'ipMetadataHash', type: 'bytes32' },
            { name: 'nftMetadataHash', type: 'bytes32' },
            { name: 'commercialRevShare', type: 'uint32' },
            { name: 'defaultMintingFee', type: 'uint256' },
            { name: 'timestamp', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
          ],
        };
        const value = {
          recipient: jsParams.recipient,
          ipMetadataHash: jsParams.ipMetadataHash,
          nftMetadataHash: jsParams.nftMetadataHash,
          commercialRevShare: jsParams.commercialRevShare,
          defaultMintingFee: jsParams.defaultMintingFee,
          timestamp: jsParams.timestamp,
          nonce: jsParams.nonce,
        };
        const hash = ethers.utils.TypedDataEncoder
          ? ethers.utils.TypedDataEncoder.hash(domain, types, value)
          : ethers.utils._TypedDataEncoder.hash(domain, types, value);
        Lit.Actions.setResponse({ response: JSON.stringify({ hash }) });
      })();
    """.trimIndent()

    val jsParams = JSONObject().apply {
      put("recipient", recipient)
      put("ipMetadataHash", ipMetadataHash)
      put("nftMetadataHash", nftMetadataHash)
      put("commercialRevShare", commercialRevShare)
      put("defaultMintingFee", defaultMintingFee)
      put("timestamp", timestamp.toString())
      put("nonce", nonce)
    }

    // Use single node for this hash computation (faster, no consensus needed).
    val result = executeJsResultWithAuthRecovery(
      context = context,
      network = litNetwork,
      rpcUrl = litRpcUrl,
      code = code,
      jsParamsJson = jsParams.toString(),
      useSingleNode = true,
    )
    val response = JSONObject(result.getString("response"))
    return response.getString("hash")
  }

  // ── Main publish function ───────────────────────────────────────

  /**
   * Publish a song. Must be called on a background thread (IO dispatcher).
   *
   * @param context Android context for reading URIs
   * @param formData The form data with file URIs and metadata
   * @param litNetwork Lit network (must be naga-dev)
   * @param litRpcUrl Lit RPC URL
   * @param pkpPublicKey User's PKP public key
   * @param pkpEthAddress User's PKP Ethereum address
   * @param onProgress Callback for progress updates (0-100)
   */
  suspend fun publish(
    context: Context,
    formData: SongFormData,
    litNetwork: String,
    litRpcUrl: String,
    pkpPublicKey: String,
    pkpEthAddress: String,
    onProgress: (Int) -> Unit,
  ): PublishResult {
    if (litNetwork != "naga-dev") {
      throw IllegalStateException("Unsupported Lit network: $litNetwork (this app is dev-only: naga-dev)")
    }
    val cids = CID_MAP.getValue("naga-dev")
    val songPublishV2Cid = cids["songPublishV2"]
      ?.takeIf { it.isNotBlank() } ?: throw IllegalStateException("SONG_PUBLISH_V2_CID not set for $litNetwork")
    val storyRegisterCid = cids["storyRegisterSponsor"]
      ?.takeIf { it.isNotBlank() } ?: throw IllegalStateException("STORY_REGISTER_SPONSOR_CID not set for $litNetwork")
    val lyricsTranslateCid = cids["lyricsTranslate"] ?: ""
    val contentRegisterCid = cids["contentRegisterMegaethV1"] ?: ""
    val trackCoverV5Cid = cids["trackCoverV5"] ?: ""

    val derivedAddress = deriveEthAddressFromPkpPublicKey(pkpPublicKey)
    if (derivedAddress != null && derivedAddress != pkpEthAddress.lowercase()) {
      throw IllegalStateException(
        "PKP mismatch: public key resolves to $derivedAddress but provided pkpEthAddress is ${pkpEthAddress.lowercase()}",
      )
    }

    // ── Step 1: Read files (0-5%) ───────────────────────────────
    onProgress(2)

    val audioUri = formData.audioUri ?: throw IllegalStateException("Audio file is required")
    val vocalsUri = formData.vocalsUri ?: throw IllegalStateException("Vocals stem file is required")
    val instrumentalUri = formData.instrumentalUri ?: throw IllegalStateException("Instrumental file is required")
    val coverUri = formData.coverUri ?: throw IllegalStateException("Cover image is required")

    val audioBytes = readUri(context, audioUri)
    val vocalsBytes = readUri(context, vocalsUri)
    val instrumentalBytes = readUri(context, instrumentalUri)
    val coverBytes = readUri(context, coverUri)
    val canvasBytes = formData.canvasUri?.let { readUri(context, it) }

    val audioMime = getMimeType(context, audioUri)
    val vocalsMime = getMimeType(context, vocalsUri)
    val instrumentalMime = getMimeType(context, instrumentalUri)
    val coverMime = getMimeType(context, coverUri)
    val canvasMime = formData.canvasUri?.let { getMimeType(context, it) }

    onProgress(5)

    // ── Step 2: Upload cover to Arweave + pre-upload media (5-15%) ─
    val arweaveCover = uploadCoverToArweave(coverBytes, coverMime)
    val coverRef = arweaveCover.ref

    val uploadFiles = mutableListOf(
      Triple("audio", audioBytes, audioMime),
      Triple("vocals", vocalsBytes, vocalsMime),
      Triple("instrumental", instrumentalBytes, instrumentalMime),
    )
    if (canvasBytes != null && canvasMime != null) {
      uploadFiles.add(Triple("canvas", canvasBytes, canvasMime))
    }

    val cidMap = proxyUpload(uploadFiles)

    val audioUrl = "$IPFS_GATEWAY${cidMap["audio"]}"
    val vocalsUrl = "$IPFS_GATEWAY${cidMap["vocals"]}"
    val instrumentalUrl = "$IPFS_GATEWAY${cidMap["instrumental"]}"
    val canvasUrl = cidMap["canvas"]?.let { "$IPFS_GATEWAY$it" }

    onProgress(15)

    // ── Step 3: Build metadata JSONs (15-20%) ───────────────────
    val sourceLanguageName = LANG_CODE_TO_NAME[formData.primaryLanguage] ?: formData.primaryLanguage
    val targetLanguage = formData.secondaryLanguage.ifBlank {
      if (formData.primaryLanguage != "en") "en" else "es"
    }

    val songMetadata = JSONObject().apply {
      put("title", formData.title)
      put("artist", formData.artist)
      put("genre", formData.genre)
      put("primaryLanguage", formData.primaryLanguage)
      if (formData.secondaryLanguage.isNotBlank()) put("secondaryLanguage", formData.secondaryLanguage)
      put("license", formData.license)
      put("version", "1.0.0")
    }.toString()

    val ipaMetadata = JSONObject().apply {
      put("title", formData.title)
      put("artist", formData.artist)
      put("genre", formData.genre)
      put("language", formData.primaryLanguage)
    }.toString()

    val nftMetadata = JSONObject().apply {
      put("name", formData.title)
      put("description", "${formData.title} by ${formData.artist}")
      put("external_url", "")
    }.toString()

    // ── Step 4: Hash all content (20-25%) ────────────────────────
    val audioHash = sha256Hex(audioBytes)
    val coverHash = sha256Hex(coverBytes)
    val instrumentalHash = sha256Hex(instrumentalBytes)
    val vocalsHash = sha256Hex(vocalsBytes)
    val songMetadataHash = sha256HexString(songMetadata)
    val ipaMetadataHash = sha256HexString(ipaMetadata)
    val nftMetadataHashStr = sha256HexString(nftMetadata)
    if (formData.lyrics.isBlank()) throw IllegalStateException("Lyrics are required")
    val lyricsText = formData.lyrics
    val lyricsHash = sha256HexString(lyricsText)
    val canvasHash = canvasBytes?.let { sha256Hex(it) } ?: ""

    onProgress(25)

    // ── Step 5: Sign EIP-191 binding message (25-30%) ───────────
    val timestamp = System.currentTimeMillis()
    val nonce = (Math.random() * 1_000_000).toLong().toString()

    val message = "heaven:publish:$audioHash:$coverHash:$instrumentalHash:$vocalsHash:$canvasHash:" +
      "$songMetadataHash:$ipaMetadataHash:$nftMetadataHashStr:$lyricsHash:" +
      "$sourceLanguageName:$targetLanguage:$timestamp:$nonce"

    val signature = signMessageWithPKP(
      context = context,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      pkpPublicKey = pkpPublicKey,
      expectedAddress = pkpEthAddress,
      message = message,
    )

    onProgress(30)

    // ── Step 6: Call song-publish-v2 Lit Action (30-65%) ─────────
    android.util.Log.i(TAG, "Calling song-publish-v2 Lit Action (CID: $songPublishV2Cid)")

    val publishJsParams = JSONObject().apply {
      put("userPkpPublicKey", pkpPublicKey)
      put("audioRef", audioUrl)
      put("coverRef", coverRef)
      put("vocalsRef", vocalsUrl)
      put("instrumentalRef", instrumentalUrl)
      if (canvasUrl != null) put("canvasRef", canvasUrl)
      put("storageMode", "filebase")
      put("songMetadataJson", songMetadata)
      put("ipaMetadataJson", ipaMetadata)
      put("nftMetadataJson", nftMetadata)
      put("signature", signature)
      put("timestamp", timestamp)
      put("nonce", nonce)
      put("lyricsText", lyricsText)
      put("sourceLanguage", sourceLanguageName)
      put("targetLanguage", targetLanguage)
      put("storageEncryptedKey", filebaseEncryptedKey(songPublishV2Cid))
      put("elevenlabsEncryptedKey", elevenlabsEncryptedKey(songPublishV2Cid))
      put("openrouterEncryptedKey", openrouterEncryptedKey(songPublishV2Cid))
    }

    suspend fun executeSongPublishAction(): JSONObject {
      val result = executeJsResultWithAuthRecovery(
        context = context,
        network = litNetwork,
        rpcUrl = litRpcUrl,
        ipfsId = songPublishV2Cid,
        jsParamsJson = publishJsParams.toString(),
      )
      val responseStr = result.optString("response", "")
      if (responseStr.isBlank()) throw IllegalStateException("No response from song-publish-v2")
      return JSONObject(responseStr)
    }

    var publishResponse = executeSongPublishAction()
    if (!publishResponse.optBoolean("success", false)) {
      val actionError = publishResponse.optString("error", "unknown")
      val shouldRetryDecrypt = actionError.lowercase().contains("decrypt and combine")
      if (shouldRetryDecrypt) {
        android.util.Log.w(
          TAG,
          "song-publish-v2 decryptAndCombine failed; forcing auth context refresh and retrying once",
        )
        LitAuthContextManager.ensureFromSavedState(context, forceRefresh = true)
        publishResponse = executeSongPublishAction()
      }
      if (!publishResponse.optBoolean("success", false)) {
        throw IllegalStateException(
          "Song publish failed: ${publishResponse.optString("error", "unknown")} " +
            "(network=$litNetwork cid=$songPublishV2Cid)",
        )
      }
    }

    onProgress(65)

    // ── Step 7: Sign EIP-712 for Story registration (65-70%) ────
    val revShare = if (formData.license == "non-commercial") 0 else formData.revShare
    val storyTimestamp = System.currentTimeMillis()
    val storyNonce = (Math.random() * 1_000_000).toLong().toString()

    val ipMetadataURI = "$IPFS_GATEWAY${publishResponse.getString("ipaMetadataCID")}"
    val nftMetadataURI = "$IPFS_GATEWAY${publishResponse.getString("nftMetadataCID")}"
    val ipMetadataHashHex = "0x$ipaMetadataHash"
    val nftMetadataHashHex = "0x$nftMetadataHashStr"

    val typedDataHash = computeStoryTypedDataHash(
      context = context,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      recipient = pkpEthAddress,
      ipMetadataHash = ipMetadataHashHex,
      nftMetadataHash = nftMetadataHashHex,
      commercialRevShare = revShare,
      defaultMintingFee = formData.mintingFee.ifBlank { "0" },
      timestamp = storyTimestamp,
      nonce = storyNonce,
    )

    val storySignature = signTypedDataWithPKP(
      context = context,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      pkpPublicKey = pkpPublicKey,
      expectedAddress = pkpEthAddress,
      typedDataHashHex = typedDataHash,
    )

    onProgress(70)

    // ── Step 8: Call story-register-sponsor-v1 Lit Action (70-88%)
    android.util.Log.i(TAG, "Calling story-register-sponsor-v1 (CID: $storyRegisterCid)")

    val storyJsParams = JSONObject().apply {
      put("recipient", pkpEthAddress)
      put("ipMetadataURI", ipMetadataURI)
      put("ipMetadataHash", ipMetadataHashHex)
      put("nftMetadataURI", nftMetadataURI)
      put("nftMetadataHash", nftMetadataHashHex)
      put("commercialRevShare", revShare)
      put("defaultMintingFee", formData.mintingFee.ifBlank { "0" })
      put("signature", storySignature)
      put("timestamp", storyTimestamp)
      put("nonce", storyNonce)
    }

    val storyResult = executeJsResultWithAuthRecovery(
      context = context,
      network = litNetwork,
      rpcUrl = litRpcUrl,
      ipfsId = storyRegisterCid,
      jsParamsJson = storyJsParams.toString(),
    )
    val storyResponseStr = storyResult.optString("response", "")
    if (storyResponseStr.isBlank()) throw IllegalStateException("No response from story-register-sponsor-v1")
    val storyResponse = JSONObject(storyResponseStr)
    if (!storyResponse.optBoolean("success", false)) {
      throw IllegalStateException("Story registration failed: ${storyResponse.optString("error", "unknown")}")
    }

    onProgress(88)

    val trackId = computeTrackId(
      context = context,
      litNetwork = litNetwork,
      litRpcUrl = litRpcUrl,
      title = formData.title,
      artist = formData.artist,
      album = "",
    )

    // ── Step 9: Register on ContentRegistry MegaETH (88-95%) ────
    if (contentRegisterCid.isNotBlank()) {
      try {
        val audioCid = publishResponse.getString("audioCID")
        android.util.Log.i(TAG, "Registering on ContentRegistry (MegaETH): trackId=$trackId audioCid=$audioCid")

        val regTimestamp = System.currentTimeMillis().toString()
        val regNonce = UUID.randomUUID().toString()

        val regJsParams = JSONObject().apply {
          put("userPkpPublicKey", pkpPublicKey)
          put("trackId", trackId)
          put("pieceCid", audioCid)
          put("algo", 1)
          put("timestamp", regTimestamp)
          put("nonce", regNonce)
          put("title", formData.title)
          put("artist", formData.artist)
          put("album", "")
        }

        val regResult = executeJsResultWithAuthRecovery(
          context = context,
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = contentRegisterCid,
          jsParamsJson = regJsParams.toString(),
        )
        val regResponse = JSONObject(regResult.optString("response", "{}"))
        if (!regResponse.optBoolean("success", false)) {
          android.util.Log.w(TAG, "ContentRegistry registration failed: ${regResponse.optString("error")}")
        } else {
          android.util.Log.i(TAG, "ContentRegistry registered successfully")
        }
      } catch (e: Exception) {
        android.util.Log.w(TAG, "ContentRegistry registration failed (non-fatal): ${e.message}")
      }
    }

    // ── Step 10: Set on-chain cover via track-cover-v5 (non-fatal) ─
    if (trackCoverV5Cid.isNotBlank()) {
      try {
        val coverTimestamp = System.currentTimeMillis().toString()
        val coverNonce = UUID.randomUUID().toString()
        val tracks = JSONArray().put(JSONObject().apply {
          put("trackId", trackId)
          put("coverCid", coverRef)
        })
        val coverJsParams = JSONObject().apply {
          put("userPkpPublicKey", pkpPublicKey)
          put("tracks", tracks)
          put("timestamp", coverTimestamp)
          put("nonce", coverNonce)
        }

        val coverResult = executeJsResultWithAuthRecovery(
          context = context,
          network = litNetwork,
          rpcUrl = litRpcUrl,
          ipfsId = trackCoverV5Cid,
          jsParamsJson = coverJsParams.toString(),
        )
        val coverResponse = JSONObject(coverResult.optString("response", "{}"))
        if (!coverResponse.optBoolean("success", false)) {
          android.util.Log.w(TAG, "track-cover-v5 failed (non-fatal): ${coverResponse.optString("error")}")
        }
      } catch (e: Exception) {
        android.util.Log.w(TAG, "track-cover-v5 failed (non-fatal): ${e.message}")
      }
    } else {
      android.util.Log.w(TAG, "trackCoverV5 CID not set for $litNetwork; skipping cover write")
    }

    onProgress(95)

    // ── Step 11: Auto-translate lyrics (95-100%, best-effort) ────
    if (lyricsTranslateCid.isNotBlank() && lyricsText != "(instrumental)") {
      val targetLangs = AUTO_TRANSLATE_LANGS.filter { it != formData.primaryLanguage }
      if (targetLangs.isNotEmpty()) {
        try {
          val ipIdAddress = storyResponse.getString("ipId")
          val translateTimestamp = System.currentTimeMillis()
          val translateNonce = (Math.random() * 1_000_000).toLong().toString()
          val translateLyricsHash = sha256HexString(lyricsText)
          val sortedLangs = targetLangs.sorted().joinToString(",")
          val translateMessage = "heaven:translate:$ipIdAddress:$translateLyricsHash:$sourceLanguageName:$sortedLangs:$translateTimestamp:$translateNonce"

          val translateSignature = signMessageWithPKP(
            context = context,
            litNetwork = litNetwork,
            litRpcUrl = litRpcUrl,
            pkpPublicKey = pkpPublicKey,
            expectedAddress = pkpEthAddress,
            message = translateMessage,
          )

          val translateJsParams = JSONObject().apply {
            put("userPkpPublicKey", pkpPublicKey)
            put("ipId", ipIdAddress)
            put("lyricsText", lyricsText)
            put("sourceLanguage", sourceLanguageName)
            put("targetLanguages", JSONArray(targetLangs))
            put("signature", translateSignature)
            put("timestamp", translateTimestamp)
            put("nonce", translateNonce)
            put("filebaseEncryptedKey", lyricsFilebaseEncryptedKey(lyricsTranslateCid))
            put("openrouterEncryptedKey", lyricsOpenrouterEncryptedKey(lyricsTranslateCid))
          }

          executeJsResultWithAuthRecovery(
            context = context,
            network = litNetwork,
            rpcUrl = litRpcUrl,
            ipfsId = lyricsTranslateCid,
            jsParamsJson = translateJsParams.toString(),
          )
        } catch (e: Exception) {
          android.util.Log.w(TAG, "Auto-translate failed (best-effort): ${e.message}")
        }
      }
    }

    onProgress(100)

    val result = PublishResult(
      ipId = storyResponse.getString("ipId"),
      tokenId = storyResponse.getString("tokenId"),
      audioCid = publishResponse.getString("audioCID"),
      instrumentalCid = publishResponse.getString("instrumentalCID"),
      coverCid = coverRef,
      canvasCid = publishResponse.optString("canvasCID", "").ifBlank { null },
      licenseTermsIds = storyResponse.optJSONArray("licenseTermsIds")?.let { arr ->
        (0 until arr.length()).map { arr.getString(it) }
      } ?: emptyList(),
    )

    runCatching {
      RecentlyPublishedSongsStore.record(
        context = context,
        title = formData.title,
        artist = formData.artist,
        audioCid = result.audioCid,
        coverCid = result.coverCid,
      )
    }.onFailure { err ->
      android.util.Log.w(TAG, "Failed to cache recently published song", err)
    }

    return result
  }

  /**
   * Compute a trackId matching the SolidJS computeTrackId():
   * keccak256(abi.encode(uint8(3), keccak256(abi.encode(title, artist, album))))
   *
   * We compute this via a Lit Action since ethers is available there.
   */
  private suspend fun computeTrackId(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    title: String,
    artist: String,
    album: String,
  ): String {
    val code = """
      (async () => {
        const inner = ethers.utils.defaultAbiCoder.encode(
          ['string', 'string', 'string'],
          [jsParams.title, jsParams.artist, jsParams.album]
        );
        const innerHash = ethers.utils.keccak256(inner);
        const outer = ethers.utils.defaultAbiCoder.encode(
          ['uint8', 'bytes32'],
          [3, innerHash]
        );
        const trackId = ethers.utils.keccak256(outer);
        Lit.Actions.setResponse({ response: JSON.stringify({ trackId }) });
      })();
    """.trimIndent()

    val jsParams = JSONObject().apply {
      put("title", title)
      put("artist", artist)
      put("album", album)
    }

    val result = executeJsResultWithAuthRecovery(
      context = context,
      network = litNetwork,
      rpcUrl = litRpcUrl,
      code = code,
      jsParamsJson = jsParams.toString(),
      useSingleNode = true,
    )
    val response = JSONObject(result.getString("response"))
    return response.getString("trackId")
  }
}
