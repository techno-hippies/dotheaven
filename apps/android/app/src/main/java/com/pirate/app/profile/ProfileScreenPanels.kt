package com.pirate.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import coil.compose.AsyncImage
import com.pirate.app.music.OnChainPlaylist
import com.pirate.app.music.OnChainPlaylistsApi
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.VerifiedSealBadge
import com.pirate.app.util.resolveAvatarUrl
import com.pirate.app.util.shortAddress
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SettingsSheet(
  ethAddress: String,
  onDismiss: () -> Unit,
  onLogout: () -> Unit,
) {
  val clipboardManager = LocalClipboardManager.current
  val scope = rememberCoroutineScope()
  var copied by remember { mutableStateOf(false) }
  val sheetState = rememberModalBottomSheetState()

  ModalBottomSheet(
    onDismissRequest = onDismiss,
    sheetState = sheetState,
    containerColor = Color(0xFF1C1C1C),
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 32.dp),
    ) {
      Text("Settings", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
      Spacer(Modifier.height(24.dp))

      Text("Wallet Address", style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
      Spacer(Modifier.height(8.dp))
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .background(Color(0xFF262626), RoundedCornerShape(12.dp))
          .clickable {
            clipboardManager.setText(AnnotatedString(ethAddress))
            copied = true
            scope.launch {
              kotlinx.coroutines.delay(2000)
              copied = false
            }
          }
          .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(
          ethAddress,
          modifier = Modifier.weight(1f),
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onBackground,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(8.dp))
        Icon(
          Icons.Rounded.ContentCopy,
          contentDescription = "Copy",
          modifier = Modifier.size(20.dp),
          tint = if (copied) Color(0xFFA6E3A1) else PiratePalette.TextMuted,
        )
      }
      if (copied) {
        Spacer(Modifier.height(4.dp))
        Text("Copied!", style = MaterialTheme.typography.bodySmall, color = Color(0xFFA6E3A1))
      }

      Spacer(Modifier.height(24.dp))
      HorizontalDivider(color = Color(0xFF363636))
      Spacer(Modifier.height(16.dp))

      Text("App", style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
      Spacer(Modifier.height(8.dp))
      Text("Version 0.1.0", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onBackground)

      Spacer(Modifier.height(24.dp))
      HorizontalDivider(color = Color(0xFF363636))
      Spacer(Modifier.height(16.dp))

      OutlinedButton(
        onClick = {
          onDismiss()
          onLogout()
        },
        modifier = Modifier.fillMaxWidth(),
      ) {
        Text("Sign Out", color = MaterialTheme.colorScheme.error)
      }
    }
  }
}

// ── Shared ──

@Composable
internal fun EmptyTabPanel(label: String) {
  CenteredStatus { Text("$label — coming soon", color = PiratePalette.TextMuted) }
}

@Composable
internal fun CenteredStatus(content: @Composable () -> Unit) {
  Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) { content() }
  }
}

@Composable
internal fun FollowStat(count: String, label: String, onClick: (() -> Unit)? = null) {
  Row(
    modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Text(count, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Text(label, style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
  }
}
