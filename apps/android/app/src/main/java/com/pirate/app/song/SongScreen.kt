package com.pirate.app.song

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.rememberCoroutineScope
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
import java.util.Locale
import kotlinx.coroutines.launch

enum class SongTab(val label: String) {
  Overview("Overview"),
  Leaderboard("Leaderboard"),
  Scrobbles("Scrobbles"),
}

@Composable
fun SongScreen(
  trackId: String,
  initialTitle: String? = null,
  initialArtist: String? = null,
  isAuthenticated: Boolean,
  userAddress: String?,
  onBack: () -> Unit,
  onOpenArtist: (String) -> Unit,
  onOpenProfile: (String) -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val scope = rememberCoroutineScope()

  var selectedTab by remember { mutableIntStateOf(0) }
  var refreshKey by remember { mutableIntStateOf(0) }

  var loading by remember { mutableStateOf(true) }
  var loadError by remember { mutableStateOf<String?>(null) }
  var stats by remember { mutableStateOf<SongStats?>(null) }
  var listeners by remember { mutableStateOf<List<SongListenerRow>>(emptyList()) }
  var recentScrobbles by remember { mutableStateOf<List<SongScrobbleRow>>(emptyList()) }

  val learnerLanguage = remember { Locale.getDefault().language.ifBlank { "en" } }
  var studyStatusLoading by remember { mutableStateOf(true) }
  var studyStatus by remember { mutableStateOf<StudySetStatus?>(null) }
  var generateBusy by remember { mutableStateOf(false) }

  fun refresh() {
    refreshKey += 1
  }

  LaunchedEffect(trackId, refreshKey) {
    loading = true
    loadError = null

    val statsResult = runCatching { SongArtistApi.fetchSongStats(trackId) }
    val listenersResult = runCatching { SongArtistApi.fetchSongTopListeners(trackId, maxEntries = 40) }
    val scrobblesResult = runCatching { SongArtistApi.fetchSongRecentScrobbles(trackId, maxEntries = 80) }

    stats = statsResult.getOrNull()
    listeners = listenersResult.getOrElse { emptyList() }
    recentScrobbles = scrobblesResult.getOrElse { emptyList() }

    loadError = when {
      statsResult.isFailure && listenersResult.isFailure && scrobblesResult.isFailure -> {
        statsResult.exceptionOrNull()?.message
          ?: listenersResult.exceptionOrNull()?.message
          ?: scrobblesResult.exceptionOrNull()?.message
          ?: "Failed to load song"
      }
      stats == null -> "Song not found"
      else -> null
    }

    loading = false
  }

  LaunchedEffect(trackId, learnerLanguage, refreshKey) {
    studyStatusLoading = true
    studyStatus = runCatching {
      SongArtistApi.fetchStudySetStatus(trackId = trackId, language = learnerLanguage)
    }.getOrElse {
      StudySetStatus(
        ready = false,
        studySetRef = null,
        studySetHash = null,
        errorCode = "status_failed",
        error = it.message ?: "Status unavailable",
      )
    }
    studyStatusLoading = false
  }

  val tabs = SongTab.entries
  val effectiveTitle = stats?.title?.ifBlank { null } ?: initialTitle?.ifBlank { null } ?: "Song"
  val effectiveArtist = stats?.artist?.ifBlank { null } ?: initialArtist?.ifBlank { null }

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = effectiveTitle,
      onBackPress = onBack,
      rightSlot = {
        OutlinedButton(onClick = { refresh() }) {
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

    if (!loadError.isNullOrBlank()) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(loadError ?: "Failed to load", color = MaterialTheme.colorScheme.error)
          OutlinedButton(onClick = { refresh() }) { Text("Retry") }
        }
      }
      return@Column
    }

    SongHeroCard(
      title = effectiveTitle,
      artist = effectiveArtist,
      scrobbleCountTotal = stats?.scrobbleCountTotal ?: 0L,
      scrobbleCountVerified = stats?.scrobbleCountVerified ?: 0L,
      onArtistClick = {
        val artistName = effectiveArtist.orEmpty()
        if (artistName.isNotBlank()) onOpenArtist(artistName)
      },
      isAuthenticated = isAuthenticated,
      statusLoading = studyStatusLoading,
      studyStatus = studyStatus,
      learnerLanguage = learnerLanguage,
      generateBusy = generateBusy,
      onGenerate = {
        if (!isAuthenticated || userAddress.isNullOrBlank()) {
          onShowMessage("Sign in to generate exercises")
          return@SongHeroCard
        }
        scope.launch {
          generateBusy = true
          runCatching {
            SongArtistApi.generateStudySet(
              trackId = trackId,
              language = learnerLanguage,
              userAddress = userAddress,
            )
          }.onSuccess { result ->
            if (result.success) {
              onShowMessage(
                if (result.cached) "Study set already available"
                else "Study set generated",
              )
            } else {
              val message = result.error ?: "Generation failed"
              onShowMessage(message)
            }
            refresh()
          }.onFailure { err ->
            onShowMessage("Generate failed: ${err.message ?: "unknown error"}")
          }
          generateBusy = false
        }
      },
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
      SongTab.Overview -> SongOverviewPanel(stats = stats, listeners = listeners, recentScrobbles = recentScrobbles, onOpenProfile = onOpenProfile)
      SongTab.Leaderboard -> SongLeaderboardPanel(rows = listeners, onOpenProfile = onOpenProfile)
      SongTab.Scrobbles -> SongScrobblesPanel(rows = recentScrobbles, onOpenProfile = onOpenProfile)
    }
  }
}

@Composable
private fun SongHeroCard(
  title: String,
  artist: String?,
  scrobbleCountTotal: Long,
  scrobbleCountVerified: Long,
  onArtistClick: () -> Unit,
  isAuthenticated: Boolean,
  statusLoading: Boolean,
  studyStatus: StudySetStatus?,
  learnerLanguage: String,
  generateBusy: Boolean,
  onGenerate: () -> Unit,
) {
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
        text = title,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (!artist.isNullOrBlank()) {
        Text(
          text = artist,
          style = MaterialTheme.typography.bodyLarge,
          color = PiratePalette.TextMuted,
          modifier = Modifier.clickable(onClick = onArtistClick),
        )
      }

      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SongStatPill(label = "Scrobbles", value = scrobbleCountTotal.toString())
        SongStatPill(label = "Verified", value = scrobbleCountVerified.toString())
      }

      HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

      if (statusLoading) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
          CircularProgressIndicator(modifier = Modifier.height(18.dp), strokeWidth = 2.dp)
          Text("Checking exercise status...", color = PiratePalette.TextMuted)
        }
      } else {
        val ready = studyStatus?.ready == true
        val statusText = when {
          ready -> "Exercises ready"
          studyStatus?.errorCode == "study_set_not_found" -> "Exercises not generated yet"
          studyStatus?.error != null -> "Status: ${studyStatus.error}"
          else -> "Exercises not generated yet"
        }
        Text(statusText, color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyMedium)
      }

      Button(
        onClick = onGenerate,
        enabled = isAuthenticated && !generateBusy,
      ) {
        Text(if (generateBusy) "Generating..." else "Unlock Exercises (1 credit)")
      }
      Text(
        text = "Language: ${learnerLanguage.lowercase(Locale.US)}",
        style = MaterialTheme.typography.bodyMedium,
        color = PiratePalette.TextMuted,
      )
    }
  }
}

@Composable
private fun SongStatPill(label: String, value: String) {
  Surface(
    shape = RoundedCornerShape(12.dp),
    color = MaterialTheme.colorScheme.surfaceVariant,
  ) {
    Column(
      modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text(value, fontWeight = FontWeight.SemiBold)
      Text(label, style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    }
  }
}

@Composable
private fun SongOverviewPanel(
  stats: SongStats?,
  listeners: List<SongListenerRow>,
  recentScrobbles: List<SongScrobbleRow>,
  onOpenProfile: (String) -> Unit,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 20.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    item {
      Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
      ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text("Track ID", style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
          Text(stats?.trackId ?: "—", style = MaterialTheme.typography.bodyMedium)
        }
      }
    }

    item {
      Text("Top Listeners", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }

    val topListeners = listeners.take(5)
    if (topListeners.isEmpty()) {
      item { Text("No listener data yet.", color = PiratePalette.TextMuted) }
    } else {
      itemsIndexed(topListeners, key = { _, row -> row.userAddress }) { idx, row ->
        ListenerRow(
          rank = idx + 1,
          address = row.userAddress,
          count = row.scrobbleCount.toLong(),
          lastAtSec = row.lastScrobbleAtSec,
          onOpenProfile = onOpenProfile,
        )
      }
    }

    item {
      Spacer(Modifier.height(8.dp))
      Text("Recent Scrobbles", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }

    val latest = recentScrobbles.take(8)
    if (latest.isEmpty()) {
      item { Text("No scrobbles yet.", color = PiratePalette.TextMuted) }
    } else {
      itemsIndexed(latest, key = { idx, row -> "${row.userAddress}:${row.playedAtSec}:$idx" }) { _, row ->
        ScrobbleRow(
          address = row.userAddress,
          playedAtSec = row.playedAtSec,
          onOpenProfile = onOpenProfile,
        )
      }
    }
  }
}

@Composable
private fun SongLeaderboardPanel(
  rows: List<SongListenerRow>,
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
      ListenerRow(
        rank = idx + 1,
        address = row.userAddress,
        count = row.scrobbleCount.toLong(),
        lastAtSec = row.lastScrobbleAtSec,
        onOpenProfile = onOpenProfile,
      )
    }
  }
}

@Composable
private fun SongScrobblesPanel(
  rows: List<SongScrobbleRow>,
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
    itemsIndexed(rows, key = { idx, row -> "${row.userAddress}:${row.playedAtSec}:$idx" }) { _, row ->
      ScrobbleRow(
        address = row.userAddress,
        playedAtSec = row.playedAtSec,
        onOpenProfile = onOpenProfile,
      )
    }
  }
}

@Composable
private fun ListenerRow(
  rank: Int,
  address: String,
  count: Long,
  lastAtSec: Long,
  onOpenProfile: (String) -> Unit,
) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onOpenProfile(address) },
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
        Text("#$rank ${shortAddress(address)}", fontWeight = FontWeight.SemiBold)
        Text("Last: ${formatTimeAgoShort(lastAtSec)}", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
      }
      Text(count.toString(), fontWeight = FontWeight.SemiBold)
    }
  }
}

@Composable
private fun ScrobbleRow(
  address: String,
  playedAtSec: Long,
  onOpenProfile: (String) -> Unit,
) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onOpenProfile(address) },
    shape = RoundedCornerShape(12.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 12.dp, vertical = 10.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(shortAddress(address), fontWeight = FontWeight.Medium)
      Text(formatTimeAgoShort(playedAtSec), color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyMedium)
    }
  }
}
