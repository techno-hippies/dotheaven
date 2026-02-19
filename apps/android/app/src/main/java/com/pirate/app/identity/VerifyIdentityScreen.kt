package com.pirate.app.identity

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
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pirate.app.auth.PirateAuthUiState

@Composable
fun VerifyIdentityScreen(
  authState: PirateAuthUiState,
  ownerAddress: String?,
  isAuthenticated: Boolean,
  onSelfVerifiedChange: (Boolean) -> Unit = {},
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  if (!isAuthenticated || ownerAddress == null) {
    LaunchedEffect(Unit) {
      onShowMessage("Please sign in first")
      onClose()
    }
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
      Text("Redirecting...", style = MaterialTheme.typography.bodyLarge)
    }
    return
  }

  SelfVerificationGate(
    pkpAddress = ownerAddress,
    cachedVerified = authState.selfVerified,
    onVerified = { onSelfVerifiedChange(true) },
  ) {
    Column(
      modifier = Modifier.fillMaxSize().padding(32.dp),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Icon(
        Icons.Rounded.Check,
        contentDescription = null,
        modifier = Modifier.size(64.dp),
        tint = MaterialTheme.colorScheme.primary,
      )
      Spacer(Modifier.height(24.dp))
      Text(
        "Identity Verified",
        style = MaterialTheme.typography.headlineSmall,
        textAlign = TextAlign.Center,
      )
      Spacer(Modifier.height(12.dp))
      Text(
        "Your profile is verified with Self.xyz. You can now publish songs and claim short names.",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Spacer(Modifier.height(24.dp))
      Button(onClick = onClose) {
        Text("Done")
      }
    }
  }
}
