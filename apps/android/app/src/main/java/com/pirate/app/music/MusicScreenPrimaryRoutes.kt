package com.pirate.app.music

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import com.pirate.app.ui.PirateMobileHeader

@Composable
internal fun MusicHomeRoute(
  sharedPlaylistCount: Int,
  sharedTrackCount: Int,
  sharedUnreadCount: Int,
  playlistCount: Int,
  playlists: List<PlaylistDisplayItem>,
  newReleases: List<AlbumCardModel>,
  newReleasesLoading: Boolean,
  newReleasesError: String?,
  onOpenDrawer: () -> Unit,
  onNavigateSearch: () -> Unit,
  onNavigateLibrary: () -> Unit,
  onNavigateShared: () -> Unit,
  onNavigatePlaylists: () -> Unit,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
  onPlayRelease: (AlbumCardModel) -> Unit,
) {
  PirateMobileHeader(
    title = "Music",
    onAvatarPress = onOpenDrawer,
    rightSlot = {
      IconButton(onClick = onNavigateSearch) {
        Icon(
          Icons.Rounded.Search,
          contentDescription = "Search",
          tint = MaterialTheme.colorScheme.onBackground,
        )
      }
    },
  )
  MusicHomeView(
    sharedPlaylistCount = sharedPlaylistCount,
    sharedTrackCount = sharedTrackCount,
    sharedUnreadCount = sharedUnreadCount,
    playlistCount = playlistCount,
    playlists = playlists,
    newReleases = newReleases,
    newReleasesLoading = newReleasesLoading,
    newReleasesError = newReleasesError,
    onNavigateLibrary = onNavigateLibrary,
    onNavigateShared = onNavigateShared,
    onNavigatePlaylists = onNavigatePlaylists,
    onOpenPlaylist = onOpenPlaylist,
    onPlayRelease = onPlayRelease,
  )
}

@Composable
internal fun MusicLibraryRoute(
  hasPermission: Boolean,
  tracks: List<MusicTrack>,
  scanning: Boolean,
  error: String?,
  currentTrackId: String?,
  isPlaying: Boolean,
  onBack: () -> Unit,
  onNavigateSearch: () -> Unit,
  onRequestPermission: () -> Unit,
  onScan: () -> Unit,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  PirateMobileHeader(
    title = "Library",
    onBackPress = onBack,
    rightSlot = {
      IconButton(onClick = onNavigateSearch) {
        Icon(
          Icons.Rounded.Search,
          contentDescription = "Search",
          tint = MaterialTheme.colorScheme.onBackground,
        )
      }
    },
  )
  LibraryView(
    hasPermission = hasPermission,
    requestPermission = onRequestPermission,
    tracks = tracks,
    scanning = scanning,
    error = error,
    currentTrackId = currentTrackId,
    isPlaying = isPlaying,
    onScan = onScan,
    onPlayTrack = onPlayTrack,
    onTrackMenu = onTrackMenu,
  )
}

@Composable
internal fun MusicSearchRoute(
  query: String,
  tracks: List<MusicTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onQueryChange: (String) -> Unit,
  onBack: () -> Unit,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  PirateMobileHeader(
    title = "Search",
    onBackPress = onBack,
  )
  SearchView(
    query = query,
    onQueryChange = onQueryChange,
    tracks = tracks,
    currentTrackId = currentTrackId,
    isPlaying = isPlaying,
    onPlayTrack = onPlayTrack,
    onTrackMenu = onTrackMenu,
  )
}
