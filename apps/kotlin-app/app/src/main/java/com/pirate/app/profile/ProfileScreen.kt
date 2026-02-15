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
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.music.OnChainPlaylist
import com.pirate.app.music.OnChainPlaylistsApi
import com.pirate.app.theme.PiratePalette

private val BannerGradient = Brush.verticalGradient(
  colors = listOf(Color(0xFF2D1B4E), Color(0xFF1A1040), Color(0xFF171717)),
)

private enum class ProfileTab(val label: String) {
  Music("Music"),
  Scrobbles("Scrobbles"),
  Schedule("Schedule"),
  About("About"),
}

@Composable
fun ProfileScreen(
  ethAddress: String?,
  isAuthenticated: Boolean,
  busy: Boolean,
  onRegister: () -> Unit,
  onLogin: () -> Unit,
) {
  if (!isAuthenticated || ethAddress.isNullOrBlank()) {
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

  var selectedTab by remember { mutableIntStateOf(1) } // default to Scrobbles
  val tabs = ProfileTab.entries

  // Scrobble state
  var scrobbles by remember { mutableStateOf<List<ScrobbleRow>>(emptyList()) }
  var scrobblesLoading by remember { mutableStateOf(true) }
  var scrobblesError by remember { mutableStateOf<String?>(null) }

  // Playlist state (for Music tab)
  var playlists by remember { mutableStateOf<List<OnChainPlaylist>>(emptyList()) }
  var playlistsLoading by remember { mutableStateOf(true) }

  // Fetch scrobbles
  LaunchedEffect(ethAddress) {
    scrobblesLoading = true
    scrobblesError = null
    runCatching { ProfileScrobbleApi.fetchScrobbles(ethAddress) }
      .onSuccess { scrobbles = it; scrobblesLoading = false }
      .onFailure { scrobblesError = it.message; scrobblesLoading = false }
  }

  // Fetch playlists
  LaunchedEffect(ethAddress) {
    playlistsLoading = true
    runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ethAddress) }
      .onSuccess { playlists = it; playlistsLoading = false }
      .onFailure { playlistsLoading = false }
  }

  Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    // Banner + identity
    Box(modifier = Modifier.fillMaxWidth().height(180.dp)) {
      Box(modifier = Modifier.fillMaxSize().background(BannerGradient))

      // Avatar + address
      Row(
        modifier = Modifier.align(Alignment.BottomStart).statusBarsPadding().padding(start = 20.dp, bottom = 16.dp),
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
        Text(
          shortAddr(ethAddress),
          style = MaterialTheme.typography.titleLarge,
          fontWeight = FontWeight.Bold,
          color = Color.White,
        )
      }
    }

    // Bio
    Text(
      "Jazz vocalist & guitarist. Exploring decentralized music and building the future of listening.",
      modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
      style = MaterialTheme.typography.bodyLarge,
      color = Color(0xFFD4D4D4),
    )

    // Follower stats
    Row(
      modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      FollowStat("248", "followers")
      FollowStat("89", "following")
    }

    // Tab row
    TabRow(
      selectedTabIndex = selectedTab,
      containerColor = Color(0xFF1C1C1C),
      contentColor = Color.White,
      indicator = { tabPositions ->
        if (selectedTab < tabPositions.size) {
          TabRowDefaults.SecondaryIndicator(
            modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
            color = MaterialTheme.colorScheme.primary,
          )
        }
      },
      divider = { HorizontalDivider(color = Color(0xFF363636)) },
    ) {
      tabs.forEachIndexed { index, tab ->
        Tab(
          selected = selectedTab == index,
          onClick = { selectedTab = index },
          text = {
            Text(
              tab.label,
              fontWeight = if (selectedTab == index) FontWeight.SemiBold else FontWeight.Normal,
              color = if (selectedTab == index) Color.White else Color(0xFFA3A3A3),
              maxLines = 1,
            )
          },
        )
      }
    }

    // Tab content
    when (tabs[selectedTab]) {
      ProfileTab.Music -> PlaylistsPanel(playlists, playlistsLoading)
      ProfileTab.Scrobbles -> ScrobblesPanel(scrobbles, scrobblesLoading, scrobblesError) {
        scrobblesLoading = true
        scrobblesError = null
      }
      ProfileTab.Schedule -> EmptyTabPanel("Schedule")
      ProfileTab.About -> AboutPanel(ethAddress)
    }
  }

  // Handle retry
  if (scrobblesLoading && scrobblesError == null && scrobbles.isEmpty()) {
    LaunchedEffect(scrobblesLoading) {
      runCatching { ProfileScrobbleApi.fetchScrobbles(ethAddress) }
        .onSuccess { scrobbles = it; scrobblesLoading = false }
        .onFailure { scrobblesError = it.message; scrobblesLoading = false }
    }
  }
}

// ── Scrobbles ──

@Composable
private fun ScrobblesPanel(
  scrobbles: List<ScrobbleRow>,
  loading: Boolean,
  error: String?,
  onRetry: () -> Unit,
) {
  when {
    loading -> CenteredStatus { CircularProgressIndicator(Modifier.size(32.dp)); Spacer(Modifier.height(12.dp)); Text("Loading scrobbles...", color = PiratePalette.TextMuted) }
    error != null -> CenteredStatus { Text(error, color = MaterialTheme.colorScheme.error); Spacer(Modifier.height(8.dp)); TextButton(onClick = onRetry) { Text("Retry") } }
    scrobbles.isEmpty() -> CenteredStatus { Text("No scrobbles yet.", color = PiratePalette.TextMuted) }
    else -> {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
          Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text("#", modifier = Modifier.width(36.dp), color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
            Text("TRACK", modifier = Modifier.weight(1f), color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
            Text("PLAYED", modifier = Modifier.width(80.dp), color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
          }
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        itemsIndexed(scrobbles, key = { i, s -> "${s.playedAtSec}:${s.trackId ?: i}" }) { index, scrobble ->
          ScrobbleRowItem(index + 1, scrobble)
        }
      }
    }
  }
}

@Composable
private fun ScrobbleRowItem(index: Int, scrobble: ScrobbleRow) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text("$index", modifier = Modifier.width(36.dp), color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyMedium)

    if (scrobble.coverCid != null) {
      AsyncImage(
        model = ProfileScrobbleApi.coverUrl(scrobble.coverCid),
        contentDescription = null,
        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(6.dp)),
        contentScale = ContentScale.Crop,
      )
    } else {
      Surface(modifier = Modifier.size(44.dp), shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.MusicNote, "Cover", modifier = Modifier.size(24.dp), tint = PiratePalette.TextMuted) }
      }
    }

    Spacer(Modifier.width(12.dp))

    Column(modifier = Modifier.weight(1f)) {
      Text(scrobble.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground)
      Text(scrobble.artist, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = PiratePalette.TextMuted)
    }

    Text(scrobble.playedAgo, modifier = Modifier.width(80.dp), style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted, maxLines = 1)
  }
}

// ── Playlists (Music tab) ──

@Composable
private fun PlaylistsPanel(playlists: List<OnChainPlaylist>, loading: Boolean) {
  when {
    loading -> CenteredStatus { CircularProgressIndicator(Modifier.size(32.dp)); Spacer(Modifier.height(12.dp)); Text("Loading playlists...", color = PiratePalette.TextMuted) }
    playlists.isEmpty() -> CenteredStatus { Text("No playlists yet.", color = PiratePalette.TextMuted) }
    else -> {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
          Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("PLAYLISTS", color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
            Text("${playlists.size}", color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
          }
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        itemsIndexed(playlists, key = { _, p -> p.id }) { _, playlist ->
          PlaylistRowItem(playlist)
        }
      }
    }
  }
}

@Composable
private fun PlaylistRowItem(playlist: OnChainPlaylist) {
  Row(
    modifier = Modifier.fillMaxWidth().clickable { }.padding(horizontal = 16.dp, vertical = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (playlist.coverCid.isNotBlank()) {
      AsyncImage(model = ProfileScrobbleApi.coverUrl(playlist.coverCid, 96), contentDescription = null, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
    } else {
      Surface(modifier = Modifier.size(48.dp), shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.QueueMusic, "Playlist", modifier = Modifier.size(24.dp), tint = PiratePalette.TextMuted) }
      }
    }
    Spacer(Modifier.width(12.dp))
    Column(modifier = Modifier.weight(1f)) {
      Text(playlist.name.ifBlank { "Untitled" }, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground)
      Text("${playlist.trackCount} track${if (playlist.trackCount != 1) "s" else ""}", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    }
  }
}

// ── About tab ──

@Composable
private fun AboutPanel(ethAddress: String) {
  Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Pirate", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Text("Version 0.1.0", style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
    Text(
      "Decentralized music player with on-chain scrobbling, encrypted storage, and peer-to-peer messaging.",
      style = MaterialTheme.typography.bodyLarge,
      color = MaterialTheme.colorScheme.onBackground,
    )
    Spacer(Modifier.height(8.dp))
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    Spacer(Modifier.height(4.dp))
    Text("Address", style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
    Text(ethAddress, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
  }
}

// ── Shared ──

@Composable
private fun EmptyTabPanel(label: String) {
  CenteredStatus { Text("$label — coming soon", color = PiratePalette.TextMuted) }
}

@Composable
private fun CenteredStatus(content: @Composable () -> Unit) {
  Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) { content() }
  }
}

@Composable
private fun FollowStat(count: String, label: String) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    Text(count, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Text(label, style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
  }
}

private fun shortAddr(addr: String): String {
  if (addr.length <= 14) return addr
  return "${addr.take(6)}...${addr.takeLast(4)}"
}
