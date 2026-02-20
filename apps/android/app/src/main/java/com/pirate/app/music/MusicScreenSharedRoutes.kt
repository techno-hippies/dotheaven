package com.pirate.app.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pirate.app.ui.PirateMobileHeader

@Composable
internal fun SharedLibraryRoute(
  cloudPlayBusy: Boolean,
  sharedLoading: Boolean,
  sharedError: String?,
  sharedPlaylists: List<PlaylistShareEntry>,
  sharedTracks: List<SharedCloudTrack>,
  isAuthenticated: Boolean,
  ownerLabelFor: (String) -> String,
  onBack: () -> Unit,
  onRefresh: () -> Unit,
  onOpenPlaylist: (PlaylistShareEntry) -> Unit,
  onPlayTrack: (SharedCloudTrack) -> Unit,
  onDownloadTrack: (SharedCloudTrack) -> Unit,
) {
  PirateMobileHeader(
    title = "Shared With You",
    onBackPress = onBack,
    rightSlot = {
      if (cloudPlayBusy || sharedLoading) {
        CircularProgressIndicator(
          modifier = Modifier.size(18.dp),
          strokeWidth = 2.dp,
          color = MaterialTheme.colorScheme.primary,
        )
      } else {
        IconButton(onClick = onRefresh) {
          Icon(
            Icons.Rounded.Refresh,
            contentDescription = "Refresh",
            tint = MaterialTheme.colorScheme.onBackground,
          )
        }
      }
    },
  )
  SharedView(
    loading = sharedLoading,
    error = sharedError,
    sharedPlaylists = sharedPlaylists,
    sharedTracks = sharedTracks,
    isAuthenticated = isAuthenticated,
    ownerLabelFor = ownerLabelFor,
    onOpenPlaylist = onOpenPlaylist,
    onPlayTrack = onPlayTrack,
    onDownloadTrack = onDownloadTrack,
  )
}

@Composable
internal fun SharedPlaylistDetailRoute(
  share: PlaylistShareEntry?,
  sharedPlaylistMenuOpen: Boolean,
  onSharedPlaylistMenuOpenChange: (Boolean) -> Unit,
  sharedPlaylistTracks: List<SharedCloudTrack>,
  sharedPlaylistLoading: Boolean,
  sharedPlaylistRefreshing: Boolean,
  sharedPlaylistError: String?,
  sharedByLabel: String?,
  currentTrackId: String?,
  isPlaying: Boolean,
  onBack: () -> Unit,
  onRefresh: () -> Unit,
  onDownloadAll: () -> Unit,
  onPlayTrack: (SharedCloudTrack) -> Unit,
  onDownloadTrack: (SharedCloudTrack) -> Unit,
  onShowMessage: (String) -> Unit,
) {
  PirateMobileHeader(
    title = share?.playlist?.name?.ifBlank { "Shared Playlist" } ?: "Shared Playlist",
    onBackPress = onBack,
    rightSlot = {
      if (share != null) {
        Box {
          IconButton(onClick = { onSharedPlaylistMenuOpenChange(true) }) {
            Icon(
              Icons.Rounded.MoreVert,
              contentDescription = "Playlist actions",
              tint = MaterialTheme.colorScheme.onBackground,
            )
          }
          DropdownMenu(
            expanded = sharedPlaylistMenuOpen,
            onDismissRequest = { onSharedPlaylistMenuOpenChange(false) },
          ) {
            DropdownMenuItem(
              text = { Text("Refresh") },
              onClick = {
                onSharedPlaylistMenuOpenChange(false)
                onRefresh()
              },
            )
            DropdownMenuItem(
              text = { Text("Download to device") },
              onClick = {
                onSharedPlaylistMenuOpenChange(false)
                if (sharedPlaylistTracks.isEmpty()) {
                  onShowMessage("No tracks to download")
                } else {
                  onDownloadAll()
                }
              },
            )
          }
        }
      }
    },
  )
  SharedPlaylistDetailView(
    loading = sharedPlaylistLoading || sharedPlaylistRefreshing,
    error = sharedPlaylistError,
    share = share,
    sharedByLabel = sharedByLabel,
    tracks = sharedPlaylistTracks,
    currentTrackId = currentTrackId,
    isPlaying = isPlaying,
    onPlayTrack = onPlayTrack,
    onDownloadTrack = onDownloadTrack,
    onShowMessage = onShowMessage,
  )
}
