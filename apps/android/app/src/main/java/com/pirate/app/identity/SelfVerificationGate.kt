package com.pirate.app.identity

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pirate.app.music.SongPublishService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private enum class VerifyState { LOADING, UNVERIFIED, OPENING, POLLING, VERIFIED, ERROR }

private const val POLL_INTERVAL_MS = 2_000L
private const val POLL_MAX_ATTEMPTS = 300 // 10 minutes at 2s intervals
private const val SELF_INSTALL_URL = "https://self.xyz/app"

/**
 * Identity verification gate. Shows verification flow if user is not Self-verified,
 * otherwise renders [content].
 */
@Composable
fun SelfVerificationGate(
  pkpAddress: String,
  cachedVerified: Boolean = false,
  apiBaseUrl: String = SongPublishService.HEAVEN_API_URL,
  onVerified: () -> Unit = {},
  content: @Composable () -> Unit,
) {
  val context = LocalContext.current
  var state by remember(cachedVerified) {
    mutableStateOf(if (cachedVerified) VerifyState.VERIFIED else VerifyState.LOADING)
  }
  var errorMessage by remember { mutableStateOf("") }
  var sessionId by remember { mutableStateOf<String?>(null) }
  var showInstallAction by remember { mutableStateOf(false) }

  // Initial identity check
  LaunchedEffect(pkpAddress, cachedVerified, apiBaseUrl) {
    if (cachedVerified) {
      state = VerifyState.VERIFIED
      onVerified()
      return@LaunchedEffect
    }
    state = VerifyState.LOADING
    try {
      val result = withContext(Dispatchers.IO) {
        SelfVerificationService.checkIdentity(apiBaseUrl, pkpAddress)
      }
      state = if (result.verified) {
        onVerified()
        VerifyState.VERIFIED
      } else {
        VerifyState.UNVERIFIED
      }
    } catch (e: Exception) {
      android.util.Log.e("SelfGate", "Identity check failed", e)
      errorMessage = e.message ?: "Failed to check identity"
      state = VerifyState.ERROR
    }
  }

  // Stateful side effects: session creation and polling.
  LaunchedEffect(state, sessionId, pkpAddress, apiBaseUrl) {
    when (state) {
      VerifyState.OPENING -> {
        try {
          val session = withContext(Dispatchers.IO) {
            SelfVerificationService.createSession(apiBaseUrl, pkpAddress)
          }
          sessionId = session.sessionId
          val intent = Intent(Intent.ACTION_VIEW, Uri.parse(session.deeplinkUrl))
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          android.util.Log.i("SelfGate", "Opening verification URL: ${session.deeplinkUrl}")
          try {
            context.startActivity(intent)
            showInstallAction = false
            state = VerifyState.POLLING
          } catch (e: ActivityNotFoundException) {
            android.util.Log.e("SelfGate", "No app can open verification URL", e)
            errorMessage = "No app can open the Self verification link. Install the Self app to continue."
            showInstallAction = true
            state = VerifyState.ERROR
          }
        } catch (e: Exception) {
          android.util.Log.e("SelfGate", "Session creation failed", e)
          errorMessage = e.message ?: "Failed to start verification"
          showInstallAction = false
          state = VerifyState.ERROR
        }
      }
      VerifyState.POLLING -> {
        val sid = sessionId ?: return@LaunchedEffect
        var attempts = 0
        while (attempts < POLL_MAX_ATTEMPTS) {
          delay(POLL_INTERVAL_MS)
          attempts++
          try {
            val poll = withContext(Dispatchers.IO) {
              SelfVerificationService.pollSession(apiBaseUrl, sid)
            }
            when (poll.status) {
              "verified" -> {
                state = VerifyState.VERIFIED
                onVerified()
                return@LaunchedEffect
              }
              "failed" -> {
                errorMessage = poll.reason ?: "Verification failed"
                state = VerifyState.ERROR
                return@LaunchedEffect
              }
              "expired" -> {
                errorMessage = "Session expired. Please try again."
                state = VerifyState.ERROR
                return@LaunchedEffect
              }
            }
          } catch (e: Exception) {
            android.util.Log.w("SelfGate", "Poll error (attempt $attempts)", e)
          }
        }
        errorMessage = "Verification timed out. If Self didn't open, install/update the Self app and try again."
        showInstallAction = true
        state = VerifyState.ERROR
      }
      else -> Unit
    }
  }

  when (state) {
    VerifyState.LOADING -> {
      Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
      }
    }

    VerifyState.VERIFIED -> {
      content()
    }

    VerifyState.UNVERIFIED -> {
      Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        Icon(
          Icons.Rounded.Shield,
          contentDescription = null,
          modifier = Modifier.size(64.dp),
          tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(24.dp))
        Text(
          "Identity Verification Required",
          style = MaterialTheme.typography.headlineSmall,
          textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
          "To publish music, you need to verify your identity with Self.xyz using your passport. This is a one-time process.",
          style = MaterialTheme.typography.bodyLarge,
          textAlign = TextAlign.Center,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = {
          errorMessage = ""
          showInstallAction = false
          state = VerifyState.OPENING
        }) {
          Text("Verify with Self")
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = {
          val intent = Intent(Intent.ACTION_VIEW, Uri.parse(SELF_INSTALL_URL))
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }) {
          Text("Get Self App")
        }
      }
    }

    VerifyState.OPENING -> {
      Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          CircularProgressIndicator()
          Spacer(Modifier.height(16.dp))
          Text("Opening Self.xyz...", style = MaterialTheme.typography.bodyLarge)
        }
      }
    }

    VerifyState.POLLING -> {
      Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(24.dp))
        Text(
          "Waiting for verification...",
          style = MaterialTheme.typography.headlineSmall,
          textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
          "Complete the verification in the Self app, then return here.",
          style = MaterialTheme.typography.bodyLarge,
          textAlign = TextAlign.Center,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }

    VerifyState.ERROR -> {
      Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        Icon(
          Icons.Rounded.Warning,
          contentDescription = null,
          modifier = Modifier.size(64.dp),
          tint = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(24.dp))
        Text(
          "Verification Failed",
          style = MaterialTheme.typography.headlineSmall,
          textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
          errorMessage,
          style = MaterialTheme.typography.bodyLarge,
          textAlign = TextAlign.Center,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = {
          errorMessage = ""
          showInstallAction = false
          state = VerifyState.UNVERIFIED
        }) {
          Text("Try Again")
        }
        if (showInstallAction) {
          Spacer(Modifier.height(12.dp))
          OutlinedButton(onClick = {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(SELF_INSTALL_URL))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
          }) {
            Text("Get Self App")
          }
        }
      }
    }
  }
}
