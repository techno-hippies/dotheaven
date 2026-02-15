package com.pirate.app.chat

import android.content.Context
import android.util.Log
import com.pirate.app.lit.LitRust
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.xmtp.android.library.Client
import org.xmtp.android.library.ClientOptions
import org.xmtp.android.library.ConsentState
import org.xmtp.android.library.Dm
import org.xmtp.android.library.SignedData
import org.xmtp.android.library.SignerType
import org.xmtp.android.library.SigningKey
import org.xmtp.android.library.XMTPEnvironment
import org.xmtp.android.library.libxmtp.IdentityKind
import org.xmtp.android.library.libxmtp.PublicIdentity
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign
import uniffi.xmtpv3.Xmtpv3Kt
import java.math.BigInteger

class XmtpChatService(private val appContext: Context) {

  companion object {
    private const val TAG = "XmtpChatService"
    private const val PREFS_NAME = "xmtp_prefs"
    private const val KEY_DB_KEY = "db_encryption_key"
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private var client: Client? = null

  private val _connected = MutableStateFlow(false)
  val connected: StateFlow<Boolean> = _connected

  private val _conversations = MutableStateFlow<List<ConversationItem>>(emptyList())
  val conversations: StateFlow<List<ConversationItem>> = _conversations

  private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
  val messages: StateFlow<List<ChatMessage>> = _messages

  private val _activeConversationId = MutableStateFlow<String?>(null)
  val activeConversationId: StateFlow<String?> = _activeConversationId

  private var activeDm: Dm? = null

  /**
   * Connect to XMTP using the PKP wallet as signer.
   */
  suspend fun connect(
    pkpEthAddress: String,
    pkpPublicKey: String,
    litNetwork: String,
    litRpcUrl: String,
  ) {
    if (client != null) return

    try {
      val signer = PkpSigningKey(
        ethAddress = normalizeEthAddress(pkpEthAddress),
        pkpPublicKey = pkpPublicKey,
        litNetwork = litNetwork,
        litRpcUrl = litRpcUrl,
      )

      val dbKey = getOrCreateDbKey()

      val options = ClientOptions(
        api = ClientOptions.Api(
          env = XMTPEnvironment.PRODUCTION,
          isSecure = true,
        ),
        appContext = appContext,
        dbEncryptionKey = dbKey,
      )

      client = Client.create(account = signer, options = options)
      _connected.value = true
      Log.i(TAG, "XMTP connected for $pkpEthAddress")

      refreshConversations()
      startMessageStream()
    } catch (e: Exception) {
      Log.e(TAG, "XMTP connect failed", e)
      throw e
    }
  }

  fun disconnect() {
    client = null
    _connected.value = false
    _conversations.value = emptyList()
    _messages.value = emptyList()
    _activeConversationId.value = null
    activeDm = null
  }

  suspend fun refreshConversations() {
    val c = client ?: return
    try {
      c.conversations.syncAllConversations()
      val dms = c.conversations.listDms()
      val items = dms.mapNotNull { dm ->
        try {
          val last = dm.lastMessage()
          val peer = dm.peerInboxId
          ConversationItem(
            id = dm.id,
            peerAddress = peer,
            peerInboxId = peer,
            lastMessage = last?.body ?: "",
            lastMessageTimestampMs = last?.sentAtNs?.div(1_000_000) ?: 0L,
          )
        } catch (e: Exception) {
          Log.w(TAG, "Failed to read conversation", e)
          null
        }
      }.sortedByDescending { it.lastMessageTimestampMs }
      _conversations.value = items
    } catch (e: Exception) {
      Log.e(TAG, "refreshConversations failed", e)
    }
  }

  suspend fun openConversation(conversationId: String) {
    val c = client ?: return
    _activeConversationId.value = conversationId
    try {
      val dms = c.conversations.listDms()
      val dm = dms.find { it.id == conversationId } ?: return
      activeDm = dm
      dm.sync()
      loadMessages(dm)
    } catch (e: Exception) {
      Log.e(TAG, "openConversation failed", e)
    }
  }

  fun closeConversation() {
    _activeConversationId.value = null
    activeDm = null
    _messages.value = emptyList()
  }

  suspend fun sendMessage(text: String) {
    val dm = activeDm ?: return
    try {
      dm.send(text)
      dm.sync()
      loadMessages(dm)
      refreshConversations()
    } catch (e: Exception) {
      Log.e(TAG, "sendMessage failed", e)
      throw e
    }
  }

  suspend fun newDm(peerAddress: String): String? {
    val c = client ?: return null
    return try {
      val dm = c.conversations.findOrCreateDm(peerAddress)
      refreshConversations()
      dm.id
    } catch (e: Exception) {
      Log.e(TAG, "newDm failed", e)
      throw e
    }
  }

  private suspend fun loadMessages(dm: Dm) {
    try {
      val myInboxId = client?.inboxId ?: ""
      val msgs = dm.messages(limit = 100)
      _messages.value = msgs.map { msg ->
        ChatMessage(
          id = msg.id,
          senderAddress = msg.senderInboxId,
          senderInboxId = msg.senderInboxId,
          text = msg.body,
          timestampMs = msg.sentAtNs / 1_000_000,
          isFromMe = msg.senderInboxId == myInboxId,
        )
      }.sortedBy { it.timestampMs }
    } catch (e: Exception) {
      Log.e(TAG, "loadMessages failed", e)
    }
  }

  private fun startMessageStream() {
    scope.launch {
      try {
        client?.conversations?.streamAllMessages(
          consentStates = listOf(ConsentState.ALLOWED),
        )?.collect { _ ->
          refreshConversations()
          val dm = activeDm
          if (dm != null) {
            dm.sync()
            loadMessages(dm)
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Message stream failed", e)
      }
    }
  }

  private fun getOrCreateDbKey(): ByteArray {
    val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val existing = prefs.getString(KEY_DB_KEY, null)
    if (existing != null) {
      return hexToBytes(existing)
    }
    val key = ByteArray(32)
    java.security.SecureRandom().nextBytes(key)
    prefs.edit().putString(KEY_DB_KEY, bytesToHex(key)).apply()
    return key
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = hex.lowercase()
    val out = ByteArray(clean.length / 2)
    for (i in out.indices) {
      val hi = clean[2 * i].digitToInt(16)
      val lo = clean[2 * i + 1].digitToInt(16)
      out[i] = ((hi shl 4) or lo).toByte()
    }
    return out
  }

  private fun bytesToHex(bytes: ByteArray): String {
    val sb = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      sb.append(((b.toInt() ushr 4) and 0x0f).toString(16))
      sb.append((b.toInt() and 0x0f).toString(16))
    }
    return sb.toString()
  }

  private fun normalizeEthAddress(value: String): String {
    val trimmed = value.trim()
    val withPrefix =
      if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) trimmed else "0x$trimmed"
    val lower = withPrefix.lowercase()
    require(lower.length == 42) { "Invalid Ethereum address length: $value" }
    require(lower.startsWith("0x")) { "Invalid Ethereum address: $value" }
    for (i in 2 until lower.length) {
      val c = lower[i]
      if (!(c in '0'..'9' || c in 'a'..'f')) {
        throw IllegalArgumentException("Invalid Ethereum address: $value")
      }
    }
    return lower
  }
}

/**
 * XMTP SigningKey backed by Lit PKP signing.
 * Signs arbitrary messages by executing a Lit Action that calls Lit.Actions.signEcdsa.
 */
private class PkpSigningKey(
  private val ethAddress: String,
  private val pkpPublicKey: String,
  private val litNetwork: String,
  private val litRpcUrl: String,
) : SigningKey {

  private companion object {
    // secp256k1 curve order (n)
    private val SECP256K1_N =
      BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16)
    private val SECP256K1_HALF_N = SECP256K1_N.shiftRight(1)
  }

  override val publicIdentity: PublicIdentity
    get() = PublicIdentity(IdentityKind.ETHEREUM, ethAddress.lowercase())

  override val type: SignerType
    get() = SignerType.EOA

  override suspend fun sign(message: String): SignedData {
    // Match XMTP's built-in `PrivateKeyBuilder.sign()` behavior:
    // hash = keccak256("\x19Ethereum Signed Message:\n" + message.length + message)
    // signature bytes are r(32) + s(32) + v(recoveryId as 0/1).
    // Use libxmtp's own implementation to avoid subtle differences in length/encoding.
    val hash = Xmtpv3Kt.ethereumHashPersonal(message)

    val litActionCode = """
      (async () => {
        const toSign = new Uint8Array(jsParams.toSign);
        await Lit.Actions.signEcdsa({
          toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
      })();
    """.trimIndent()

    val toSignArray = JSONArray()
    for (b in hash) { toSignArray.put(b.toInt() and 0xff) }
    val jsParams = JSONObject()
      .put("toSign", toSignArray)
      .put("publicKey", pkpPublicKey)

    val raw = LitRust.executeJsRaw(
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

    val strip0x = { v: String -> if (v.startsWith("0x")) v.drop(2) else v }
    var r = hexStringToBytes(strip0x(sig.optString("r", "")).padStart(64, '0'))
    var s = hexStringToBytes(strip0x(sig.optString("s", "")).padStart(64, '0'))

    val recidAny = sig.opt("recid") ?: sig.opt("recoveryId") ?: 0
    val recid =
      when (recidAny) {
        is Number -> recidAny.toInt()
        is String -> {
          val clean = recidAny.trim()
          clean.removePrefix("0x").removePrefix("0X").toIntOrNull(16)
            ?: clean.toIntOrNull()
            ?: 0
        }
        else -> 0
      }

    // Enforce Ethereum "low-s" signatures (EIP-2 style).
    val sInt = BigInteger(1, s)
    if (sInt > SECP256K1_HALF_N) {
      val canonicalS = SECP256K1_N.subtract(sInt)
      s = bigIntegerToFixed32Bytes(canonicalS)
    }

    // Determine the correct recovery id (v=0/1) by recovering the address locally.
    val expectedNo0x = ethAddress.removePrefix("0x").lowercase()
    val hintedV = (if (recid >= 27) recid - 27 else recid).takeIf { it in 0..3 }
    val candidates = buildList {
      if (hintedV != null) add(hintedV)
      addAll(listOf(0, 1, 2, 3).filterNot { it == hintedV })
    }

    val recoveredV =
      candidates.firstNotNullOfOrNull { candidate ->
        runCatching {
          val sigData = Sign.SignatureData((candidate + 27).toByte(), r, s)
          val pubKey = Sign.signedMessageHashToKey(hash, sigData)
          val addrNo0x = Keys.getAddress(pubKey).lowercase()
          if (addrNo0x == expectedNo0x) candidate else null
        }.getOrNull()
      }
        ?: throw IllegalStateException("Could not recover signer for expected address=$ethAddress")

    // Concatenate r + s + v as a 65-byte signature
    val sigBytes = ByteArray(65)
    System.arraycopy(r, 0, sigBytes, 0, 32)
    System.arraycopy(s, 0, sigBytes, 32, 32)
    sigBytes[64] = recoveredV.toByte()

    // SignedData(rawData, publicKey, authenticatorData, clientDataJson)
    // For EOA signers, rawData is the signature; others can be empty
    return SignedData(sigBytes, ByteArray(0), ByteArray(0), ByteArray(0))
  }

  private fun hexStringToBytes(hex: String): ByteArray {
    val clean = hex.lowercase()
    val out = ByteArray(clean.length / 2)
    for (i in out.indices) {
      val hi = clean[2 * i].digitToInt(16)
      val lo = clean[2 * i + 1].digitToInt(16)
      out[i] = ((hi shl 4) or lo).toByte()
    }
    return out
  }

  private fun bigIntegerToFixed32Bytes(value: BigInteger): ByteArray {
    val raw = value.toByteArray()
    val normalized =
      if (raw.size == 33 && raw[0] == 0.toByte()) raw.copyOfRange(1, 33) else raw
    require(normalized.size <= 32) { "Value does not fit in 32 bytes" }
    val out = ByteArray(32)
    System.arraycopy(normalized, 0, out, 32 - normalized.size, normalized.size)
    return out
  }
}
