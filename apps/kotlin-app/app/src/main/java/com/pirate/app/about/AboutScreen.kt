package com.pirate.app.about

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pirate.app.theme.PiratePalette

private val BannerGradient = Brush.verticalGradient(
  colors = listOf(Color(0xFF2D1B4E), Color(0xFF1A1040), Color(0xFF171717)),
)

@Composable
fun AboutScreen(
  isAuthenticated: Boolean,
  ethAddress: String?,
  busy: Boolean,
  onRegister: () -> Unit,
  onLogin: () -> Unit,
  onLogout: () -> Unit,
  onOpenDrawer: () -> Unit,
) {
  if (!isAuthenticated || ethAddress.isNullOrBlank()) {
    // Not signed in
    Column(
      modifier = Modifier.fillMaxSize().statusBarsPadding().padding(32.dp),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text("Sign in to view your profile", color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyLarge)
      Spacer(Modifier.height(24.dp))
      Button(onClick = onRegister, enabled = !busy, modifier = Modifier.fillMaxWidth(0.6f)) {
        Text("Sign Up")
      }
      Spacer(Modifier.height(12.dp))
      OutlinedButton(onClick = onLogin, enabled = !busy, modifier = Modifier.fillMaxWidth(0.6f)) {
        Text("Sign In")
      }
      if (busy) {
        Spacer(Modifier.height(16.dp))
        CircularProgressIndicator(modifier = Modifier.size(24.dp))
      }
    }
    return
  }

  Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    // Banner
    Box(modifier = Modifier.fillMaxWidth().height(180.dp)) {
      Box(modifier = Modifier.fillMaxSize().background(BannerGradient))

      // Sign out top-right
      Row(
        modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp),
      ) {
        TextButton(onClick = onLogout) {
          Text("Sign Out", color = Color.White.copy(alpha = 0.8f))
        }
      }

      // Avatar + address at bottom
      Row(
        modifier = Modifier.align(Alignment.BottomStart).padding(start = 20.dp, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Surface(
          modifier = Modifier.size(72.dp),
          shape = CircleShape,
          color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
          Box(contentAlignment = Alignment.Center) {
            Text("P", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
          }
        }
        Spacer(Modifier.width(16.dp))
        Column {
          Text(
            shortAddr(ethAddress),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = Color.White,
          )
        }
      }
    }

    // Info
    Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("Pirate", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
      Text("Version 0.1.0", style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
      Text(
        "Decentralized music player with on-chain scrobbling, encrypted storage, and peer-to-peer messaging.",
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onBackground,
      )
    }
  }
}

private fun shortAddr(addr: String): String {
  if (addr.length <= 14) return addr
  return "${addr.take(6)}...${addr.takeLast(4)}"
}
