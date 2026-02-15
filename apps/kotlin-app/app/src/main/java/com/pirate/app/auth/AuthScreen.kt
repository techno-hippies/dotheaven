package com.pirate.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AuthScreen(
  state: PirateAuthUiState,
  onStateChange: (PirateAuthUiState) -> Unit,
  onRegister: () -> Unit,
  onLogin: () -> Unit,
  onLogout: () -> Unit,
) {
  Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Card(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val signedIn = state.pkpPublicKey != null && state.authMethodId != null && state.accessToken != null
        Text(if (signedIn) "Signed in" else "Not signed in")
        if (signedIn) {
          val addr = state.pkpEthAddress
          val tokenId = state.pkpTokenId
          val pkp = state.pkpPublicKey
          if (!addr.isNullOrBlank()) Text("Address: ${addr.take(10)}…")
          if (!tokenId.isNullOrBlank()) Text("Token: ${tokenId.take(10)}…")
          if (!pkp.isNullOrBlank()) Text("PKP: ${pkp.take(18)}…")
        }

        HorizontalDivider()

        OutlinedTextField(
          value = state.authServiceBaseUrl,
          onValueChange = { onStateChange(state.copy(authServiceBaseUrl = it)) },
          label = { Text("Auth service base URL") },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          enabled = !state.busy,
        )
        OutlinedTextField(
          value = state.passkeyRpId,
          onValueChange = { onStateChange(state.copy(passkeyRpId = it)) },
          label = { Text("Passkey RP ID") },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          enabled = !state.busy,
        )
        OutlinedTextField(
          value = state.litNetwork,
          onValueChange = { onStateChange(state.copy(litNetwork = it)) },
          label = { Text("Lit network") },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          enabled = !state.busy,
        )
        OutlinedTextField(
          value = state.litRpcUrl,
          onValueChange = { onStateChange(state.copy(litRpcUrl = it)) },
          label = { Text("Lit RPC URL") },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
          enabled = !state.busy,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Button(
            enabled = !state.busy,
            onClick = onRegister,
          ) { Text("Register") }

          Button(
            enabled = !state.busy,
            onClick = onLogin,
          ) { Text("Login") }
        }

        HorizontalDivider()

        Button(
          enabled = !state.busy && state.pkpPublicKey != null,
          onClick = onLogout,
        ) { Text("Log Out") }
      }
    }

    Spacer(modifier = Modifier.height(4.dp))
    Text(state.output)
  }
}
