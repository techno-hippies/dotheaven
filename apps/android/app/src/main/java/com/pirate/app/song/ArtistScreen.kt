package com.pirate.app.song

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import com.pirate.app.util.formatTimeAgoShort
import com.pirate.app.util.shortAddress

enum class ArtistTab(val label: String) {
  Songs("Songs"),
  Leaderboard("Leaderboard"),
  Scrobbles("Scrobbles"),
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
  var recentScrobbles by remember { mutableStateOf<List<ArtistScrobbleRow>>(emptyList()) }

  LaunchedEffect(artistName, refreshKey) {
    loading = true
    loadError = null

    val tracksResult = runCatching { SongArtistApi.fetchArtistTopTracks(artistName, maxEntries = 80) }
    val listenersResult = runCatching { SongArtistApi.fetchArtistTopListeners(artistName, maxEntries = 40) }
    val scrobblesResult = runCatching { SongArtistApi.fetchArtistRecentScrobbles(artistName, maxEntries = 80) }

    topTracks = tracksResult.getOrElse { emptyList() }
    topListeners = listenersResult.getOrElse { emptyList() }
    recentScrobbles = scrobblesResult.getOrElse { emptyList() }

    if (topTracks.isEmpty() && topListeners.isEmpty() && recentScrobbles.isEmpty()) {
      loadError = tracksResult.exceptionOrNull()?.message
        ?: listenersResult.exceptionOrNull()?.message
        ?: scrobblesResult.exceptionOrNull()?.message
    }

    loading = false
  }

  val tabs = ArtistTab.entries

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = artistName,
      onBackPress = onBack,
      rightSlot = {
        OutlinedButton(onClick = { refreshKey += 1 }) {
          Text("Refresh")
        }
      },
    )

    if (loading) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
      }
      return@Column
    }

    if (!loadError.isNullOrBlank() && topTracks.isEmpty() && topListeners.isEmpty() && recentScrobbles.isEmpty()) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(loadError ?: "Failed to load", color = MaterialTheme.colorScheme.error)
          OutlinedButton(onClick = { refreshKey += 1 }) { Text("Retry") }
        }
      }
      return@Column
    }

    ArtistHeroCard(
      artistName = artistName,
      tracks = topTracks,
      listeners = topListeners,
      scrobbles = recentScrobbles,
    )

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
          text = { Text(tab.label) },
        )
      }
    }

    when (tabs[selectedTab]) {
      ArtistTab.Songs -> ArtistSongsPanel(rows = topTracks, onOpenSong = onOpenSong)
      ArtistTab.Leaderboard -> ArtistLeaderboardPanel(rows = topListeners, onOpenProfile = onOpenProfile)
      ArtistTab.Scrobbles -> ArtistScrobblesPanel(rows = recentScrobbles, onOpenSong = onOpenSong, onOpenProfile = onOpenProfile)
    }
  }
}

@Composable
private fun ArtistHeroCard(
  artistName: String,
  tracks: List<ArtistTrackRow>,
  listeners: List<ArtistListenerRow>,
  scrobbles: List<ArtistScrobbleRow>,
) {
  val totalScrobbles = tracks.sumOf { it.scrobbleCountTotal }

  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp, vertical = 8.dp),
    shape = RoundedCornerShape(16.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(14.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(
        artistName,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ArtistStatPill(label = "Tracks", value = tracks.size.toString())
        ArtistStatPill(label = "Listeners", value = listeners.size.toString())
        ArtistStatPill(label = "Scrobbles", value = totalScrobbles.toString())
      }
      Text(
        text = "Recent activity: ${scrobbles.size} scrobbles",
        style = MaterialTheme.typography.bodyMedium,
        color = PiratePalette.TextMuted,
      )
    }
  }
}

@Composable
private fun ArtistStatPill(label: String, value: String) {
  Card(
    shape = RoundedCornerShape(12.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
  ) {
    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Text(value, fontWeight = FontWeight.SemiBold)
      Text(label, style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    }
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

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    itemsIndexed(rows, key = { _, row -> row.trackId }) { idx, row ->
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .clickable { onOpenSong(row.trackId, row.title, row.artist) },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
      ) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("#${idx + 1} ${row.title}", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val subtitle = buildString {
              if (row.album.isNotBlank()) append(row.album)
              if (row.scrobbleCountVerified > 0) {
                if (isNotEmpty()) append(" • ")
                append("${row.scrobbleCountVerified} verified")
              }
            }
            if (subtitle.isNotBlank()) {
              Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
          }
          Text(row.scrobbleCountTotal.toString(), fontWeight = FontWeight.SemiBold)
        }
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

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    itemsIndexed(rows, key = { _, row -> row.userAddress }) { idx, row ->
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .clickable { onOpenProfile(row.userAddress) },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
      ) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("#${idx + 1} ${shortAddress(row.userAddress)}", fontWeight = FontWeight.SemiBold)
            Text("Last: ${formatTimeAgoShort(row.lastScrobbleAtSec)}", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
          }
          Text(row.scrobbleCount.toString(), fontWeight = FontWeight.SemiBold)
        }
      }
    }
  }
}

@Composable
private fun ArtistScrobblesPanel(
  rows: List<ArtistScrobbleRow>,
  onOpenSong: (trackId: String, title: String?, artist: String?) -> Unit,
  onOpenProfile: (String) -> Unit,
) {
  if (rows.isEmpty()) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      Text("No scrobbles yet.", color = PiratePalette.TextMuted)
    }
    return
  }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    itemsIndexed(rows, key = { idx, row -> "${row.trackId}:${row.userAddress}:${idx}" }) { _, row ->
      Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
      ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text(
            text = row.title,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clickable { onOpenSong(row.trackId, row.title, null) },
          )
          Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
              text = shortAddress(row.userAddress),
              color = PiratePalette.TextMuted,
              style = MaterialTheme.typography.bodyMedium,
              modifier = Modifier.clickable { onOpenProfile(row.userAddress) },
            )
            Text("•", color = PiratePalette.TextMuted)
            Text(formatTimeAgoShort(row.playedAtSec), color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyMedium)
          }
        }
      }
    }
  }
}
