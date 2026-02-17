package com.pirate.app.onboarding

import android.content.Context
import android.util.Log
import android.util.Base64
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import com.pirate.app.tempo.TempoAccountFactory
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoSessionKeyApi
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.math.roundToInt

private const val TAG = "OnboardingScreen"

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

@Composable
fun OnboardingScreen(
  activity: androidx.fragment.app.FragmentActivity?,
  pkpEthAddress: String,
  tempoAddress: String?,
  tempoCredentialId: String?,
  tempoPubKeyX: String?,
  tempoPubKeyY: String?,
  tempoRpId: String = TempoPasskeyManager.DEFAULT_RP_ID,
  initialStep: OnboardingStep = OnboardingStep.NAME,
  onComplete: () -> Unit,
) {
  val scope = rememberCoroutineScope()
  val context = androidx.compose.ui.platform.LocalContext.current
  val tempoAccount = remember(tempoAddress, tempoCredentialId, tempoPubKeyX, tempoPubKeyY, tempoRpId, pkpEthAddress) {
    TempoAccountFactory
      .fromSession(
        tempoAddress = tempoAddress,
        tempoCredentialId = tempoCredentialId,
        tempoPubKeyX = tempoPubKeyX,
        tempoPubKeyY = tempoPubKeyY,
        tempoRpId = tempoRpId,
      )
      ?.takeIf { account ->
        pkpEthAddress.isBlank() || account.address.equals(pkpEthAddress, ignoreCase = true)
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
  var sessionKeyAuthorizationFailed by remember(tempoAccount?.address) { mutableStateOf(false) }

  LaunchedEffect(activity, tempoAccount?.address) {
    val hostActivity = activity ?: run {
      onboardingSessionKey = null
      return@LaunchedEffect
    }
    val accountAddress = tempoAccount?.address ?: run {
      onboardingSessionKey = null
      return@LaunchedEffect
    }

    val loaded = SessionKeyManager.load(hostActivity)
    if (SessionKeyManager.isValid(loaded, ownerAddress = accountAddress)) {
      onboardingSessionKey = loaded
      sessionKeyAuthorizationFailed = false
    } else {
      onboardingSessionKey = null
      if (loaded != null) SessionKeyManager.clear(hostActivity)
    }
  }

  suspend fun resolveSessionKeyForWrites(
    hostActivity: androidx.fragment.app.FragmentActivity,
    account: TempoPasskeyManager.PasskeyAccount,
  ): SessionKeyManager.SessionKey? {
    val active = onboardingSessionKey?.takeIf { SessionKeyManager.isValid(it, ownerAddress = account.address) }
    if (active != null) return active
    if (sessionKeyAuthorizationFailed) return null

    val authResult =
      TempoSessionKeyApi.authorizeSessionKey(
        activity = hostActivity,
        account = account,
        rpId = account.rpId,
      )
    if (!authResult.success) {
      sessionKeyAuthorizationFailed = true
      Log.w(TAG, "Session key authorization failed; falling back to passkey per tx: ${authResult.error}")
      return null
    }

    val sessionKey = authResult.sessionKey
    if (sessionKey == null || !SessionKeyManager.isValid(sessionKey, ownerAddress = account.address)) {
      sessionKeyAuthorizationFailed = true
      Log.w(TAG, "Session key authorization returned no valid key; falling back to passkey per tx")
      return null
    }

    onboardingSessionKey = sessionKey
    sessionKeyAuthorizationFailed = false
    return sessionKey
  }

  val progress = step.index.toFloat() / step.total.toFloat()

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
          modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
          color = MaterialTheme.colorScheme.primary,
          trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )

        Spacer(Modifier.width(48.dp)) // balance the back button
      }
      Spacer(Modifier.height(24.dp))
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
                      val account = tempoAccount
                        ?: return@launch
                      val hostActivity = activity
                        ?: return@launch
                      val sessionKey =
                        resolveSessionKeyForWrites(
                          hostActivity = hostActivity,
                          account = account,
                        )
                      val result =
                        TempoNameRegistryApi.register(
                          activity = hostActivity,
                          account = account,
                          label = label,
                          tld = normalizedTld,
                          rpId = account.rpId,
                          sessionKey = sessionKey,
                        )
                      if (result.success) {
                        claimedName = label
                        claimedTld = result.tld ?: normalizedTld
                        null
                      } else {
                        result.error ?: "Registration failed"
                      }
                    }
                    tempoAccount != null -> "Missing activity for Tempo passkey signing."
                    else -> "Tempo passkey account required for onboarding."
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

                val profileError =
                  when {
                    tempoAccount != null && activity != null -> {
                      val sessionKey =
                        resolveSessionKeyForWrites(
                          hostActivity = activity,
                          account = tempoAccount,
                        )
                      val result =
                        TempoProfileContractApi.upsertProfile(
                          activity = activity,
                          account = tempoAccount,
                          profileInput = profileInput,
                          rpId = tempoAccount.rpId,
                          sessionKey = sessionKey,
                        )
                      if (result.success) null else result.error ?: "setProfile failed"
                    }
                    tempoAccount != null -> "Missing activity for Tempo passkey signing."
                    else -> "Tempo passkey account required for onboarding."
                  }
                if (profileError != null) {
                  Log.w(TAG, "setProfile failed: $profileError")
                  // Non-fatal for onboarding — proceed
                }

                // Also set location text record
                if (claimedName.isNotBlank() && location.isNotBlank()) {
                  try {
                    val node = TempoNameRecordsApi.computeNode("$claimedName.$claimedTld")
                    when {
                      tempoAccount != null && activity != null -> {
                        val sessionKey =
                          resolveSessionKeyForWrites(
                            hostActivity = activity,
                            account = tempoAccount,
                          )
                        val writeResult =
                          TempoNameRecordsApi.setTextRecords(
                            activity = activity,
                            account = tempoAccount,
                            node = node,
                            keys = listOf("heaven.location"),
                            values = listOf(location),
                            rpId = tempoAccount.rpId,
                            sessionKey = sessionKey,
                          )
                        if (!writeResult.success) {
                          Log.w(TAG, "setTextRecord location failed: ${writeResult.error}")
                        }
                      }
                      else -> {
                        Log.w(TAG, "setTextRecord location skipped: missing Tempo passkey account")
                      }
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

                  when {
                    tempoAccount != null && activity != null -> {
                      val sessionKey =
                        resolveSessionKeyForWrites(
                          hostActivity = activity,
                          account = tempoAccount,
                        )
                      val writeResult =
                        TempoNameRecordsApi.setTextRecords(
                          activity = activity,
                          account = tempoAccount,
                          node = node,
                          keys = listOf("heaven.music.v1", "heaven.music.count"),
                          values = listOf(musicPayload.toString(), mbids.size.toString()),
                          rpId = tempoAccount.rpId,
                          sessionKey = sessionKey,
                        )
                      if (!writeResult.success) {
                        Log.w(TAG, "Music save failed: ${writeResult.error}")
                      }
                    }
                    else -> {
                      Log.w(TAG, "Music save skipped: missing Tempo passkey account")
                    }
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
                // Upload avatar via Heaven API proxy.
                val uploadResult = withContext(Dispatchers.IO) {
                  val jpegBytes = Base64.decode(base64, Base64.DEFAULT)
                  ProfileAvatarUploadApi.uploadAvatarJpeg(jpegBytes)
                }
                if (!uploadResult.success || uploadResult.avatarCid.isNullOrBlank()) {
                  error = uploadResult.error ?: "Avatar upload failed"
                  return@launch
                }

                // Set avatar text record
                if (claimedName.isNotBlank()) {
                  val node = TempoNameRecordsApi.computeNode("$claimedName.$claimedTld")
                  val avatarURI = "ipfs://${uploadResult.avatarCid}"
                  when {
                    tempoAccount != null && activity != null -> {
                      val sessionKey =
                        resolveSessionKeyForWrites(
                          hostActivity = activity,
                          account = tempoAccount,
                        )
                      val writeResult =
                        TempoNameRecordsApi.setTextRecords(
                          activity = activity,
                          account = tempoAccount,
                          node = node,
                          keys = listOf("avatar"),
                          values = listOf(avatarURI),
                          rpId = tempoAccount.rpId,
                          sessionKey = sessionKey,
                        )
                      if (!writeResult.success) {
                        error = writeResult.error ?: "Failed to set avatar record"
                        return@launch
                      }
                    }
                    else -> {
                      error = "Tempo passkey account required for onboarding."
                      return@launch
                    }
                  }
                }

                markOnboardingComplete(context, pkpEthAddress)
                step = OnboardingStep.DONE
              } catch (e: Exception) {
                error = e.message ?: "Avatar upload failed"
              } finally {
                submitting = false
              }
            }
          },
          onSkip = {
            markOnboardingComplete(context, pkpEthAddress)
            step = OnboardingStep.DONE
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
