package com.pirate.app.music

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.MusicNote
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.music.ui.TrackItemRow
import com.pirate.app.theme.PiratePalette

@Composable
internal fun MusicHomeView(
  sharedPlaylistCount: Int,
  sharedTrackCount: Int,
  sharedUnreadCount: Int,
  playlistCount: Int,
  playlists: List<PlaylistDisplayItem>,
  newReleases: List<AlbumCardModel>,
  newReleasesLoading: Boolean,
  newReleasesError: String?,
  onNavigateLibrary: () -> Unit,
  onNavigateShared: () -> Unit,
  onNavigatePlaylists: () -> Unit,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
  onPlayRelease: (AlbumCardModel) -> Unit,
) {
  val sharedCount = sharedPlaylistCount + sharedTrackCount
  val sharedSubtitle =
    when {
      sharedPlaylistCount > 0 && sharedTrackCount > 0 ->
        "$sharedPlaylistCount playlist${if (sharedPlaylistCount == 1) "" else "s"} · $sharedTrackCount song${if (sharedTrackCount == 1) "" else "s"}"
      sharedPlaylistCount > 0 ->
        "$sharedPlaylistCount playlist${if (sharedPlaylistCount == 1) "" else "s"}"
      else ->
        "$sharedTrackCount song${if (sharedTrackCount == 1) "" else "s"}"
    }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 16.dp),
  ) {
    item {
      Column(modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)) {
        EntryRow(
          icon = Icons.AutoMirrored.Rounded.List,
          iconTint = MaterialTheme.colorScheme.onSecondaryContainer,
          iconBg = MaterialTheme.colorScheme.secondaryContainer,
          title = "Library",
          subtitle = "On device",
          badge = null,
          onClick = onNavigateLibrary,
        )
        EntryRow(
          icon = Icons.Rounded.Inbox,
          iconTint = MaterialTheme.colorScheme.onPrimaryContainer,
          iconBg = MaterialTheme.colorScheme.primaryContainer,
          title = "Shared With You",
          subtitle = sharedSubtitle,
          badge = if (sharedUnreadCount > 0) "$sharedUnreadCount" else null,
          onClick = onNavigateShared,
        )
        EntryRow(
          icon = Icons.AutoMirrored.Rounded.PlaylistPlay,
          iconTint = MaterialTheme.colorScheme.onTertiary,
          iconBg = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.18f),
          title = "Playlists",
          subtitle = "$playlistCount playlist${if (playlistCount == 1) "" else "s"}",
          badge = null,
          onClick = onNavigatePlaylists,
        )
      }
    }

    if (newReleasesLoading || newReleases.isNotEmpty() || !newReleasesError.isNullOrBlank()) {
      item {
        SectionHeader(title = "New Releases", action = "See all", onAction = { /* TODO */ })
        when {
          newReleasesLoading && newReleases.isEmpty() -> {
            Text(
              "Loading releases...",
              modifier = Modifier.padding(horizontal = 20.dp),
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
          !newReleasesError.isNullOrBlank() && newReleases.isEmpty() -> {
            Text(
              newReleasesError,
              modifier = Modifier.padding(horizontal = 20.dp),
              color = MaterialTheme.colorScheme.error,
            )
          }
          else -> {
            LazyRow(
              contentPadding = PaddingValues(horizontal = 20.dp),
              horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
              items(newReleases) { item ->
                val releaseAudioUrl = resolveReleaseAudioUrl(item.audioRef)
                AlbumCard(
                  title = item.title,
                  artist = item.artist,
                  imageUri = resolveReleaseCoverUrl(item.coverRef),
                  imageFallbackUri = item.coverRef,
                  onClick = if (!releaseAudioUrl.isNullOrBlank()) ({ onPlayRelease(item) }) else null,
                )
              }
            }
          }
        }
        Spacer(modifier = Modifier.height(28.dp))
      }
    }

    if (playlists.isNotEmpty()) {
      item {
        SectionHeader(title = "Your Playlists", action = "See all", onAction = onNavigatePlaylists)
        LazyRow(
          contentPadding = PaddingValues(horizontal = 20.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          items(playlists.take(6)) { pl ->
            PlaylistCard(playlist = pl, onClick = { onOpenPlaylist(pl) })
          }
        }
        Spacer(modifier = Modifier.height(12.dp))
      }
    }
  }
}

@Composable
internal fun EntryRow(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  iconTint: Color,
  iconBg: Color,
  title: String,
  subtitle: String,
  badge: String?,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      modifier = Modifier
        .size(48.dp)
        .clip(MaterialTheme.shapes.medium)
        .padding(0.dp),
      contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
      Surface(
        modifier = Modifier.fillMaxSize(),
        color = iconBg,
        shape = MaterialTheme.shapes.medium,
      ) {
        Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
          Icon(icon, contentDescription = null, tint = iconTint)
        }
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Text(title, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onBackground)
      Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }

    if (!badge.isNullOrBlank()) {
      Surface(
        color = MaterialTheme.colorScheme.primary,
        shape = MaterialTheme.shapes.extraLarge,
      ) {
        Text(
          badge,
          modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
          color = MaterialTheme.colorScheme.onPrimary,
          style = MaterialTheme.typography.labelMedium,
          fontWeight = FontWeight.SemiBold,
        )
      }
    } else {
      Icon(
        Icons.Rounded.ChevronRight,
        contentDescription = null,
        tint = PiratePalette.TextMuted,
      )
    }
  }
}

@Composable
internal fun SectionHeader(
  title: String,
  action: String? = null,
  onAction: (() -> Unit)? = null,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 20.dp, vertical = 14.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
  ) {
    Text(
      title,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onBackground,
      style = MaterialTheme.typography.titleMedium,
    )
    if (!action.isNullOrBlank() && onAction != null) {
      Text(
        action,
        modifier = Modifier.clickable(onClick = onAction),
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.SemiBold,
      )
    }
  }
}

@Composable
internal fun AlbumCard(
  title: String,
  artist: String,
  imageUri: String? = null,
  imageFallbackUri: String? = null,
  onClick: (() -> Unit)? = null,
) {
  var displayImageUri by remember(imageUri, imageFallbackUri) { mutableStateOf(imageUri) }

  fun handleImageError() {
    val fallback = imageFallbackUri?.trim().orEmpty()
    if (fallback.isNotBlank() && fallback != displayImageUri) {
      displayImageUri = fallback
      return
    }
    displayImageUri = null
  }

  Column(
    modifier =
      Modifier
        .width(140.dp)
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
  ) {
    Surface(
      modifier = Modifier.size(140.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.large,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!displayImageUri.isNullOrBlank()) {
          AsyncImage(
            model = displayImageUri,
            contentDescription = "Cover art",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onError = { handleImageError() },
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        }
      }
    }
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      title,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Medium,
    )
    Text(
      artist,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = PiratePalette.TextMuted,
    )
  }
}

@Composable
internal fun PlaylistCard(
  playlist: PlaylistDisplayItem,
  onClick: () -> Unit,
) {
  Column(
    modifier = Modifier
      .width(140.dp)
      .clickable(onClick = onClick),
  ) {
    Surface(
      modifier = Modifier.size(140.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.large,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!playlist.coverUri.isNullOrBlank()) {
          AsyncImage(
            model = playlist.coverUri,
            contentDescription = "Playlist cover",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        }
      }
    }
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      playlist.name,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Medium,
    )
    Text(
      "${playlist.trackCount} track${if (playlist.trackCount == 1) "" else "s"}",
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = PiratePalette.TextMuted,
    )
  }
}

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
      modifier = Modifier
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
      modifier = Modifier
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
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp, vertical = 10.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
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
      verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
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
    modifier = Modifier
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
