package com.pirate.app.chat

import android.content.Context
import android.util.Log
import com.pirate.app.BuildConfig
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.security.LocalSecp256k1Store
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.xmtp.android.library.Client
import org.xmtp.android.library.ClientOptions
import org.xmtp.android.library.Conversation
import org.xmtp.android.library.ConsentState
import org.xmtp.android.library.Dm
import org.xmtp.android.library.Group
import org.xmtp.android.library.SignedData
import org.xmtp.android.library.SignerType
import org.xmtp.android.library.SigningKey
import org.xmtp.android.library.XMTPEnvironment
import org.xmtp.android.library.libxmtp.DecodedMessage
import org.xmtp.android.library.libxmtp.DisappearingMessageSettings
import org.xmtp.android.library.libxmtp.GroupPermissionPreconfiguration
import org.xmtp.android.library.libxmtp.IdentityKind
import org.xmtp.android.library.libxmtp.PermissionOption
import org.xmtp.android.library.libxmtp.PermissionPolicySet
import org.xmtp.android.library.libxmtp.PublicIdentity
import org.web3j.crypto.ECKeyPair
import org.web3j.crypto.Sign
import uniffi.xmtpv3.ethereumHashPersonal
import java.io.File

class XmtpChatService(private val appContext: Context) {

  companion object {
    private const val TAG = "XmtpChatService"
    private const val PREFS_NAME = "xmtp_prefs"
    private const val KEY_DB_KEY = "db_encryption_key"
  }

  private data class ResolvedPeerIdentity(
    val displayName: String,
    val avatarUri: String?,
  )

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

  private var activeConversation: Conversation? = null
  private val peerAddressByInboxId = mutableMapOf<String, String>()
  private val peerIdentityByInboxId = mutableMapOf<String, ResolvedPeerIdentity>()
  private val peerIdentityByAddress = mutableMapOf<String, ResolvedPeerIdentity>()

  /**
   * Connect to XMTP using a local secp256k1 identity key tied to the user's address.
   * The identity key is generated once and persisted per-address.
   */
  suspend fun connect(address: String) {
    if (client != null) return

    try {
      withContext(Dispatchers.IO) {
      val normalizedAddress = normalizeEthAddress(address)
      val signer = getOrCreateLocalSigner(normalizedAddress)

      // If the signing identity changed (e.g. migrated from PKP to local key),
      // the old XMTP DB may be incompatible. Regenerate the DB key per-identity.
      val dbKey = getOrCreateDbKey(signer.publicIdentity.identifier)

      val options = ClientOptions(
        api = ClientOptions.Api(
          env = if (BuildConfig.DEBUG) XMTPEnvironment.DEV else XMTPEnvironment.PRODUCTION,
          isSecure = true,
        ),
        appContext = appContext,
        dbEncryptionKey = dbKey,
      )

      client = createClientWithDbRecovery(signer, options)
      _connected.value = true
      Log.i(TAG, "XMTP connected for $normalizedAddress")

      refreshConversations()
      startMessageStream()
      } // withContext
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
    activeConversation = null
    peerAddressByInboxId.clear()
    peerIdentityByInboxId.clear()
    peerIdentityByAddress.clear()
  }

  suspend fun refreshConversations() {
    val c = client ?: return
    try {
      c.conversations.syncAllConversations()
      val dms = c.conversations.listDms()
      val groups = c.conversations.listGroups()
      val dmItems = dms.mapNotNull { dm -> toDmConversationItem(c, dm) }
      val groupItems = groups.mapNotNull { group -> toGroupConversationItem(group) }
      _conversations.value = (dmItems + groupItems).sortedByDescending { it.lastMessageTimestampMs }
    } catch (e: Exception) {
      Log.e(TAG, "refreshConversations failed", e)
    }
  }

  suspend fun openConversation(conversationId: String) {
    val c = client ?: return
    _activeConversationId.value = conversationId
    try {
      val conversation = c.conversations.findConversation(conversationId) ?: return
      activeConversation = conversation
      conversation.sync()
      loadMessages(conversation)
    } catch (e: Exception) {
      Log.e(TAG, "openConversation failed", e)
    }
  }

  fun closeConversation() {
    _activeConversationId.value = null
    activeConversation = null
    _messages.value = emptyList()
  }

  suspend fun activeDisappearingSeconds(): Long? {
    val conversation = activeConversation ?: return null
    val settings = runCatching { conversation.disappearingMessageSettings() }.getOrNull() ?: return null
    val seconds = settings.retentionDurationInNs / 1_000_000_000L
    return seconds.takeIf { it > 0L }
  }

  suspend fun setActiveDisappearingSeconds(retentionSeconds: Long?) {
    val conversation = activeConversation ?: return
    try {
      if (retentionSeconds == null || retentionSeconds <= 0L) {
        conversation.clearDisappearingMessageSettings()
      } else {
        val nowNs = System.currentTimeMillis() * 1_000_000L
        val retentionNs = retentionSeconds * 1_000_000_000L
        conversation.updateDisappearingMessageSettings(DisappearingMessageSettings(nowNs, retentionNs))
      }
      conversation.sync()
      loadMessages(conversation)
      refreshConversations()
    } catch (e: Exception) {
      Log.e(TAG, "updateDisappearingMessageSettings failed", e)
      throw e
    }
  }

  suspend fun sendMessage(text: String) {
    val conversation = activeConversation ?: return
    try {
      conversation.send(text)
      conversation.sync()
      loadMessages(conversation)
      refreshConversations()
    } catch (e: Exception) {
      Log.e(TAG, "sendMessage failed", e)
      throw e
    }
  }

  suspend fun newDm(peerAddressOrInboxId: String): String {
    val c = client ?: throw IllegalStateException("XMTP is not connected")
    return try {
      val inboxId = resolveInboxId(c, peerAddressOrInboxId)
      val dm = c.conversations.findOrCreateDm(inboxId)
      refreshConversations()
      dm.id
    } catch (e: Exception) {
      Log.e(TAG, "newDm failed", e)
      throw e
    }
  }

  suspend fun newGroup(
    memberAddressesOrInboxIds: List<String>,
    name: String?,
    description: String?,
    imageUrl: String?,
    appData: String?,
    permissionMode: GroupPermissionMode,
    customPermissions: PermissionPolicySet? = null,
  ): String {
    val c = client ?: throw IllegalStateException("XMTP is not connected")
    return try {
      val memberInboxIds = mutableListOf<String>()
      for (raw in memberAddressesOrInboxIds) {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) continue
        val inboxId = resolveInboxId(c, trimmed)
        if (inboxId == c.inboxId) continue
        if (!memberInboxIds.contains(inboxId)) {
          memberInboxIds.add(inboxId)
        }
      }
      require(memberInboxIds.isNotEmpty()) { "Add at least one valid member" }

      val normalizedName = name?.trim().orEmpty()
      val normalizedDescription = description?.trim().orEmpty()
      val normalizedImageUrl = imageUrl?.trim().orEmpty()
      val normalizedAppData = appData?.trim().orEmpty()

      val group =
        when (permissionMode) {
          GroupPermissionMode.ALL_MEMBERS ->
            c.conversations.newGroup(
              inboxIds = memberInboxIds,
              permissions = GroupPermissionPreconfiguration.ALL_MEMBERS,
              groupName = normalizedName,
              groupImageUrlSquare = normalizedImageUrl,
              groupDescription = normalizedDescription,
              appData = normalizedAppData,
            )
          GroupPermissionMode.ADMIN_ONLY ->
            c.conversations.newGroup(
              inboxIds = memberInboxIds,
              permissions = GroupPermissionPreconfiguration.ADMIN_ONLY,
              groupName = normalizedName,
              groupImageUrlSquare = normalizedImageUrl,
              groupDescription = normalizedDescription,
              appData = normalizedAppData,
            )
          GroupPermissionMode.CUSTOM ->
            c.conversations.newGroupCustomPermissions(
              inboxIds = memberInboxIds,
              permissionPolicySet =
                customPermissions
                  ?: throw IllegalArgumentException("Custom permissions are required"),
              groupName = normalizedName,
              groupImageUrlSquare = normalizedImageUrl,
              groupDescription = normalizedDescription,
              appData = normalizedAppData,
            )
        }

      refreshConversations()
      group.id
    } catch (e: Exception) {
      Log.e(TAG, "newGroup failed", e)
      throw e
    }
  }

  suspend fun getActiveGroupMetadata(): GroupMetadata? {
    val group = activeGroup() ?: return null
    val name = runCatching { group.name() }.getOrDefault("")
    val description = runCatching { group.description() }.getOrDefault("")
    val imageUrl = runCatching { group.imageUrl() }.getOrDefault("")
    val appData = runCatching { group.appData() }.getOrDefault("")
    return GroupMetadata(
      name = name,
      description = description,
      imageUrl = imageUrl,
      appData = appData,
    )
  }

  suspend fun updateActiveGroupMetadata(
    name: String?,
    description: String?,
    imageUrl: String?,
    appData: String?,
  ) {
    val group = activeGroup() ?: throw IllegalStateException("Active conversation is not a group")
    try {
      val currentName = runCatching { group.name() }.getOrDefault("")
      val currentDescription = runCatching { group.description() }.getOrDefault("")
      val currentImageUrl = runCatching { group.imageUrl() }.getOrDefault("")
      val currentAppData = runCatching { group.appData() }.getOrDefault("")
      if (name != null && name != currentName) group.updateName(name)
      if (description != null && description != currentDescription) group.updateDescription(description)
      if (imageUrl != null && imageUrl != currentImageUrl) group.updateImageUrl(imageUrl)
      if (appData != null && appData != currentAppData) group.updateAppData(appData)
      group.sync()
      refreshConversations()
      val conversation = activeConversation
      if (conversation != null) {
        conversation.sync()
        loadMessages(conversation)
      }
    } catch (e: Exception) {
      Log.e(TAG, "updateActiveGroupMetadata failed", e)
      throw e
    }
  }

  suspend fun getActiveGroupPermissionPolicySet(): PermissionPolicySet? {
    val group = activeGroup() ?: return null
    return runCatching { group.permissionPolicySet() }.getOrNull()
  }

  suspend fun updateActiveGroupPermissions(
    addMemberPolicy: PermissionOption? = null,
    removeMemberPolicy: PermissionOption? = null,
    updateNamePolicy: PermissionOption? = null,
    updateDescriptionPolicy: PermissionOption? = null,
    updateImagePolicy: PermissionOption? = null,
  ) {
    val group = activeGroup() ?: throw IllegalStateException("Active conversation is not a group")
    try {
      if (addMemberPolicy != null) group.updateAddMemberPermission(addMemberPolicy)
      if (removeMemberPolicy != null) group.updateRemoveMemberPermission(removeMemberPolicy)
      if (updateNamePolicy != null) group.updateNamePermission(updateNamePolicy)
      if (updateDescriptionPolicy != null) group.updateDescriptionPermission(updateDescriptionPolicy)
      if (updateImagePolicy != null) group.updateImageUrlPermission(updateImagePolicy)
      group.sync()
      refreshConversations()
    } catch (e: Exception) {
      Log.e(TAG, "updateActiveGroupPermissions failed", e)
      throw e
    }
  }

  private suspend fun loadMessages(conversation: Conversation) {
    try {
      val c = client ?: return
      val myInboxId = c.inboxId
      val msgs = conversation.messages(limit = 100)
      _messages.value = msgs.map { msg ->
        val senderInboxId = msg.senderInboxId
        val isFromMe = senderInboxId == myInboxId
        val senderAddress = if (isFromMe) senderInboxId else resolvePeerAddress(c, senderInboxId)
        val senderIdentity = if (isFromMe) null else resolvePeerIdentityByInboxId(c, senderInboxId)
        ChatMessage(
          id = msg.id,
          senderAddress = senderAddress,
          senderInboxId = senderInboxId,
          senderDisplayName = senderIdentity?.displayName,
          senderAvatarUri = senderIdentity?.avatarUri,
          text = sanitizeBody(msg),
          timestampMs = msg.sentAtNs / 1_000_000,
          isFromMe = isFromMe,
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
          val conversation = activeConversation
          if (conversation != null) {
            conversation.sync()
            loadMessages(conversation)
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Message stream failed", e)
      }
    }
  }

  private suspend fun toDmConversationItem(c: Client, dm: Dm): ConversationItem? {
    return try {
      val last = dm.lastMessage()
      val peerInboxId = dm.peerInboxId
      val peerAddress = resolvePeerAddress(c, peerInboxId)
      val peerIdentity = resolvePeerIdentity(peerAddress)
      val displayName = peerIdentity.displayName.ifBlank { peerAddress }
      val hasResolvedName = !displayName.equals(peerAddress, ignoreCase = true)
      ConversationItem(
        id = dm.id,
        type = ConversationType.DM,
        displayName = displayName,
        avatarUri = peerIdentity.avatarUri,
        lastMessage = last?.let { sanitizeBody(it) } ?: "",
        lastMessageTimestampMs = last?.sentAtNs?.div(1_000_000) ?: 0L,
        subtitle = if (hasResolvedName) peerAddress else peerInboxId,
        peerAddress = peerAddress,
        peerInboxId = peerInboxId,
      )
    } catch (e: Exception) {
      Log.w(TAG, "Failed to read DM conversation", e)
      null
    }
  }

  private suspend fun toGroupConversationItem(group: Group): ConversationItem? {
    return try {
      val last = group.lastMessage()
      val name = group.name().trim().ifBlank { "Untitled group" }
      val description = group.description().trim()
      val imageUrl = group.imageUrl().trim()
      val appData = group.appData().trim()
      val memberCount = runCatching { group.members().size }.getOrNull()
      val subtitle =
        when {
          description.isNotBlank() -> description
          memberCount != null -> "$memberCount member${if (memberCount == 1) "" else "s"}"
          else -> "Group chat"
        }
      ConversationItem(
        id = group.id,
        type = ConversationType.GROUP,
        displayName = name,
        avatarUri = imageUrl.ifBlank { null },
        lastMessage = last?.let { sanitizeBody(it) } ?: "",
        lastMessageTimestampMs = last?.sentAtNs?.div(1_000_000) ?: 0L,
        subtitle = subtitle,
        groupDescription = description.ifBlank { null },
        groupImageUrl = imageUrl.ifBlank { null },
        groupAppData = appData.ifBlank { null },
      )
    } catch (e: Exception) {
      Log.w(TAG, "Failed to read group conversation", e)
      null
    }
  }

  private suspend fun activeGroup(): Group? {
    val c = client ?: return null
    val activeId = _activeConversationId.value ?: return null
    return runCatching { c.conversations.findGroup(activeId) }.getOrNull()
  }

  private suspend fun resolveInboxId(c: Client, rawAddressOrInboxId: String): String {
    val trimmed = rawAddressOrInboxId.trim()
    require(trimmed.isNotBlank()) { "Missing address or inbox ID" }

    val normalizedAddress =
      when {
        trimmed.startsWith("0x", ignoreCase = true) -> normalizeEthAddress(trimmed)
        trimmed.length == 40 && trimmed.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' } ->
          normalizeEthAddress("0x$trimmed")
        else -> null
      }

    if (normalizedAddress != null) {
      return c.inboxIdFromIdentity(PublicIdentity(IdentityKind.ETHEREUM, normalizedAddress))
        ?: throw IllegalStateException("No XMTP inboxId for address=$normalizedAddress")
    }

    val resolvedAddress = TempoNameRecordsApi.resolveAddressForName(trimmed)
    if (!resolvedAddress.isNullOrBlank()) {
      val normalizedResolved = normalizeEthAddress(resolvedAddress)
      return c.inboxIdFromIdentity(PublicIdentity(IdentityKind.ETHEREUM, normalizedResolved))
        ?: throw IllegalStateException("No XMTP inboxId for name=$trimmed")
    }

    return trimmed
  }

  private suspend fun resolvePeerIdentityByInboxId(c: Client, inboxId: String): ResolvedPeerIdentity {
    peerIdentityByInboxId[inboxId]?.let { return it }
    val address = resolvePeerAddress(c, inboxId)
    val identity = resolvePeerIdentity(address)
    peerIdentityByInboxId[inboxId] = identity
    return identity
  }

  private suspend fun resolvePeerAddress(c: Client, peerInboxId: String): String {
    peerAddressByInboxId[peerInboxId]?.let { return it }
    return runCatching {
      val state = c.inboxStatesForInboxIds(false, listOf(peerInboxId)).firstOrNull()
      val identity =
        state
          ?.identities
          ?.firstOrNull { it.kind == IdentityKind.ETHEREUM }
          ?.identifier
      val normalized = identity?.let(::normalizeEthAddressOrNull)
      if (normalized != null) {
        peerAddressByInboxId[peerInboxId] = normalized
        normalized
      } else {
        peerInboxId
      }
    }.getOrElse {
      Log.w(TAG, "Failed to resolve peer inbox identity: inboxId=$peerInboxId", it)
      peerInboxId
    }
  }

  private suspend fun resolvePeerIdentity(addressOrInboxId: String): ResolvedPeerIdentity {
    val normalized = normalizeEthAddressOrNull(addressOrInboxId)
      ?: return ResolvedPeerIdentity(displayName = addressOrInboxId, avatarUri = null)

    peerIdentityByAddress[normalized]?.let { return it }

    val tempoName =
      TempoNameRecordsApi.getPrimaryName(normalized)
        ?.trim()
        ?.takeIf { it.isNotBlank() }
    if (!tempoName.isNullOrBlank()) {
      val node = TempoNameRecordsApi.computeNode(tempoName)
      val avatarUri =
        TempoNameRecordsApi.getTextRecord(node, "avatar")
          ?.trim()
          ?.takeIf { it.isNotBlank() }
          ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
      val resolved = ResolvedPeerIdentity(displayName = tempoName, avatarUri = avatarUri)
      peerIdentityByAddress[normalized] = resolved
      return resolved
    }

    val legacyName =
      OnboardingRpcHelpers.getPrimaryName(normalized)
        ?.trim()
        ?.takeIf { it.isNotBlank() }
    if (!legacyName.isNullOrBlank()) {
      val fullName = if (legacyName.contains('.')) legacyName else "$legacyName.heaven"
      val node = TempoNameRecordsApi.computeNode(fullName)
      val avatarUri =
        TempoNameRecordsApi.getTextRecord(node, "avatar")
          ?.trim()
          ?.takeIf { it.isNotBlank() }
          ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
      val resolved = ResolvedPeerIdentity(displayName = fullName, avatarUri = avatarUri)
      peerIdentityByAddress[normalized] = resolved
      return resolved
    }

    val fallback = ResolvedPeerIdentity(displayName = normalized, avatarUri = null)
    peerIdentityByAddress[normalized] = fallback
    return fallback
  }

  private fun sanitizeBody(message: DecodedMessage): String {
    val body = runCatching { message.body }.getOrDefault("")
    val trimmed = body.trim()
    if (trimmed.isBlank()) return ""
    if (trimmed.startsWith("@")) {
      val tail = trimmed.drop(1)
      val looksLikeBlob = looksLikeEncodedBlobToken(tail)
      if (looksLikeBlob) return "[Unsupported XMTP message]"
    }
    return trimmed
  }

  private fun looksLikeEncodedBlobToken(value: String): Boolean {
    if (value.length < 32) return false
    if (value.any { it.isWhitespace() }) return false

    val allowedCount =
      value.count {
        it.isLetterOrDigit() ||
          it == '-' ||
          it == '_' ||
          it == '=' ||
          it == '+' ||
          it == '/' ||
          it == '.'
      }
    if (allowedCount != value.length) return false

    val alphaNumericRatio = value.count { it.isLetterOrDigit() }.toDouble() / value.length.toDouble()
    return alphaNumericRatio >= 0.7
  }

  private fun getOrCreateDbKey(identity: String): ByteArray {
    val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val storageKey = "${KEY_DB_KEY}:${identity.lowercase()}"
    val legacy = prefs.getString(KEY_DB_KEY, null)
    if (legacy != null) {
      // Migration: older builds used one global DB key.
      // Keep using it so existing encrypted DB files remain readable.
      val scoped = prefs.getString(storageKey, null)
      if (scoped == null || scoped != legacy) {
        prefs.edit().putString(storageKey, legacy).apply()
      }
      return hexToBytes(legacy)
    }

    val scoped = prefs.getString(storageKey, null)
    if (scoped != null) {
      return hexToBytes(scoped)
    }
    val key = ByteArray(32)
    java.security.SecureRandom().nextBytes(key)
    prefs.edit().putString(storageKey, bytesToHex(key)).apply()
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

  private suspend fun createClientWithDbRecovery(
    signer: LocalSigningKey,
    options: ClientOptions,
  ): Client {
    return try {
      Client.create(account = signer, options = options)
    } catch (e: Exception) {
      if (!isDbKeyOrSaltMismatch(e)) throw e
      Log.w(TAG, "XMTP DB key/salt mismatch detected; resetting local XMTP DB and retrying once", e)
      resetLocalXmtpDbFiles()
      Client.create(account = signer, options = options)
    }
  }

  private fun isDbKeyOrSaltMismatch(error: Throwable): Boolean {
    var cursor: Throwable? = error
    while (cursor != null) {
      val message = cursor.message.orEmpty().lowercase()
      if (
        message.contains("pragma key or salt has incorrect value") ||
        message.contains("error decrypting page") ||
        message.contains("hmac check failed")
      ) {
        return true
      }
      cursor = cursor.cause
    }
    return false
  }

  private fun resetLocalXmtpDbFiles() {
    val dbDir = File(appContext.filesDir, "xmtp_db")
    if (!dbDir.exists()) return
    dbDir.listFiles()?.forEach { f ->
      runCatching { f.delete() }.onFailure {
        runCatching { f.deleteRecursively() }
      }
    }
  }

  /**
   * Get or create a persistent local secp256k1 signing key for XMTP, keyed per address.
   * Key material is stored encrypted via Android Keystore.
   */
  private fun getOrCreateLocalSigner(address: String): LocalSigningKey {
    val identity = LocalSecp256k1Store.getOrCreateIdentity(appContext, address)
    Log.d(TAG, "XMTP local signer: userAddress=$address xmtpAddress=${identity.signerAddress}")
    return LocalSigningKey(identity.keyPair, identity.signerAddress)
  }

  private fun normalizeEthAddressOrNull(value: String): String? =
    runCatching { normalizeEthAddress(value) }.getOrNull()

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
 * XMTP SigningKey backed by a local secp256k1 key pair.
 * Signs messages locally without any network calls.
 */
private class LocalSigningKey(
  private val keyPair: ECKeyPair,
  private val ethAddress: String,
) : SigningKey {

  override val publicIdentity: PublicIdentity
    get() = PublicIdentity(IdentityKind.ETHEREUM, ethAddress.lowercase())

  override val type: SignerType
    get() = SignerType.EOA

  override suspend fun sign(message: String): SignedData {
    val hash = ethereumHashPersonal(message)
    val sigData = Sign.signMessage(hash, keyPair, false)

    // Sign.signMessage returns SignatureData with r(32), s(32), v(1 byte, 27 or 28)
    val sigBytes = ByteArray(65)
    System.arraycopy(sigData.r, 0, sigBytes, 0, 32)
    System.arraycopy(sigData.s, 0, sigBytes, 32, 32)
    sigBytes[64] = ((sigData.v[0].toInt() - 27) and 1).toByte()

    return SignedData(sigBytes, ByteArray(0), ByteArray(0), ByteArray(0))
  }
}
