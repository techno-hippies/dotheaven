package com.pirate.app.onboarding

import android.content.Context
import android.util.Log
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import com.pirate.app.onboarding.steps.AgeStep
import com.pirate.app.onboarding.steps.AvatarStep
import com.pirate.app.onboarding.steps.DoneStep
import com.pirate.app.onboarding.steps.GenderStep
import com.pirate.app.onboarding.steps.LanguagesStep
import com.pirate.app.onboarding.steps.LocationResult
import com.pirate.app.onboarding.steps.LocationStep
import com.pirate.app.onboarding.steps.MusicStep
import com.pirate.app.onboarding.steps.NameStep
import com.pirate.app.profile.TempoNameRegistryApi
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import kotlinx.coroutines.launch

private const val TAG = "OnboardingScreen"

@Composable
internal fun OnboardingStepContent(
  step: OnboardingStep,
  submitting: Boolean,
  error: String?,
  selectedNameTld: String,
  canUseTempoNameRegistration: Boolean,
  activity: androidx.fragment.app.FragmentActivity?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
  onboardingSessionKey: SessionKeyManager.SessionKey?,
  claimedName: String,
  claimedTld: String,
  age: Int,
  gender: String,
  selectedLocation: LocationResult?,
  location: String,
  onSelectedNameTldChange: (String) -> Unit,
  onClaimedNameChange: (String) -> Unit,
  onClaimedTldChange: (String) -> Unit,
  onAgeChange: (Int) -> Unit,
  onGenderChange: (String) -> Unit,
  onSelectedLocationChange: (LocationResult?) -> Unit,
  onLocationChange: (String) -> Unit,
  onOnboardingSessionKeyChange: (SessionKeyManager.SessionKey?) -> Unit,
  onSessionSetupStatusChange: (SessionSetupStatus) -> Unit,
  onSessionSetupErrorChange: (String?) -> Unit,
  onStepChange: (OnboardingStep) -> Unit,
  onSubmittingChange: (Boolean) -> Unit,
  onErrorChange: (String?) -> Unit,
  onApplySessionResult: (OnboardingSessionResult?) -> Unit,
  context: Context,
  onEnsureMessagingInbox: (() -> Unit)?,
  onComplete: () -> Unit,
) {
  val scope = rememberCoroutineScope()
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
        onTldChange = onSelectedNameTldChange,
        onCheckAvailable = { label, tld ->
          if (canUseTempoNameRegistration) {
            TempoNameRegistryApi.checkNameAvailable(label = label, tld = tld)
          } else {
            false
          }
        },
        onContinue = { label, tld ->
          scope.launch {
            onSubmittingChange(true)
            onErrorChange(null)
            try {
              val normalizedTld = tld.trim().lowercase()
              val registrationError =
                when {
                  canUseTempoNameRegistration -> {
                    val account = tempoAccount ?: return@launch
                    val hostActivity = activity ?: return@launch
                    val existingSession =
                      resolveKnownOnboardingSessionKey(
                        account = account,
                        hostActivity = hostActivity,
                        currentSessionKey = onboardingSessionKey,
                      )
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
                        onOnboardingSessionKeyChange(existingSession)
                        onSessionSetupStatusChange(SessionSetupStatus.READY)
                      } else {
                        onOnboardingSessionKeyChange(null)
                        onSessionSetupStatusChange(SessionSetupStatus.CHECKING)
                      }
                      onSessionSetupErrorChange(null)
                      onClaimedNameChange(label)
                      onClaimedTldChange(result.tld ?: normalizedTld)
                      null
                    } else {
                      result.error ?: "Registration failed"
                    }
                  }

                  else -> "Tempo account required for onboarding."
                }

              if (registrationError == null) {
                onStepChange(OnboardingStep.AGE)
              } else {
                onErrorChange(registrationError)
              }
            } catch (e: Exception) {
              onErrorChange(e.message ?: "Registration failed")
            } finally {
              onSubmittingChange(false)
            }
          }
        },
      )

      OnboardingStep.AGE -> AgeStep(
        submitting = submitting,
        onContinue = { ageValue ->
          onAgeChange(ageValue)
          onStepChange(OnboardingStep.GENDER)
        },
      )

      OnboardingStep.GENDER -> GenderStep(
        submitting = submitting,
        onContinue = { genderValue ->
          onGenderChange(genderValue)
          onStepChange(OnboardingStep.LOCATION)
        },
      )

      OnboardingStep.LOCATION -> LocationStep(
        submitting = submitting,
        onContinue = { result ->
          onSelectedLocationChange(result)
          onLocationChange(result.label)
          onStepChange(OnboardingStep.LANGUAGES)
        },
      )

      OnboardingStep.LANGUAGES -> LanguagesStep(
        submitting = submitting,
        onContinue = { langs ->
          scope.launch {
            onSubmittingChange(true)
            onErrorChange(null)
            try {
              val writeResult =
                submitOnboardingProfileStep(
                  context = context,
                  activity = activity,
                  account = tempoAccount,
                  currentSessionKey = onboardingSessionKey,
                  age = age,
                  gender = gender,
                  selectedLocation = selectedLocation,
                  languages = langs,
                  claimedName = claimedName,
                  claimedTld = claimedTld,
                  locationLabel = location,
                )
              onApplySessionResult(writeResult.sessionResult)
              if (!writeResult.success) {
                onErrorChange(writeResult.error ?: "Failed to save profile")
                return@launch
              }
              onStepChange(OnboardingStep.MUSIC)
            } catch (e: Exception) {
              onErrorChange(e.message ?: "Failed to save profile")
            } finally {
              onSubmittingChange(false)
            }
          }
        },
      )

      OnboardingStep.MUSIC -> MusicStep(
        submitting = submitting,
        onContinue = { selectedArtists ->
          scope.launch {
            onSubmittingChange(true)
            onErrorChange(null)
            try {
              val writeResult =
                submitOnboardingMusicStep(
                  activity = activity,
                  account = tempoAccount,
                  currentSessionKey = onboardingSessionKey,
                  selectedArtists = selectedArtists,
                  claimedName = claimedName,
                  claimedTld = claimedTld,
                )
              onApplySessionResult(writeResult.sessionResult)
              if (!writeResult.success) {
                onErrorChange(writeResult.error ?: "Music save failed")
                return@launch
              }
              onStepChange(OnboardingStep.AVATAR)
            } catch (e: Exception) {
              Log.w(TAG, "Music save failed: ${e.message}")
              // Non-fatal — proceed.
              onStepChange(OnboardingStep.AVATAR)
            } finally {
              onSubmittingChange(false)
            }
          }
        },
      )

      OnboardingStep.AVATAR -> AvatarStep(
        submitting = submitting,
        error = error,
        onContinue = { base64, _ ->
          scope.launch {
            onSubmittingChange(true)
            onErrorChange(null)
            try {
              val writeResult =
                submitOnboardingAvatarContinue(
                  context = context,
                  activity = activity,
                  account = tempoAccount,
                  currentSessionKey = onboardingSessionKey,
                  claimedName = claimedName,
                  claimedTld = claimedTld,
                  avatarBase64 = base64,
                )
              onApplySessionResult(writeResult.sessionResult)
              if (!writeResult.success) {
                onErrorChange(writeResult.error ?: "Avatar upload failed")
                return@launch
              }
              onEnsureMessagingInbox?.invoke()
              onStepChange(OnboardingStep.DONE)
            } catch (e: Exception) {
              onErrorChange(e.message ?: "Avatar upload failed")
            } finally {
              onSubmittingChange(false)
            }
          }
        },
        onSkip = {
          scope.launch {
            onSubmittingChange(true)
            onErrorChange(null)
            try {
              val writeResult =
                submitOnboardingAvatarSkip(
                  context = context,
                  activity = activity,
                  account = tempoAccount,
                  currentSessionKey = onboardingSessionKey,
                  claimedName = claimedName,
                  claimedTld = claimedTld,
                )
              onApplySessionResult(writeResult.sessionResult)
              if (!writeResult.success) {
                onErrorChange(writeResult.error ?: "Failed to finish onboarding")
                return@launch
              }
              onEnsureMessagingInbox?.invoke()
              onStepChange(OnboardingStep.DONE)
            } finally {
              onSubmittingChange(false)
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
