package com.pirate.app.song

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.music.CoverRef
import com.pirate.app.theme.PiratePalette
import com.pirate.app.util.formatTimeAgoShort
import com.pirate.app.util.shortAddress
import java.util.Locale

private enum class ArtistTab(val icon: ImageVector, val contentDescription: String) {
  Songs(Icons.Rounded.MusicNote, "Songs"),
  Leaderboard(Icons.Rounded.EmojiEvents, "Leaderboard"),
}

@Composable
fun ArtistScreen(
  artistName: String,
  onBack: () -> Unit,
  onOpenSong: (trackId: String, title: String?, artist: String?) -> Unit,
  onOpenProfile: (String) -> Unit,
) {
  var selectedTab by remember { mutableIntStateOf(0) }
  var refreshKey by remember { mutableIntStateOf(0) }

  var loading by remember { mutableStateOf(true) }
  var loadError by remember { mutableStateOf<String?>(null) }
  var topTracks by remember { mutableStateOf<List<ArtistTrackRow>>(emptyList()) }
  var topListeners by remember { mutableStateOf<List<ArtistListenerRow>>(emptyList()) }

  LaunchedEffect(artistName, refreshKey) {
    loading = true
    loadError = null
    val tracksResult = runCatching { SongArtistApi.fetchArtistTopTracks(artistName, maxEntries = 80) }
    val listenersResult = runCatching { SongArtistApi.fetchArtistTopListeners(artistName, maxEntries = 40) }
    topTracks = tracksResult.getOrElse { emptyList() }
    topListeners = listenersResult.getOrElse { emptyList() }
    if (topTracks.isEmpty() && topListeners.isEmpty()) {
      loadError = tracksResult.exceptionOrNull()?.message
        ?: listenersResult.exceptionOrNull()?.message
        ?: loadError
    }
    loading = false
  }

  val tabs = ArtistTab.entries

  if (loading) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      CircularProgressIndicator()
    }
    return
  }

  if (!loadError.isNullOrBlank() && topTracks.isEmpty() && topListeners.isEmpty()) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(loadError ?: "Failed to load", color = MaterialTheme.colorScheme.error)
        OutlinedButton(onClick = { refreshKey += 1 }) { Text("Retry") }
      }
    }
    return
  }

  val coverUrl = CoverRef.resolveCoverUrl(
    ref = topTracks.firstOrNull()?.coverCid,
    width = 800, height = 800, format = "webp", quality = 85,
  )
  val totalScrobbles = topTracks.sumOf { it.scrobbleCountTotal }

  Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    // ── Hero: full-width square image, artist name bottom-left, back button top-left ──
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .aspectRatio(1f),
    ) {
      // Image or fallback
      if (!coverUrl.isNullOrBlank()) {
        AsyncImage(
          model = coverUrl,
          contentDescription = "Artist cover",
          modifier = Modifier.fillMaxSize(),
          contentScale = ContentScale.Crop,
        )
      } else {
        Box(
          modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
          contentAlignment = Alignment.Center,
        ) {
          Text(
            artistName.take(1).uppercase(Locale.US),
            style = MaterialTheme.typography.displayLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }

      // Gradient scrim for text legibility
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(160.dp)
          .align(Alignment.BottomStart)
          .background(
            Brush.verticalGradient(
              colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f)),
            ),
          ),
      )

      // Back button — top-left with status bar padding
      IconButton(
        onClick = onBack,
        modifier = Modifier
          .align(Alignment.TopStart)
          .statusBarsPadding()
          .padding(4.dp),
      ) {
        Icon(
          Icons.AutoMirrored.Rounded.ArrowBack,
          contentDescription = "Back",
          tint = Color.White,
          modifier = Modifier.size(26.dp),
        )
      }

      // Artist name + listener count — bottom-left
      Column(
        modifier = Modifier
          .align(Alignment.BottomStart)
          .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
      ) {
        Text(
          primaryArtist(artistName),
          style = MaterialTheme.typography.headlineMedium,
          fontWeight = FontWeight.Bold,
          color = Color.White,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
        if (topListeners.isNotEmpty()) {
          Text(
            "${topListeners.size} monthly listeners",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.8f),
          )
        }
      }
    }

    // ── Stats row ──
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 20.dp, vertical = 14.dp),
      horizontalArrangement = Arrangement.spacedBy(28.dp),
    ) {
      ArtistStatColumn("${topListeners.size}", "listeners")
      ArtistStatColumn("$totalScrobbles", "scrobbles")
    }

    // ── Icon tab row ──
    TabRow(
      selectedTabIndex = selectedTab,
      containerColor = MaterialTheme.colorScheme.background,
      contentColor = MaterialTheme.colorScheme.onBackground,
      divider = { HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant) },
      indicator = { tabPositions ->
        TabRowDefaults.SecondaryIndicator(
          modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
          color = MaterialTheme.colorScheme.primary,
        )
      },
    ) {
      tabs.forEachIndexed { idx, tab ->
        Tab(
          selected = idx == selectedTab,
          onClick = { selectedTab = idx },
          icon = {
            Icon(
              imageVector = tab.icon,
              contentDescription = tab.contentDescription,
              modifier = Modifier.size(26.dp),
              tint = if (idx == selectedTab) Color.White else Color(0xFFA3A3A3),
            )
          },
        )
      }
    }

    when (tabs[selectedTab]) {
      ArtistTab.Songs -> ArtistSongsPanel(rows = topTracks, onOpenSong = onOpenSong)
      ArtistTab.Leaderboard -> ArtistLeaderboardPanel(rows = topListeners, onOpenProfile = onOpenProfile)
    }
  }
}

@Composable
private fun ArtistStatColumn(value: String, label: String) {
  Column {
    Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Text(label, style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
  }
}

@Composable
private fun ArtistSongsPanel(
  rows: List<ArtistTrackRow>,
  onOpenSong: (trackId: String, title: String?, artist: String?) -> Unit,
) {
  if (rows.isEmpty()) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      Text("No songs found.", color = PiratePalette.TextMuted)
    }
    return
  }

  LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 20.dp)) {
    itemsIndexed(rows, key = { _, row -> row.trackId }) { idx, row ->
      val coverUrl = CoverRef.resolveCoverUrl(ref = row.coverCid, width = 96, height = 96, format = "webp", quality = 80)
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .height(72.dp)
          .clickable { onOpenSong(row.trackId, row.title, row.artist) }
          .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Text(
          "#${idx + 1}",
          style = MaterialTheme.typography.bodyLarge,
          color = PiratePalette.TextMuted,
          modifier = Modifier.width(32.dp),
        )
        Box(
          modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
          contentAlignment = Alignment.Center,
        ) {
          if (!coverUrl.isNullOrBlank()) {
            AsyncImage(model = coverUrl, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
          } else {
            Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(20.dp))
          }
        }
        Column(modifier = Modifier.weight(1f)) {
          Text(row.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground)
          if (row.album.isNotBlank()) {
            Text(row.album, style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
        }
        Text(row.scrobbleCountTotal.toString(), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
      }
    }
  }
}

@Composable
private fun ArtistLeaderboardPanel(
  rows: List<ArtistListenerRow>,
  onOpenProfile: (String) -> Unit,
) {
  if (rows.isEmpty()) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      Text("No leaderboard entries yet.", color = PiratePalette.TextMuted)
    }
    return
  }

  LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 20.dp)) {
    itemsIndexed(rows, key = { _, row -> row.userAddress }) { idx, row ->
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .height(64.dp)
          .clickable { onOpenProfile(row.userAddress) }
          .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Text("#${idx + 1}", style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted, modifier = Modifier.width(32.dp))
        Surface(modifier = Modifier.size(40.dp), shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant) {
          Box(contentAlignment = Alignment.Center) {
            Text(shortAddress(row.userAddress).take(2), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
          }
        }
        Column(modifier = Modifier.weight(1f)) {
          Text(shortAddress(row.userAddress), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onBackground, maxLines = 1, overflow = TextOverflow.Ellipsis)
          Text(formatTimeAgoShort(row.lastScrobbleAtSec), style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
        }
        Text(row.scrobbleCount.toString(), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
      }
    }
  }
}
