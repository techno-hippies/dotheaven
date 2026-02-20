package com.pirate.app.song

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.music.CoverRef
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import com.pirate.app.util.formatTimeAgoShort
import com.pirate.app.util.shortAddress
import java.util.Locale
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
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

  var refreshKey by remember { mutableIntStateOf(0) }
  var refreshMenuExpanded by remember { mutableStateOf(false) }

  var loading by remember { mutableStateOf(true) }
  var loadError by remember { mutableStateOf<String?>(null) }
  var stats by remember { mutableStateOf<SongStats?>(null) }
  var listeners by remember { mutableStateOf<List<SongListenerRow>>(emptyList()) }

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

    stats = statsResult.getOrNull()
    listeners = listenersResult.getOrElse { emptyList() }

    loadError = when {
      statsResult.isFailure && listenersResult.isFailure -> {
        statsResult.exceptionOrNull()?.message
          ?: listenersResult.exceptionOrNull()?.message
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

  val effectiveTitle = stats?.title?.ifBlank { null } ?: initialTitle?.ifBlank { null } ?: "Song"
  val effectiveArtist = stats?.artist?.ifBlank { null } ?: initialArtist?.ifBlank { null }

  // Artist-picker sheet: shown when artist string contains multiple artists
  var artistPickerOpen by remember { mutableStateOf(false) }

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "",
      onBackPress = onBack,
      rightSlot = {
        Box {
          IconButton(onClick = { refreshMenuExpanded = true }) {
            Icon(Icons.Rounded.MoreVert, contentDescription = "More")
          }
          DropdownMenu(
            expanded = refreshMenuExpanded,
            onDismissRequest = { refreshMenuExpanded = false },
          ) {
            DropdownMenuItem(
              text = { Text("Refresh") },
              onClick = {
                refreshMenuExpanded = false
                refresh()
              },
            )
          }
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

    SongTopSection(
      title = effectiveTitle,
      artist = effectiveArtist,
      coverCid = stats?.coverCid,
      scrobbleCountTotal = stats?.scrobbleCountTotal ?: 0L,
      onArtistClick = {
        val artistName = effectiveArtist.orEmpty()
        if (artistName.isBlank()) return@SongTopSection
        val artists = parseAllArtists(artistName)
        if (artists.size > 1) {
          artistPickerOpen = true
        } else {
          onOpenArtist(primaryArtist(artistName).ifBlank { artistName })
        }
      },
      isAuthenticated = isAuthenticated,
      statusLoading = studyStatusLoading,
      studyStatus = studyStatus,
      generateBusy = generateBusy,
      onGenerate = {
        if (!isAuthenticated || userAddress.isNullOrBlank()) {
          onShowMessage("Sign in to generate exercises")
          return@SongTopSection
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
              onShowMessage(result.error ?: "Generation failed")
            }
            refresh()
          }.onFailure { err ->
            onShowMessage("Generate failed: ${err.message ?: "unknown error"}")
          }
          generateBusy = false
        }
      },
      studySetRef = studyStatus?.studySetRef,
    )

    SongLeaderboardPanel(rows = listeners, onOpenProfile = onOpenProfile)
  }

  // Artist-picker bottom sheet for compound artist strings
  if (artistPickerOpen) {
    val artists = parseAllArtists(effectiveArtist.orEmpty())
    ModalBottomSheet(
      onDismissRequest = { artistPickerOpen = false },
      containerColor = androidx.compose.ui.graphics.Color(0xFF1C1C1C),
    ) {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 24.dp)
          .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
      ) {
        Text(
          "Go to Artist",
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.SemiBold,
          color = MaterialTheme.colorScheme.onBackground,
          modifier = Modifier.padding(bottom = 8.dp),
        )
        artists.forEach { artist ->
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .clickable {
                artistPickerOpen = false
                onOpenArtist(artist)
              }
              .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            Surface(
              modifier = Modifier.size(40.dp),
              shape = CircleShape,
              color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
              Box(contentAlignment = Alignment.Center) {
                Text(
                  artist.take(1).uppercase(),
                  style = MaterialTheme.typography.bodyLarge,
                  fontWeight = FontWeight.SemiBold,
                )
              }
            }
            Text(artist, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onBackground)
          }
        }
      }
    }
  }
}

@Composable
private fun SongTopSection(
  title: String,
  artist: String?,
  coverCid: String?,
  scrobbleCountTotal: Long,
  onArtistClick: () -> Unit,
  isAuthenticated: Boolean,
  statusLoading: Boolean,
  studyStatus: StudySetStatus?,
  generateBusy: Boolean,
  onGenerate: () -> Unit,
  studySetRef: String?,
) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(top = 4.dp),
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    SongRow(
      title = title,
      artist = artist,
      coverCid = coverCid,
      scrobbleCount = scrobbleCountTotal,
      onArtistClick = onArtistClick,
    )

    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp)
        .padding(top = 4.dp, bottom = 10.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      val statusText = when {
        statusLoading -> "Checking exercise status..."
        studyStatus?.ready == true && !studySetRef.isNullOrBlank() -> "Exercises ready"
        studyStatus?.errorCode == "study_set_not_found" || studyStatus?.errorCode == "not_found" -> "Exercises not generated yet"
        studyStatus?.error != null -> "Status: ${studyStatus.error}"
        else -> "Exercises not generated yet"
      }
      Text(statusText, color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyMedium)

      Button(
        onClick = onGenerate,
        modifier = Modifier.fillMaxWidth(),
        enabled = isAuthenticated && !generateBusy,
      ) {
        Text(if (generateBusy) "Generating..." else "Unlock Exercises (1 credit)")
      }
    }
  }
}

@Composable
private fun SongRow(
  title: String,
  artist: String?,
  coverCid: String?,
  scrobbleCount: Long,
  onArtistClick: () -> Unit,
) {
  val coverUrl = CoverRef.resolveCoverUrl(ref = coverCid, width = 96, height = 96, format = null, quality = null)
  val artistClickable = !artist.isNullOrBlank()
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .padding(horizontal = 16.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      modifier = Modifier
        .size(48.dp)
        .clip(RoundedCornerShape(8.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant),
      contentAlignment = Alignment.Center,
    ) {
      if (!coverUrl.isNullOrBlank()) {
        AsyncImage(
          model = coverUrl,
          contentDescription = "Song cover",
          contentScale = ContentScale.Crop,
          modifier = Modifier.fillMaxSize(),
        )
      } else {
        Icon(
          imageVector = Icons.Rounded.MusicNote,
          contentDescription = null,
          tint = PiratePalette.TextMuted,
          modifier = Modifier.size(20.dp),
        )
      }
    }

    Column(
      modifier = Modifier.weight(1f),
      verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
      Text(
        title,
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        color = MaterialTheme.colorScheme.onBackground,
      )
      if (!artist.isNullOrBlank()) {
        Text(
          artist,
          style = MaterialTheme.typography.bodyLarge,
          color = PiratePalette.TextMuted,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.clickable(enabled = artistClickable, onClick = onArtistClick),
        )
      }
    }

    Column(horizontalAlignment = Alignment.End) {
      Text(scrobbleCount.toString(), fontWeight = FontWeight.SemiBold)
      Text("scrobbles", color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodySmall)
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
    contentPadding = PaddingValues(bottom = 20.dp),
  ) {
    item {
      Text(
        text = "Leaderboard",
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = PiratePalette.TextMuted,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
      )
    }
    itemsIndexed(rows, key = { _, row -> row.userAddress }) { idx, row ->
      SongLeaderboardRow(
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
private fun SongLeaderboardRow(
  rank: Int,
  address: String,
  count: Long,
  lastAtSec: Long,
  onOpenProfile: (String) -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable { onOpenProfile(address) }
      .padding(horizontal = 16.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      modifier = Modifier
        .size(32.dp)
        .clip(RoundedCornerShape(16.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant),
      contentAlignment = Alignment.Center,
    ) {
      Text(rank.toString(), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(shortAddress(address), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
      Text(
        "Last: ${formatTimeAgoShort(lastAtSec)}",
        style = MaterialTheme.typography.bodyMedium,
        color = PiratePalette.TextMuted,
      )
    }
    Text(count.toString(), fontWeight = FontWeight.SemiBold)
  }
}
