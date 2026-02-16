package com.pirate.app.music

import android.content.Context
import android.net.Uri
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.lit.LitRust
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID

/**
 * Song Publish Service — Kotlin port of song-publish.ts
 *
 * Orchestrates the full publish pipeline:
 * 1. Read files from URIs
 * 2. Pre-upload to Filebase via heaven-api proxy
 * 3. Build metadata JSONs
 * 4. SHA-256 hash all content + sign EIP-191 via PKP
 * 5. Call song-publish-v1 Lit Action (IPFS upload, lyrics alignment, translation)
 * 6. Sign EIP-712 typed data for Story registration via PKP
 * 7. Call story-register-sponsor-v1 Lit Action (mint NFT, register IP, attach license)
 * 8. Register on ContentRegistry (MegaETH) for subgraph indexing
 * 9. Auto-translate lyrics (best-effort)
 */
object SongPublishService {

  private const val TAG = "SongPublish"
  private const val IPFS_GATEWAY = "https://ipfs.filebase.io/ipfs/"
  private const val HEAVEN_API_URL = "https://heaven-api.deletion-backup782.workers.dev"

  // ── CID maps (mirrors action-cids.ts) ──────────────────────────

  private val CID_MAP = mapOf(
    "naga-dev" to mapOf(
      "songPublish" to "QmcGA2ur8tGt5GDiQo6j21aY2Jc6aVGPvT6PyoqMBXKjXr",
      "storyRegisterSponsor" to "QmZ38qG34PKnENxzV8eejbRwiqQf2aRFKuNKqJNTXvU43Q",
      "lyricsTranslate" to "QmViMXk72SZdjoWWuXP6kUsxB3BHzrK2ZN934YPFKmXBeV",
      "contentRegisterMegaethV1" to "QmRFuAAYCmri8kTCmJupF9AZWhYmvKnhNhVyqr5trRfZhS",
    ),
    "naga-test" to mapOf(
      "songPublish" to "QmNUVHTrU4S823gp2JaP19hAZCCqpwdvzFrs35GiECuXAJ",
      "storyRegisterSponsor" to "QmQi5mVzt4u6ViXZYkZYrmFu7oXFEJjx7Fzc6YUYyUcSEt",
      "lyricsTranslate" to "QmUrbZY5MWrBFhfgoDLaxNwXchJgeB5vsRMMLMzRprvUu3",
      "contentRegisterMegaethV1" to "",
    ),
  )

  // ── Encrypted API keys (bound to song-publish-v1 action CID) ────

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
    CID_MAP.getValue("naga-dev").getValue("songPublish") to "tWWiSlN4hS1j5zT6xBLC61/D3tFVwo7IbMCx2omAdZHXNldU4xwVtr36fy5HozAY92GCU+jx8pmooLRKTolxt04JviE16IlIpVAR5XajqV5lIgYcmZ8ZLejkqDITO1GoF0juzkwL8u+TlD+kLnczUuCOKiizpRjiB/2dyLRFttfT5cUEOJSiWxyN/xl2t/KzKI0RGM1VXQje3s4Mp2cn9Vs5iiyVq0XzZ1unMmqZne4mBWstl3cC",
    CID_MAP.getValue("naga-test").getValue("songPublish") to "rG/IQhwV9GxbF62qSXIby+c+MJO/jj9K5CJlSbFcJsiI9M6xL/2bSGL5qfGR5ODpX0XNBHN51u0VuA+iVXR/CW7KjS/jX2Af8t9FcOVS5Z1l9tjy5BJRJxfPzI+axSIqd9L8wntI/nWgt16eML2V0B6ltgzCgwTfztNofNZrgdVKifvpTB1gfsRNY6aFtmzdejOQIZ3PuRK8j7Vcx7jmp4Y5fDUb2jAsjpPHf3wWJ3CFVYlaA6EC",
  )

  private val songPublishElevenlabsCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("songPublish") to "kZPov5eAHRzrlnvndj1W3HXWRgTIhAjr5MKVB5sUeoW63HinMg4fZT7KLbPGC2KZX0NLkVHPDl59lV+hyUadxlrDuDaDnTkU4r5oR4X5C700uxSgli0vUXqFAdhm3jYKpf+1QuS9srFQp9R1zUKlQSj2dQy7ucJHZOXqK2cQ4xu/ytRcyAI=",
    CID_MAP.getValue("naga-test").getValue("songPublish") to "sA9lX823Ag3z1aHKbXTwsj+aCVHUj2RbO5BXpe9+HGh+1IXoTtnJ1O6Rrxcwe3BXapMZCpI6O3HftHPpQWheMt3K66Zc7+05rL4WHZeK5/g0ALX+HZTV3fwUoJmkvYFjZ2eLF8+ADVxpqMSsXOB3p70FyfdaTa1XPiN1HG74GT5U/rf0WgI=",
  )

  private val songPublishOpenrouterCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("songPublish") to "iRVcOcNnPeejpfrZ8rmQeynHl0pj8xoVvJBo3nVPzKCEHXNB+MBp6tq6phUaM7kVTRX2iIY/upFkXrJrBhAhXcIfxB3ZkVRuiThFs9x+rlBKyxZkHhpCld8z+3+bVR7gxwoNunt9Bm5lz3pJLiRzx0t2D0rVij0jjpt90rUqHvfvqzduO1v75b3fpSv2YpJkSb+0tSmpv2VN1tIC",
    CID_MAP.getValue("naga-test").getValue("songPublish") to "qpLLZkw3eBthek6QLNB0l5lb9EyZlHFd8RRnJyGWa365643ib6f1gDlV2pbleWsHVBCWF5HkoNwgFvK1pugxfkRKJydbp+Da+nPFFw5+8SpKGrie+4bKi4IHHjrgm7F6azdbJGlyphGDvUdIvvFapRi0YHeS9fd72Ekqv7fWJ7faQM67oOucjEFPRdyr44+xEGFfxVDAK60LT+sC",
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
    CID_MAP.getValue("naga-test").getValue("lyricsTranslate") to "r4XJJo7YOcfxJUp87pmNEAgupBmqR8sqh5wmS2e1HQIbNCK/Yp0F0Lmblm3HXDtx1mYuhDuoV5PoBuXSNJ9lEb6GcS6aZtTqgHPr2oiCMnhlpEssFRuKRx05HU19Ar0gB1tFiqiIewcn+4FtkMWiy8HGJT7nCikKWd81cIToLV5Zr8RH1Ht1w0av1dse+fHm0CMjJdrKcyAKOW+u5ImOYmf2sImx4B+TyuTEdgbbZBqBdFPnWPQC",
  )

  private val lyricsOpenrouterCiphertextByCid = mapOf(
    CID_MAP.getValue("naga-dev").getValue("lyricsTranslate") to "o/7W0AEqLIdlO6GriIAs5iwxPJ/3JG2ctRysJKRZN0j67xW1kl23sD9fkTRCXr2FhnmFMfSoLB5r0cGD7hAEP3J7jCZIJa0k+xrWn7gjnORKqMpZl1G5LR+V9MV1UVSmrydFubnmnNWF3pBGkvUGDVl/RrYGgUJ0G9XOSYqHjxcFZ6VDcKw/ByOMOL/OmM8QDOVnV5Va6E+76EUC",
    CID_MAP.getValue("naga-test").getValue("lyricsTranslate") to "qhama/oTfv8O8UjKIw2dIyNeEf5Kny47nrtwRUjC/C3VfFxBgSpNmcIqQA+Oys1X0unAqVZKBu1uELJB795xUmbjaRZ/8Uo4H9YM8kW9V4hKcso+oOaELyFt4fZCFlO4Zt2vsouIzJd3g2S1P9A7LaVvpb8u1geBWvSdqk5UmhTpxVduNoQgQv7JAnzqaqMgVLgCxsoISnR4UGwC",
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

  /**
   * Sign an EIP-191 message via PKP using a Lit Action.
   */
  private suspend fun signMessageWithPKP(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    pkpPublicKey: String,
    message: String,
  ): String {
    val code = """
      (async () => {
        const toSign = ethers.utils.arrayify(
          ethers.utils.hashMessage(jsParams.message)
        );
        const sigShare = await Lit.Actions.signAndCombineEcdsa({
          toSign: toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
        const sig = JSON.parse(sigShare);
        Lit.Actions.setResponse({ response: JSON.stringify(sig) });
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
    val response = result.optString("response", "")
    if (response.isBlank()) throw IllegalStateException("No signature response from PKP")

    val sig = JSONObject(response)
    val r = sig.getString("r")
    val s = sig.getString("s")
    val recid = sig.optInt("recid", sig.optInt("recoveryId", 0))
    val v = recid + 27
    return "0x${r.removePrefix("0x")}${s.removePrefix("0x")}${"%02x".format(v)}"
  }

  /**
   * Sign EIP-712 typed data via PKP using a Lit Action.
   */
  private suspend fun signTypedDataWithPKP(
    context: Context,
    litNetwork: String,
    litRpcUrl: String,
    pkpPublicKey: String,
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
        const sigShare = await Lit.Actions.signAndCombineEcdsa({
          toSign: toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
        const sig = JSON.parse(sigShare);
        Lit.Actions.setResponse({ response: JSON.stringify(sig) });
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
    val response = result.optString("response", "")
    if (response.isBlank()) throw IllegalStateException("No EIP-712 signature response from PKP")

    val sig = JSONObject(response)
    val r = sig.getString("r")
    val s = sig.getString("s")
    val recid = sig.optInt("recid", sig.optInt("recoveryId", 0))
    val v = recid + 27
    return "0x${r.removePrefix("0x")}${s.removePrefix("0x")}${"%02x".format(v)}"
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
   * @param litNetwork Lit network (naga-dev or naga-test)
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
    val cids = CID_MAP[litNetwork] ?: throw IllegalStateException("Unknown Lit network: $litNetwork")
    val songPublishCid = cids["songPublish"]
      ?.takeIf { it.isNotBlank() } ?: throw IllegalStateException("SONG_PUBLISH_CID not set for $litNetwork")
    val storyRegisterCid = cids["storyRegisterSponsor"]
      ?.takeIf { it.isNotBlank() } ?: throw IllegalStateException("STORY_REGISTER_SPONSOR_CID not set for $litNetwork")
    val lyricsTranslateCid = cids["lyricsTranslate"] ?: ""
    val contentRegisterCid = cids["contentRegisterMegaethV1"] ?: ""

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

    // ── Step 2: Pre-upload to Filebase (5-15%) ──────────────────
    val uploadFiles = mutableListOf(
      Triple("audio", audioBytes, audioMime),
      Triple("vocals", vocalsBytes, vocalsMime),
      Triple("instrumental", instrumentalBytes, instrumentalMime),
      Triple("cover", coverBytes, coverMime),
    )
    if (canvasBytes != null && canvasMime != null) {
      uploadFiles.add(Triple("canvas", canvasBytes, canvasMime))
    }

    val cidMap = proxyUpload(uploadFiles)

    val audioUrl = "$IPFS_GATEWAY${cidMap["audio"]}"
    val vocalsUrl = "$IPFS_GATEWAY${cidMap["vocals"]}"
    val instrumentalUrl = "$IPFS_GATEWAY${cidMap["instrumental"]}"
    val coverUrl = "$IPFS_GATEWAY${cidMap["cover"]}"
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
      message = message,
    )

    onProgress(30)

    // ── Step 6: Call song-publish-v1 Lit Action (30-65%) ─────────
    android.util.Log.i(TAG, "Calling song-publish-v1 Lit Action (CID: $songPublishCid)")

    val publishJsParams = JSONObject().apply {
      put("userPkpPublicKey", pkpPublicKey)
      put("audioUrl", audioUrl)
      put("coverUrl", coverUrl)
      put("vocalsUrl", vocalsUrl)
      put("instrumentalUrl", instrumentalUrl)
      if (canvasUrl != null) put("canvasUrl", canvasUrl)
      put("songMetadataJson", songMetadata)
      put("ipaMetadataJson", ipaMetadata)
      put("nftMetadataJson", nftMetadata)
      put("signature", signature)
      put("timestamp", timestamp)
      put("nonce", nonce)
      put("lyricsText", lyricsText)
      put("sourceLanguage", sourceLanguageName)
      put("targetLanguage", targetLanguage)
      put("filebaseEncryptedKey", filebaseEncryptedKey(songPublishCid))
      put("elevenlabsEncryptedKey", elevenlabsEncryptedKey(songPublishCid))
      put("openrouterEncryptedKey", openrouterEncryptedKey(songPublishCid))
    }

    val publishResult = executeJsResultWithAuthRecovery(
      context = context,
      network = litNetwork,
      rpcUrl = litRpcUrl,
      ipfsId = songPublishCid,
      jsParamsJson = publishJsParams.toString(),
    )
    val publishResponseStr = publishResult.optString("response", "")
    if (publishResponseStr.isBlank()) throw IllegalStateException("No response from song-publish-v1")
    val publishResponse = JSONObject(publishResponseStr)
    if (!publishResponse.optBoolean("success", false)) {
      throw IllegalStateException("Song publish failed: ${publishResponse.optString("error", "unknown")}")
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

    // ── Step 9: Register on ContentRegistry MegaETH (88-95%) ────
    if (contentRegisterCid.isNotBlank()) {
      try {
        val trackId = computeTrackId(
          context = context,
          litNetwork = litNetwork,
          litRpcUrl = litRpcUrl,
          title = formData.title,
          artist = formData.artist,
          album = "",
        )
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

    onProgress(95)

    // ── Step 10: Auto-translate lyrics (95-100%, best-effort) ────
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

    return PublishResult(
      ipId = storyResponse.getString("ipId"),
      tokenId = storyResponse.getString("tokenId"),
      audioCid = publishResponse.getString("audioCID"),
      instrumentalCid = publishResponse.getString("instrumentalCID"),
      coverCid = publishResponse.getString("coverCID"),
      canvasCid = publishResponse.optString("canvasCID", "").ifBlank { null },
      licenseTermsIds = storyResponse.optJSONArray("licenseTermsIds")?.let { arr ->
        (0 until arr.length()).map { arr.getString(it) }
      } ?: emptyList(),
    )
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
