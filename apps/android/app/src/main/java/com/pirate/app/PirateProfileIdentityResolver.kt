package com.pirate.app

import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.profile.ProfileContractApi
import com.pirate.app.profile.TempoNameRecordsApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

internal suspend fun resolveProfileIdentity(address: String): Pair<String?, String?> = withContext(Dispatchers.IO) {
  var contractAvatarLoaded = false
  var contractAvatar: String? = null

  suspend fun loadContractAvatar(): String? {
    if (contractAvatarLoaded) return contractAvatar
    contractAvatarLoaded = true
    contractAvatar = runCatching {
      ProfileContractApi.fetchProfile(address)?.photoUri?.trim()?.ifBlank { null }
    }.getOrNull()
    return contractAvatar
  }

  val tempoName = TempoNameRecordsApi.getPrimaryName(address)
  if (!tempoName.isNullOrBlank()) {
    val node = TempoNameRecordsApi.computeNode(tempoName)
    val avatar =
      TempoNameRecordsApi.getTextRecord(node, "avatar")
        ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
        ?: loadContractAvatar()
    return@withContext tempoName to avatar
  }

  val legacyName = OnboardingRpcHelpers.getPrimaryName(address)
  if (legacyName.isNullOrBlank()) return@withContext null to loadContractAvatar()
  val node = OnboardingRpcHelpers.computeNode(legacyName)
  val avatar =
    TempoNameRecordsApi.getTextRecord(node, "avatar")
      ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
      ?: loadContractAvatar()
  return@withContext "$legacyName.heaven" to avatar
}

internal suspend fun resolveProfileIdentityWithRetry(
  address: String,
  attempts: Int = 6,
  retryDelayMs: Long = 1_500,
): Pair<String?, String?> {
  val totalAttempts = attempts.coerceAtLeast(1)
  var last: Pair<String?, String?> = null to null
  repeat(totalAttempts) { attempt ->
    last = resolveProfileIdentity(address)
    val name = last.first
    val avatar = last.second
    if (!name.isNullOrBlank() || !avatar.isNullOrBlank() || attempt == totalAttempts - 1) {
      return last
    }
    delay(retryDelayMs)
  }
  return last
}
