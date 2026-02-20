package com.pirate.app.chat

import android.util.Log
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.profile.TempoNameRecordsApi
import org.xmtp.android.library.Client
import org.xmtp.android.library.libxmtp.IdentityKind
import org.xmtp.android.library.libxmtp.PublicIdentity

private const val TAG = "XmtpIdentityResolver"

internal data class ResolvedPeerIdentity(
  val displayName: String,
  val avatarUri: String?,
)

internal class XmtpIdentityResolver {
  private val peerAddressByInboxId = mutableMapOf<String, String>()
  private val peerIdentityByInboxId = mutableMapOf<String, ResolvedPeerIdentity>()
  private val peerIdentityByAddress = mutableMapOf<String, ResolvedPeerIdentity>()

  fun clearCaches() {
    peerAddressByInboxId.clear()
    peerIdentityByInboxId.clear()
    peerIdentityByAddress.clear()
  }

  suspend fun resolveInboxId(
    client: Client,
    rawAddressOrInboxId: String,
  ): String {
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
      return client.inboxIdFromIdentity(PublicIdentity(IdentityKind.ETHEREUM, normalizedAddress))
        ?: throw IllegalStateException("No XMTP inboxId for address=$normalizedAddress")
    }

    val resolvedAddress = TempoNameRecordsApi.resolveAddressForName(trimmed)
    if (!resolvedAddress.isNullOrBlank()) {
      val normalizedResolved = normalizeEthAddress(resolvedAddress)
      return client.inboxIdFromIdentity(PublicIdentity(IdentityKind.ETHEREUM, normalizedResolved))
        ?: throw IllegalStateException("No XMTP inboxId for name=$trimmed")
    }

    return trimmed
  }

  suspend fun resolvePeerIdentityByInboxId(
    client: Client,
    inboxId: String,
  ): ResolvedPeerIdentity {
    peerIdentityByInboxId[inboxId]?.let { return it }
    val address = resolvePeerAddress(client, inboxId)
    val identity = resolvePeerIdentity(address)
    peerIdentityByInboxId[inboxId] = identity
    return identity
  }

  suspend fun resolvePeerAddress(
    client: Client,
    peerInboxId: String,
  ): String {
    peerAddressByInboxId[peerInboxId]?.let { return it }
    return runCatching {
      val state = client.inboxStatesForInboxIds(false, listOf(peerInboxId)).firstOrNull()
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

  suspend fun resolvePeerIdentity(addressOrInboxId: String): ResolvedPeerIdentity {
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
}
