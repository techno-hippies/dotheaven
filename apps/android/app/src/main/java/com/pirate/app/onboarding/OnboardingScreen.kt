package com.pirate.app.onboarding

import android.content.Context
import android.util.Log
import android.util.Base64
import com.pirate.app.tempo.TempoClient
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pirate.app.onboarding.steps.AgeStep
import com.pirate.app.onboarding.steps.AvatarStep
import com.pirate.app.onboarding.steps.DoneStep
import com.pirate.app.onboarding.steps.GenderStep
import com.pirate.app.onboarding.steps.LanguagesStep
import com.pirate.app.onboarding.steps.LocationStep
import com.pirate.app.onboarding.steps.MusicStep
import com.pirate.app.onboarding.steps.NameStep
import com.pirate.app.profile.ProfileAvatarUploadApi
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.profile.TempoNameRegistryApi
import com.pirate.app.profile.TempoProfileContractApi
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.TempoAccountFactory
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoSessionKeyApi
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.math.roundToInt

private const val TAG = "OnboardingScreen"

private enum class SessionSetupStatus {
  CHECKING,
  AUTHORIZING,
  READY,
  FAILED,
}

enum class OnboardingStep {
  NAME, AGE, GENDER, LOCATION, LANGUAGES, MUSIC, AVATAR, DONE;

  val index: Int get() = ordinal
  val total: Int get() = entries.size - 1 // exclude DONE from progress
}

/**
 * Check if onboarding is needed for the given address.
 * Fast path: SharedPreferences. Slow path: on-chain RPC queries.
 * Returns the step to resume at, or null if onboarding is complete.
 */
suspend fun checkOnboardingStatus(
  context: Context,
  userAddress: String,
): OnboardingStep? = withContext(Dispatchers.IO) {
  val prefs = context.getSharedPreferences("heaven_onboarding", Context.MODE_PRIVATE)
  val key = "onboarding:${userAddress.lowercase()}"

  // Fast path
  if (prefs.getString(key, null) == "complete") return@withContext null

  // Slow path: check on-chain
  try {
    val name = TempoNameRecordsApi.getPrimaryName(userAddress) ?: OnboardingRpcHelpers.getPrimaryName(userAddress)
    if (name.isNullOrBlank()) return@withContext OnboardingStep.NAME

    val hasProfile = OnboardingRpcHelpers.hasProfile(userAddress)
    if (!hasProfile) return@withContext OnboardingStep.AGE

    val node = TempoNameRecordsApi.computeNode(name)
    val avatar = TempoNameRecordsApi.getTextRecord(node, "avatar") ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
    if (avatar.isNullOrBlank()) return@withContext OnboardingStep.AVATAR

    // All checks passed — mark complete
    prefs.edit().putString(key, "complete").apply()
    null
  } catch (e: Exception) {
    Log.w(TAG, "checkOnboardingStatus failed: ${e.message}")
    // If RPC fails, assume needs onboarding from start
    OnboardingStep.NAME
  }
}

/** Mark onboarding as complete in SharedPreferences */
fun markOnboardingComplete(context: Context, userAddress: String) {
  val prefs = context.getSharedPreferences("heaven_onboarding", Context.MODE_PRIVATE)
  prefs.edit().putString("onboarding:${userAddress.lowercase()}", "complete").apply()
}

private fun isUsableOnboardingSessionKey(
  sessionKey: SessionKeyManager.SessionKey?,
  ownerAddress: String,
): Boolean {
  return SessionKeyManager.isValid(sessionKey, ownerAddress = ownerAddress)
}

@Composable
fun OnboardingScreen(
  activity: androidx.fragment.app.FragmentActivity?,
  userEthAddress: String,
  tempoAddress: String?,
  tempoCredentialId: String?,
  tempoPubKeyX: String?,
  tempoPubKeyY: String?,
  tempoRpId: String = TempoPasskeyManager.DEFAULT_RP_ID,
  initialStep: OnboardingStep = OnboardingStep.NAME,
  onEnsureMessagingInbox: (() -> Unit)? = null,
  onComplete: () -> Unit,
) {
  val scope = rememberCoroutineScope()
  val context = androidx.compose.ui.platform.LocalContext.current
  val tempoAccount = remember(tempoAddress, tempoCredentialId, tempoPubKeyX, tempoPubKeyY, tempoRpId, userEthAddress) {
    TempoAccountFactory
      .fromSession(
        tempoAddress = tempoAddress,
        tempoCredentialId = tempoCredentialId,
        tempoPubKeyX = tempoPubKeyX,
        tempoPubKeyY = tempoPubKeyY,
        tempoRpId = tempoRpId,
      )
      ?.takeIf { account ->
        userEthAddress.isBlank() || account.address.equals(userEthAddress, ignoreCase = true)
      }
  }
  val canUseTempoNameRegistration = tempoAccount != null && activity != null

  var step by remember { mutableStateOf(initialStep) }
  var submitting by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  // Collected data
  var claimedName by remember { mutableStateOf("") }
  var claimedTld by remember { mutableStateOf("heaven") }
  var selectedNameTld by remember { mutableStateOf("heaven") }
  var age by remember { mutableIntStateOf(0) }
  var gender by remember { mutableStateOf("") }
  var selectedLocation by remember { mutableStateOf<com.pirate.app.onboarding.steps.LocationResult?>(null) }
  var location by remember { mutableStateOf("") }
  var onboardingSessionKey by remember(tempoAccount?.address) { mutableStateOf<SessionKeyManager.SessionKey?>(null) }
  var sessionSetupStatus by remember(tempoAccount?.address) { mutableStateOf(SessionSetupStatus.CHECKING) }
  var sessionSetupError by remember(tempoAccount?.address) { mutableStateOf<String?>(null) }

  fun resolveKnownSessionKey(
    account: TempoPasskeyManager.PasskeyAccount,
    hostActivity: androidx.fragment.app.FragmentActivity,
  ): SessionKeyManager.SessionKey? {
    val active = onboardingSessionKey?.takeIf { isUsableOnboardingSessionKey(it, ownerAddress = account.address) }
    if (active != null) {
      Log.d(TAG, "Using in-memory onboarding session key for ${account.address}")
      return active
    }

    val loaded = SessionKeyManager.load(hostActivity)
    if (isUsableOnboardingSessionKey(loaded, ownerAddress = account.address)) {
      onboardingSessionKey = loaded
      sessionSetupStatus = SessionSetupStatus.READY
      sessionSetupError = null
      Log.d(
        TAG,
        "Reusing stored onboarding session key for ${account.address}, expiresAt=${loaded?.expiresAt}",
      )
      return loaded
    }

    if (loaded != null) {
      Log.d(
        TAG,
        "Stored session key not usable for ${account.address}: owner=${loaded.ownerAddress} expiresAt=${loaded.expiresAt}",
      )
    } else {
      Log.d(TAG, "No stored session key found for ${account.address}")
    }
    onboardingSessionKey = null
    // Do not clear shared session storage on owner mismatch; account selection can
    // change during app startup and we can otherwise wipe a valid key.
    return null
  }

  suspend fun ensureOnboardingSessionKey(forceRefresh: Boolean = false): SessionKeyManager.SessionKey? {
    val hostActivity = activity
    val account = tempoAccount
    if (hostActivity == null || account == null) {
      onboardingSessionKey = null
      sessionSetupStatus = SessionSetupStatus.FAILED
      sessionSetupError =
        when {
          tempoAccount != null -> "Missing activity for Tempo transaction signing."
          else -> "Tempo account required for onboarding."
        }
      return null
    }

    val active = resolveKnownSessionKey(account = account, hostActivity = hostActivity)
    if (!forceRefresh && active != null) {
      sessionSetupStatus = SessionSetupStatus.READY
      sessionSetupError = null
      Log.d(TAG, "Onboarding session key already ready for ${account.address}")
      return active
    }

    sessionSetupError = null
    if (forceRefresh) {
      onboardingSessionKey = null
      SessionKeyManager.clear(hostActivity)
    } else {
      sessionSetupStatus = SessionSetupStatus.CHECKING
    }

    sessionSetupStatus = SessionSetupStatus.AUTHORIZING
    Log.d(TAG, "Authorizing new onboarding session key for ${account.address} (forceRefresh=$forceRefresh)")
    val authResult =
      TempoSessionKeyApi.authorizeSessionKey(
        activity = hostActivity,
        account = account,
        rpId = account.rpId,
      )
    if (!authResult.success) {
      onboardingSessionKey = null
      sessionSetupStatus = SessionSetupStatus.FAILED
      sessionSetupError = authResult.error ?: "Session key authorization failed."
      Log.w(TAG, "Onboarding session key authorization failed: ${authResult.error}")
      return null
    }

    val authorized = authResult.sessionKey
    if (!isUsableOnboardingSessionKey(authorized, ownerAddress = account.address)) {
      onboardingSessionKey = null
      sessionSetupStatus = SessionSetupStatus.FAILED
      sessionSetupError = "Session key authorization returned an invalid key."
      Log.w(TAG, "Onboarding session key authorization returned invalid key")
      return null
    }

    onboardingSessionKey = authorized
    sessionSetupStatus = SessionSetupStatus.READY
    sessionSetupError = null
    Log.d(TAG, "Onboarding session key authorized for ${account.address} tx=${authResult.txHash}")
    return authorized
  }

  fun stepNeedsSessionKey(currentStep: OnboardingStep): Boolean {
    return currentStep != OnboardingStep.NAME && currentStep != OnboardingStep.DONE
  }

  LaunchedEffect(activity, tempoAccount?.address, step) {
    val hostActivity = activity
    val account = tempoAccount
    if (hostActivity == null || account == null) return@LaunchedEffect

    if (stepNeedsSessionKey(step)) {
      ensureOnboardingSessionKey(forceRefresh = false)
    } else {
      resolveKnownSessionKey(account = account, hostActivity = hostActivity)
    }
  }

  fun resolveSessionKeyForWrites(
    account: TempoPasskeyManager.PasskeyAccount,
  ): SessionKeyManager.SessionKey? {
    val hostActivity = activity
      ?: run {
        onboardingSessionKey = null
        sessionSetupStatus = SessionSetupStatus.FAILED
        sessionSetupError = "Missing activity for Tempo transaction signing."
        return null
      }
    val active = resolveKnownSessionKey(account = account, hostActivity = hostActivity)
    if (active != null) {
      Log.d(TAG, "Resolved onboarding write session key for ${account.address}")
      return active
    }

    onboardingSessionKey = null
    sessionSetupStatus = SessionSetupStatus.FAILED
    sessionSetupError = "Session key unavailable. Retry setup to continue onboarding."
    Log.w(TAG, "Session key unavailable for onboarding writes: ${account.address}")
    return null
  }

  suspend fun ensureContentPubKeyPublished(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
  ): String? {
    val hostActivity = activity ?: return "Missing activity for Tempo transaction signing."
    val contentPubKey = withContext(Dispatchers.IO) { ContentKeyManager.getOrCreate(context).publicKey }
    val targetName =
      when {
        claimedName.isNotBlank() -> "$claimedName.$claimedTld"
        else -> TempoNameRecordsApi.getPrimaryName(account.address)
      }
    val node = targetName?.let { runCatching { TempoNameRecordsApi.computeNode(it) }.getOrNull() }
      ?: return "Primary name required to publish content encryption key."
    Log.d(TAG, "ensureContentPubKey: name=$targetName node=$node address=${account.address}")

    // Debug: check on-chain authorization before attempting write
    withContext(Dispatchers.IO) {
      runCatching {
        val isAuth = TempoNameRecordsApi.isAuthorized(node, account.address)
        Log.d(TAG, "ensureContentPubKey: isAuthorized($node, ${account.address}) = $isAuth")
      }.onFailure { Log.w(TAG, "ensureContentPubKey: isAuthorized check failed: ${it.message}") }
    }

    val existing =
      TempoNameRecordsApi.decodeContentPubKey(
        TempoNameRecordsApi.getTextRecord(node, TempoNameRecordsApi.CONTENT_PUBKEY_RECORD_KEY),
      )
    if (existing != null && existing.contentEquals(contentPubKey)) {
      return null
    }

    val publishResult =
      TempoNameRecordsApi.setTextRecords(
        activity = hostActivity,
        account = account,
        node = node,
        keys = listOf(TempoNameRecordsApi.CONTENT_PUBKEY_RECORD_KEY),
        values = listOf(TempoNameRecordsApi.encodeContentPubKey(contentPubKey)),
        rpId = account.rpId,
        sessionKey = sessionKey,
      )
    if (!publishResult.success) {
      return publishResult.error ?: "Failed to publish content encryption key."
    }

    // Wait for TX receipt before polling state — the TX hash is returned immediately
    // but the state isn't updated until the TX is mined.
    val txHash = publishResult.txHash
    if (!txHash.isNullOrBlank()) {
      var receiptConfirmed = false
      for (attempt in 0 until 30) {
        val receipt = withContext(Dispatchers.IO) {
          runCatching { TempoClient.getTransactionReceipt(txHash) }.getOrNull()
        }
        if (receipt != null) {
          if (!receipt.isSuccess) {
            Log.e(TAG, "contentPubKey TX reverted: txHash=$txHash status=${receipt.statusHex}")
            return "Content encryption key TX reverted (status ${receipt.statusHex}). Check session key permissions."
          }
          Log.d(TAG, "contentPubKey TX confirmed: txHash=$txHash")
          receiptConfirmed = true
          break
        }
        if (attempt < 29) delay(1000)
      }
      if (!receiptConfirmed) {
        Log.w(TAG, "contentPubKey TX receipt not found after 30s: txHash=$txHash")
        return "Content encryption key TX not confirmed after 30s. Please try again."
      }
    }

    // Now verify the on-chain state matches
    repeat(6) { attempt ->
      val stored =
        TempoNameRecordsApi.decodeContentPubKey(
          TempoNameRecordsApi.getTextRecord(node, TempoNameRecordsApi.CONTENT_PUBKEY_RECORD_KEY),
        )
      if (stored != null && stored.contentEquals(contentPubKey)) {
        return null
      }
      if (attempt < 5) delay(1000)
    }
    return "Content encryption key is still confirming on-chain. Please try again."
  }

  val progress = step.index.toFloat() / step.total.toFloat()

  if (stepNeedsSessionKey(step) && sessionSetupStatus != SessionSetupStatus.READY) {
    Column(
      modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
    ) {
      Text(
        text = "Setting up your account...",
        style = MaterialTheme.typography.headlineSmall,
      )
      Spacer(Modifier.height(16.dp))
      when (sessionSetupStatus) {
        SessionSetupStatus.CHECKING,
        SessionSetupStatus.AUTHORIZING,
        -> {
          CircularProgressIndicator()
          Spacer(Modifier.height(16.dp))
          Text(
            text = "Authorizing your session key for silent onboarding writes.",
            style = MaterialTheme.typography.bodyMedium,
          )
        }

        SessionSetupStatus.FAILED -> {
          Text(
            text = sessionSetupError ?: "Session setup failed. Please retry.",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
          )
          Spacer(Modifier.height(16.dp))
          Button(
            onClick = {
              scope.launch {
                ensureOnboardingSessionKey(forceRefresh = true)
              }
            },
          ) {
            Text("Retry")
          }
        }

        SessionSetupStatus.READY -> Unit
      }
    }
    return
  }

  Column(
    modifier = Modifier.fillMaxSize().padding(top = 48.dp),
  ) {
    // Back button + progress bar (Duolingo-style)
    if (step != OnboardingStep.DONE) {
      Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
      ) {
        // Back button — invisible on first step to keep layout stable
        IconButton(
          onClick = {
            if (!submitting && step.ordinal > 0) {
              val prev = OnboardingStep.entries[step.ordinal - 1]
              step = prev
              error = null
            }
          },
          enabled = step.ordinal > 0,
          colors = IconButtonDefaults.iconButtonColors(
            contentColor = MaterialTheme.colorScheme.onBackground,
            disabledContentColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0f),
          ),
        ) {
          Icon(
            Icons.AutoMirrored.Rounded.ArrowBack,
            contentDescription = "Back",
            modifier = Modifier.size(24.dp),
          )
        }

        LinearProgressIndicator(
          progress = { progress.coerceIn(0f, 1f) },
          modifier = Modifier.weight(1f).padding(start = 8.dp),
          color = MaterialTheme.colorScheme.primary,
          trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
      }
      Spacer(Modifier.height(24.dp))
    }

    if (!error.isNullOrBlank() && step != OnboardingStep.NAME && step != OnboardingStep.AVATAR) {
      Text(
        text = error ?: "",
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.padding(horizontal = 24.dp),
      )
      Spacer(Modifier.height(12.dp))
    }

    AnimatedContent(
      targetState = step,
      transitionSpec = {
        slideInHorizontally { it } togetherWith slideOutHorizontally { -it }
      },
      label = "onboarding-step",
    ) { currentStep ->
      when (currentStep) {
        OnboardingStep.NAME -> NameStep(
          submitting = submitting,
          error = error,
          selectedTld = selectedNameTld,
          showPirateOption = canUseTempoNameRegistration,
          onTldChange = { selectedNameTld = it },
          onCheckAvailable = { label, tld ->
            if (canUseTempoNameRegistration) {
              TempoNameRegistryApi.checkNameAvailable(label = label, tld = tld)
            } else {
              false
            }
          },
          onContinue = { label, tld ->
            scope.launch {
              submitting = true
              error = null
              try {
                val normalizedTld = tld.trim().lowercase()
                val registrationError =
                  when {
                    canUseTempoNameRegistration -> {
                      val account = tempoAccount ?: return@launch
                      val hostActivity = activity ?: return@launch
                      val existingSession = resolveKnownSessionKey(account = account, hostActivity = hostActivity)
                      val result =
                        TempoNameRegistryApi.register(
                          activity = hostActivity,
                          account = account,
                          label = label,
                          tld = normalizedTld,
                          rpId = account.rpId,
                          sessionKey = existingSession,
                          bootstrapSessionKey = false,
                          preferSelfPay = true,
                        )
                      if (result.success) {
                        if (isUsableOnboardingSessionKey(existingSession, ownerAddress = account.address)) {
                          onboardingSessionKey = existingSession
                          sessionSetupStatus = SessionSetupStatus.READY
                        } else {
                          onboardingSessionKey = null
                          sessionSetupStatus = SessionSetupStatus.CHECKING
                        }
                        sessionSetupError = null
                        claimedName = label
                        claimedTld = result.tld ?: normalizedTld
                        null
                      } else {
                        result.error ?: "Registration failed"
                      }
                    }
                    else -> "Tempo account required for onboarding."
                  }

                if (registrationError == null) {
                  step = OnboardingStep.AGE
                } else {
                  error = registrationError
                }
              } catch (e: Exception) {
                error = e.message ?: "Registration failed"
              } finally {
                submitting = false
              }
            }
          },
        )

        OnboardingStep.AGE -> AgeStep(
          submitting = submitting,
          onContinue = { ageValue ->
            age = ageValue
            step = OnboardingStep.GENDER
          },
        )

        OnboardingStep.GENDER -> GenderStep(
          submitting = submitting,
          onContinue = { genderValue ->
            gender = genderValue
            step = OnboardingStep.LOCATION
          },
        )

        OnboardingStep.LOCATION -> LocationStep(
          submitting = submitting,
          onContinue = { result ->
            selectedLocation = result
            location = result.label
            step = OnboardingStep.LANGUAGES
          },
        )

        OnboardingStep.LANGUAGES -> LanguagesStep(
          submitting = submitting,
          onContinue = { langs ->
            // Now submit all profile data (age, gender, location, languages)
            scope.launch {
              submitting = true
              error = null
              try {
                // Build profile input JSON
                // ProfileV2.sol: Unset=0, Woman=1, Man=2, NonBinary=3, TransWoman=4, TransMan=5, Intersex=6, Other=7
                val genderEnum = when (gender) {
                  "woman" -> 1; "man" -> 2; "nonbinary" -> 3
                  "transwoman" -> 4; "transman" -> 5; "intersex" -> 6; "other" -> 7
                  else -> 0
                }

                val profileInput = JSONObject()
                  .put("age", age)
                  .put("gender", genderEnum)

                // Pack languages into uint256 (matching contract's languagesPacked)
                val languagesPacked = com.pirate.app.onboarding.steps.packLanguages(langs)
                profileInput.put("languagesPacked", languagesPacked)

                // Location city ID = keccak256(location string)
                val locationResult = selectedLocation
                if (locationResult != null) {
                  val cityHash = OnboardingRpcHelpers.keccak256(locationResult.label.toByteArray(Charsets.UTF_8))
                  profileInput.put("locationCityId", "0x" + OnboardingRpcHelpers.bytesToHex(cityHash))
                  profileInput.put("locationLatE6", (locationResult.lat * 1_000_000.0).roundToInt())
                  profileInput.put("locationLngE6", (locationResult.lng * 1_000_000.0).roundToInt())
                }

                val account = tempoAccount
                val hostActivity = activity
                if (account == null || hostActivity == null) {
                  error =
                    when {
                      tempoAccount != null -> "Missing activity for Tempo transaction signing."
                      else -> "Tempo account required for onboarding."
                    }
                  return@launch
                }
                val sessionKey = resolveSessionKeyForWrites(account = account)
                if (sessionKey == null) return@launch // gate UI takes over
                val contentPubKeyError = ensureContentPubKeyPublished(account = account, sessionKey = sessionKey)
                if (contentPubKeyError != null) {
                  Log.w(TAG, "contentPubKey publish failed at LANGUAGES: $contentPubKeyError")
                  error = contentPubKeyError
                  return@launch
                }

                val profileResult =
                  TempoProfileContractApi.upsertProfile(
                    activity = hostActivity,
                    account = account,
                    profileInput = profileInput,
                    rpId = account.rpId,
                    sessionKey = sessionKey,
                  )
                val profileError = if (profileResult.success) null else profileResult.error ?: "setProfile failed"
                if (profileError != null) {
                  Log.w(TAG, "setProfile failed: $profileError")
                  // Non-fatal for onboarding — proceed
                }

                // Also set location text record
                if (claimedName.isNotBlank() && location.isNotBlank()) {
                  try {
                    val node = TempoNameRecordsApi.computeNode("$claimedName.$claimedTld")
                    val writeResult =
                      TempoNameRecordsApi.setTextRecords(
                        activity = hostActivity,
                        account = account,
                        node = node,
                        keys = listOf("heaven.location"),
                        values = listOf(location),
                        rpId = account.rpId,
                        sessionKey = sessionKey,
                      )
                    if (!writeResult.success) {
                      Log.w(TAG, "setTextRecord location failed: ${writeResult.error}")
                    }
                  } catch (e: Exception) {
                    Log.w(TAG, "setTextRecord location failed: ${e.message}")
                  }
                }

                step = OnboardingStep.MUSIC
              } catch (e: Exception) {
                error = e.message ?: "Failed to save profile"
              } finally {
                submitting = false
              }
            }
          },
        )

        OnboardingStep.MUSIC -> MusicStep(
          submitting = submitting,
          onContinue = { selectedArtists ->
            scope.launch {
              submitting = true
              error = null
              try {
                if (selectedArtists.isNotEmpty() && claimedName.isNotBlank()) {
                  val node = TempoNameRecordsApi.computeNode("$claimedName.$claimedTld")
                  val mbids = selectedArtists.map { it.mbid }.distinct()
                  val musicPayload = JSONObject()
                    .put("version", 1)
                    .put("source", "manual")
                    .put("updatedAt", System.currentTimeMillis() / 1000)
                    .put("artistMbids", org.json.JSONArray(mbids))
                  val account = tempoAccount
                  val hostActivity = activity
                  if (account == null || hostActivity == null) {
                    error =
                      when {
                        tempoAccount != null -> "Missing activity for Tempo transaction signing."
                        else -> "Tempo account required for onboarding."
                      }
                    return@launch
                  }
                  val sessionKey = resolveSessionKeyForWrites(account = account)
                  if (sessionKey == null) return@launch // gate UI takes over
                  val writeResult =
                    TempoNameRecordsApi.setTextRecords(
                      activity = hostActivity,
                      account = account,
                      node = node,
                      keys = listOf("heaven.music.v1", "heaven.music.count"),
                      values = listOf(musicPayload.toString(), mbids.size.toString()),
                      rpId = account.rpId,
                      sessionKey = sessionKey,
                    )
                  if (!writeResult.success) {
                    Log.w(TAG, "Music save failed: ${writeResult.error}")
                  }
                }
                step = OnboardingStep.AVATAR
              } catch (e: Exception) {
                Log.w(TAG, "Music save failed: ${e.message}")
                // Non-fatal — proceed
                step = OnboardingStep.AVATAR
              } finally {
                submitting = false
              }
            }
          },
        )

        OnboardingStep.AVATAR -> AvatarStep(
          submitting = submitting,
          error = error,
          onContinue = { base64, _ ->
            scope.launch {
              submitting = true
              error = null
              try {
                // Upload avatar as a signed ANS-104 dataitem (LS3 ref).
                val hostActivity = activity
                val account = tempoAccount
                if (hostActivity == null || account == null) {
                  error = "Tempo account required for avatar upload."
                  return@launch
                }

                val activeSessionKey = resolveSessionKeyForWrites(account = account)
                if (activeSessionKey == null) return@launch // gate UI takes over
                val contentPubKeyError = ensureContentPubKeyPublished(account = account, sessionKey = activeSessionKey)
                if (contentPubKeyError != null) {
                  Log.w(TAG, "contentPubKey publish failed at AVATAR_CONTINUE: $contentPubKeyError")
                  error = contentPubKeyError
                  return@launch
                }

                val uploadResult = withContext(Dispatchers.IO) {
                  val jpegBytes = Base64.decode(base64, Base64.DEFAULT)
                  ProfileAvatarUploadApi.uploadAvatarJpeg(
                    appContext = context,
                    ownerEthAddress = account.address,
                    jpegBytes = jpegBytes,
                  )
                }
                if (!uploadResult.success || uploadResult.avatarRef.isNullOrBlank()) {
                  error = uploadResult.error ?: "Avatar upload failed"
                  return@launch
                }

                // Set avatar text record
                if (claimedName.isNotBlank()) {
                  val node = TempoNameRecordsApi.computeNode("$claimedName.$claimedTld")
                  val avatarURI = uploadResult.avatarRef
                  val writeResult =
                    TempoNameRecordsApi.setTextRecords(
                      activity = hostActivity,
                      account = account,
                      node = node,
                      keys = listOf("avatar"),
                      values = listOf(avatarURI),
                      rpId = account.rpId,
                      sessionKey = activeSessionKey,
                    )
                  if (!writeResult.success) {
                    error = writeResult.error ?: "Failed to set avatar record"
                    return@launch
                  }
                }

                markOnboardingComplete(context, account.address)
                onEnsureMessagingInbox?.invoke()
                step = OnboardingStep.DONE
              } catch (e: Exception) {
                error = e.message ?: "Avatar upload failed"
              } finally {
                submitting = false
              }
            }
          },
          onSkip = {
            scope.launch {
              submitting = true
              error = null
              try {
                val account = tempoAccount
                if (account == null) {
                  error = "Tempo account required for onboarding."
                  return@launch
                }
                val activeSessionKey = resolveSessionKeyForWrites(account = account)
                if (activeSessionKey == null) return@launch // gate UI takes over
                val contentPubKeyError = ensureContentPubKeyPublished(account = account, sessionKey = activeSessionKey)
                if (contentPubKeyError != null) {
                  Log.w(TAG, "contentPubKey publish failed at AVATAR_SKIP: $contentPubKeyError")
                  error = contentPubKeyError
                  return@launch
                }
                markOnboardingComplete(context, account.address)
                onEnsureMessagingInbox?.invoke()
                step = OnboardingStep.DONE
              } finally {
                submitting = false
              }
            }
          },
        )

        OnboardingStep.DONE -> DoneStep(
          claimedName = claimedName.ifBlank { "there" },
          onFinished = onComplete,
        )
      }
    }
  }
}
