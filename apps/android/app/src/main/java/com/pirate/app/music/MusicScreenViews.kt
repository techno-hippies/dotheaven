package com.pirate.app.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pirate.app.music.ui.TrackItemRow

@Composable
internal fun LibraryView(
  hasPermission: Boolean,
  requestPermission: () -> Unit,
  tracks: List<MusicTrack>,
  scanning: Boolean,
  error: String?,
  currentTrackId: String?,
  isPlaying: Boolean,
  onScan: () -> Unit,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  if (!hasPermission) {
    Column(
      modifier =
        Modifier
          .fillMaxSize()
          .padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Permission required to read your music library.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      Button(onClick = requestPermission) { Text("Grant Permission") }
    }
    return
  }

  Column(modifier = Modifier.fillMaxSize()) {
    FilterSortBar(
      left = "Filter: All",
      right = "Sort: Recent",
      onLeft = { /* TODO */ },
      onRight = { /* TODO */ },
    )

    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }

    if (tracks.isEmpty() && !scanning) {
      EmptyState(
        title = "No songs in your library yet",
        actionLabel = "Scan device",
        onAction = onScan,
      )
      return
    }

    if (scanning && tracks.isEmpty()) {
      EmptyState(
        title = "Scanning your device...",
        actionLabel = null,
        onAction = null,
      )
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(tracks, key = { it.id }) { t ->
        TrackItemRow(
          track = t,
          isActive = currentTrackId == t.id,
          isPlaying = currentTrackId == t.id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
internal fun SearchView(
  query: String,
  onQueryChange: (String) -> Unit,
  tracks: List<MusicTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  val focusRequester = remember { FocusRequester() }
  LaunchedEffect(Unit) { focusRequester.requestFocus() }

  val q = query.trim()
  val results =
    remember(tracks, q) {
      if (q.isBlank()) {
        tracks
      } else {
        val needle = q.lowercase()
        tracks.filter { t ->
          t.title.lowercase().contains(needle) ||
            t.artist.lowercase().contains(needle) ||
            t.album.lowercase().contains(needle)
        }
      }
    }

  Column(modifier = Modifier.fillMaxSize()) {
    OutlinedTextField(
      value = query,
      onValueChange = onQueryChange,
      modifier =
        Modifier
          .fillMaxWidth()
          .padding(horizontal = 16.dp, vertical = 10.dp)
          .focusRequester(focusRequester),
      singleLine = true,
      placeholder = { Text("Search your library") },
    )

    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(results, key = { it.id }) { t ->
        TrackItemRow(
          track = t,
          isActive = currentTrackId == t.id,
          isPlaying = currentTrackId == t.id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
internal fun FilterSortBar(
  left: String,
  right: String,
  onLeft: () -> Unit,
  onRight: () -> Unit,
) {
  Row(
    modifier =
      Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 10.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    FilterSortPill(label = left, onClick = onLeft)
    FilterSortPill(label = right, onClick = onRight)
  }
}

@Composable
internal fun FilterSortPill(
  label: String,
  onClick: () -> Unit,
) {
  Surface(
    modifier = Modifier.clickable(onClick = onClick),
    color = MaterialTheme.colorScheme.surfaceVariant,
    shape = MaterialTheme.shapes.extraLarge,
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Icon(Icons.Rounded.ArrowDropDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
internal fun EmptyState(
  title: String,
  actionLabel: String?,
  onAction: (() -> Unit)?,
) {
  Column(
    modifier =
      Modifier
        .fillMaxWidth()
        .padding(horizontal = 20.dp, vertical = 28.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text(title, color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold)
    if (!actionLabel.isNullOrBlank() && onAction != null) {
      OutlinedButton(onClick = onAction) {
        Icon(Icons.Rounded.FolderOpen, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.width(8.dp))
        Text(actionLabel, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
      }
    }
  }
}
