package com.pirate.app.onboarding

import android.content.Context
import android.util.Log
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
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.tempo.TempoAccountFactory
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.SessionKeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

  fun applySessionResult(sessionResult: OnboardingSessionResult?) {
    if (sessionResult == null) return
    onboardingSessionKey = sessionResult.sessionKey
    sessionSetupStatus = sessionResult.status
    sessionSetupError = sessionResult.error
  }

  fun stepNeedsSessionKey(currentStep: OnboardingStep): Boolean {
    return currentStep != OnboardingStep.NAME && currentStep != OnboardingStep.DONE
  }

  LaunchedEffect(activity, tempoAccount?.address, step) {
    val hostActivity = activity
    val account = tempoAccount
    if (hostActivity == null || account == null) return@LaunchedEffect

    if (stepNeedsSessionKey(step)) {
      sessionSetupStatus = SessionSetupStatus.AUTHORIZING
      sessionSetupError = null
      val sessionResult =
        ensureOnboardingSessionKey(
          activity = hostActivity,
          account = account,
          currentSessionKey = onboardingSessionKey,
          forceRefresh = false,
        )
      onboardingSessionKey = sessionResult.sessionKey
      sessionSetupStatus = sessionResult.status
      sessionSetupError = sessionResult.error
    } else {
      val known =
        resolveKnownOnboardingSessionKey(
          account = account,
          hostActivity = hostActivity,
          currentSessionKey = onboardingSessionKey,
        )
      if (known != null) {
        onboardingSessionKey = known
        sessionSetupStatus = SessionSetupStatus.READY
        sessionSetupError = null
      }
    }
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
                sessionSetupStatus = SessionSetupStatus.AUTHORIZING
                sessionSetupError = null
                val sessionResult =
                  ensureOnboardingSessionKey(
                    activity = activity,
                    account = tempoAccount,
                    currentSessionKey = onboardingSessionKey,
                    forceRefresh = true,
                  )
                onboardingSessionKey = sessionResult.sessionKey
                sessionSetupStatus = sessionResult.status
                sessionSetupError = sessionResult.error
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

    OnboardingStepContent(
      step = step,
      submitting = submitting,
      error = error,
      selectedNameTld = selectedNameTld,
      canUseTempoNameRegistration = canUseTempoNameRegistration,
      activity = activity,
      tempoAccount = tempoAccount,
      onboardingSessionKey = onboardingSessionKey,
      claimedName = claimedName,
      claimedTld = claimedTld,
      age = age,
      gender = gender,
      selectedLocation = selectedLocation,
      location = location,
      onSelectedNameTldChange = { selectedNameTld = it },
      onClaimedNameChange = { claimedName = it },
      onClaimedTldChange = { claimedTld = it },
      onAgeChange = { age = it },
      onGenderChange = { gender = it },
      onSelectedLocationChange = { selectedLocation = it },
      onLocationChange = { location = it },
      onOnboardingSessionKeyChange = { onboardingSessionKey = it },
      onSessionSetupStatusChange = { sessionSetupStatus = it },
      onSessionSetupErrorChange = { sessionSetupError = it },
      onStepChange = { step = it },
      onSubmittingChange = { submitting = it },
      onErrorChange = { error = it },
      onApplySessionResult = { applySessionResult(it) },
      context = context,
      onEnsureMessagingInbox = onEnsureMessagingInbox,
      onComplete = onComplete,
    )
  }
}
