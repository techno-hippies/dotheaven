package com.pirate.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

private const val IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs/"

private fun resolveAvatarUrl(avatarUri: String?): String? {
  if (avatarUri.isNullOrBlank()) return null
  return if (avatarUri.startsWith("ipfs://")) {
    IPFS_GATEWAY + avatarUri.removePrefix("ipfs://")
  } else avatarUri
}

private fun shortAddr(addr: String): String {
  if (addr.length <= 14) return addr
  return "${addr.take(6)}...${addr.takeLast(4)}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PirateSideMenuDrawer(
  isAuthenticated: Boolean,
  busy: Boolean,
  ethAddress: String?,
  heavenName: String?,
  avatarUri: String?,
  onNavigateProfile: () -> Unit,
  onNavigateMusic: () -> Unit,
  onNavigateSchedule: () -> Unit,
  onNavigateChat: () -> Unit,
  onNavigatePublish: () -> Unit,
  onSignUp: () -> Unit,
  onSignIn: () -> Unit,
  onLogout: () -> Unit,
) {
  ModalDrawerSheet {
    Column(
      modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      // Header: avatar + name (clickable → profile) or branding
      if (isAuthenticated && ethAddress != null) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onNavigateProfile() }
            .padding(vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          val avatarUrl = resolveAvatarUrl(avatarUri)
          if (avatarUrl != null) {
            AsyncImage(
              model = avatarUrl,
              contentDescription = "Avatar",
              modifier = Modifier.size(40.dp).clip(CircleShape),
              contentScale = ContentScale.Crop,
            )
          } else {
            Surface(
              modifier = Modifier.size(40.dp),
              shape = CircleShape,
              color = MaterialTheme.colorScheme.primaryContainer,
            ) {
              Box(contentAlignment = Alignment.Center) {
                Text(
                  (heavenName?.take(1) ?: ethAddress.take(2).removePrefix("0x").ifEmpty { "?" }).uppercase(),
                  fontWeight = FontWeight.Bold,
                  style = MaterialTheme.typography.bodyLarge,
                )
              }
            }
          }
          Column {
            Text(
              heavenName?.let { "$it.heaven" } ?: shortAddr(ethAddress),
              fontWeight = FontWeight.Bold,
              style = MaterialTheme.typography.bodyLarge,
            )
            Text(
              "View profile",
              style = MaterialTheme.typography.bodyMedium,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
        }
      } else {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          Surface(
            modifier = Modifier.size(32.dp),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.primaryContainer,
          ) {}
          Text("Heaven", fontWeight = FontWeight.Bold)
        }
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

      if (isAuthenticated) {
        HorizontalDivider()
        NavigationDrawerItem(
          label = { Text("Publish Song") },
          selected = false,
          onClick = onNavigatePublish,
          modifier = Modifier.fillMaxWidth(),
          colors = NavigationDrawerItemDefaults.colors(),
        )
      }

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
