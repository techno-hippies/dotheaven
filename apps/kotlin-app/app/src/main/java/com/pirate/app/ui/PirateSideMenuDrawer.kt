package com.pirate.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PirateSideMenuDrawer(
  isAuthenticated: Boolean,
  busy: Boolean,
  onNavigateMusic: () -> Unit,
  onNavigateSchedule: () -> Unit,
  onNavigateChat: () -> Unit,
  onNavigateAccount: () -> Unit,
  onSignUp: () -> Unit,
  onSignIn: () -> Unit,
  onLogout: () -> Unit,
) {
  ModalDrawerSheet {
    Column(
      modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
          modifier = Modifier.size(32.dp),
          shape = RoundedCornerShape(10.dp),
          color = MaterialTheme.colorScheme.primaryContainer,
        ) {}
        Text("pirate", fontWeight = FontWeight.Bold)
      }

      HorizontalDivider()

      NavigationDrawerItem(
        label = { Text("Music") },
        selected = false,
        onClick = onNavigateMusic,
        modifier = Modifier.fillMaxWidth(),
        colors = NavigationDrawerItemDefaults.colors(),
      )
      NavigationDrawerItem(
        label = { Text("Chat") },
        selected = false,
        onClick = onNavigateChat,
        modifier = Modifier.fillMaxWidth(),
        colors = NavigationDrawerItemDefaults.colors(),
      )
      NavigationDrawerItem(
        label = { Text("Schedule") },
        selected = false,
        onClick = onNavigateSchedule,
        modifier = Modifier.fillMaxWidth(),
        colors = NavigationDrawerItemDefaults.colors(),
      )
      NavigationDrawerItem(
        label = { Text("Account") },
        selected = false,
        onClick = onNavigateAccount,
        modifier = Modifier.fillMaxWidth(),
        colors = NavigationDrawerItemDefaults.colors(),
      )

      Spacer(modifier = Modifier.weight(1f, fill = true))

      if (isAuthenticated) {
        OutlinedButton(
          modifier = Modifier.fillMaxWidth(),
          onClick = onLogout,
          enabled = !busy,
        ) {
          Text("Log Out")
        }
      } else {
        Button(
          modifier = Modifier.fillMaxWidth(),
          onClick = onSignUp,
          enabled = !busy,
        ) {
          Text("Sign Up")
        }
        OutlinedButton(
          modifier = Modifier.fillMaxWidth(),
          onClick = onSignIn,
          enabled = !busy,
        ) {
          Text("Log In")
        }
      }

      Spacer(modifier = Modifier.height(4.dp))
    }
  }
}
