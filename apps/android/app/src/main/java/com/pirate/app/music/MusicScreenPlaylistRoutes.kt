package com.pirate.app.music

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.rounded.MoreHoriz
import com.pirate.app.ui.PirateMobileHeader
import kotlinx.coroutines.launch

@Composable
internal fun PlaylistsRoute(
  loading: Boolean,
  playlists: List<PlaylistDisplayItem>,
  onBack: () -> Unit,
  onCreatePlaylist: () -> Unit,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
) {
  PirateMobileHeader(
    title = "Playlists",
    onBackPress = onBack,
    rightSlot = {
      IconButton(onClick = onCreatePlaylist) {
        Icon(
          Icons.Rounded.Add,
          contentDescription = "Create playlist",
          tint = MaterialTheme.colorScheme.onBackground,
        )
      }
    },
  )
  PlaylistsView(
    loading = loading,
    playlists = playlists,
    onOpenPlaylist = onOpenPlaylist,
  )
}

@Composable
internal fun PlaylistDetailRoute(
  playlist: PlaylistDisplayItem?,
  loading: Boolean,
  error: String?,
  tracks: List<MusicTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onBack: () -> Unit,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
  onShowMessage: (String) -> Unit,
  onChangeCover: suspend (PlaylistDisplayItem, Uri) -> Boolean,
  onShareToWallet: suspend (PlaylistDisplayItem, String) -> Boolean,
  onDeletePlaylist: suspend (PlaylistDisplayItem) -> Boolean,
) {
  val scope = rememberCoroutineScope()
  var menuOpen by remember { mutableStateOf(false) }
  var shareDialogOpen by remember { mutableStateOf(false) }
  var deleteDialogOpen by remember { mutableStateOf(false) }
  var shareRecipientInput by rememberSaveable(playlist?.id) { mutableStateOf("") }
  var actionBusy by remember { mutableStateOf(false) }
  var coverUpdateBusy by remember { mutableStateOf(false) }

  val canManageOnChainPlaylist =
    playlist != null &&
      !playlist.isLocal &&
      playlist.id.startsWith("0x", ignoreCase = true)
  val canSharePlaylist = (playlist?.trackCount ?: tracks.size) > 0

  val coverPicker =
    rememberLauncherForActivityResult(
      contract = ActivityResultContracts.GetContent(),
    ) { picked ->
      val activePlaylist = playlist
      if (picked == null || activePlaylist == null || actionBusy || coverUpdateBusy) {
        return@rememberLauncherForActivityResult
      }

      coverUpdateBusy = true
      scope.launch {
        onChangeCover(activePlaylist, picked)
        coverUpdateBusy = false
      }
    }

  PirateMobileHeader(
    title = "",
    onBackPress = onBack,
    rightSlot = {
      if (canManageOnChainPlaylist) {
        Box {
          IconButton(onClick = { menuOpen = true }) {
            Icon(
              Icons.Rounded.MoreHoriz,
              contentDescription = "Playlist actions",
              tint = MaterialTheme.colorScheme.onBackground,
            )
          }
          DropdownMenu(
            expanded = menuOpen,
            onDismissRequest = { menuOpen = false },
          ) {
            DropdownMenuItem(
              text = { Text("Change cover") },
              enabled = !actionBusy && !coverUpdateBusy,
              onClick = {
                menuOpen = false
                coverPicker.launch("image/*")
              },
            )
            DropdownMenuItem(
              text = { Text("Share to wallet...") },
              enabled = !actionBusy && !coverUpdateBusy && canSharePlaylist,
              onClick = {
                menuOpen = false
                if (!canSharePlaylist) {
                  onShowMessage("Add at least one track before sharing")
                  return@DropdownMenuItem
                }
                shareRecipientInput = ""
                shareDialogOpen = true
              },
            )
            DropdownMenuItem(
              text = { Text("Delete playlist") },
              enabled = !actionBusy && !coverUpdateBusy,
              onClick = {
                menuOpen = false
                deleteDialogOpen = true
              },
            )
          }
        }
      }
    },
  )
  PlaylistDetailView(
    playlist = playlist,
    loading = loading,
    error = error,
    tracks = tracks,
    currentTrackId = currentTrackId,
    isPlaying = isPlaying,
    onPlayTrack = onPlayTrack,
    onTrackMenu = onTrackMenu,
    coverUpdating = coverUpdateBusy,
  )

  val activePlaylist = playlist
  if (shareDialogOpen && activePlaylist != null) {
    AlertDialog(
      onDismissRequest = {
        if (!actionBusy) {
          shareDialogOpen = false
        }
      },
      title = { Text("Share Playlist") },
      text = {
        OutlinedTextField(
          value = shareRecipientInput,
          onValueChange = { if (!actionBusy) shareRecipientInput = it },
          singleLine = true,
          label = { Text("Recipient") },
          placeholder = { Text("0x..., alice.heaven, bob.pirate") },
          enabled = !actionBusy,
        )
      },
      confirmButton = {
        TextButton(
          enabled = !actionBusy && !coverUpdateBusy && shareRecipientInput.trim().isNotEmpty(),
          onClick = {
            actionBusy = true
            scope.launch {
              val shared = onShareToWallet(activePlaylist, shareRecipientInput)
              actionBusy = false
              if (shared) {
                shareDialogOpen = false
                shareRecipientInput = ""
              }
            }
          },
        ) {
          Text(if (actionBusy) "Sharing..." else "Share")
        }
      },
      dismissButton = {
        TextButton(
          enabled = !actionBusy && !coverUpdateBusy,
          onClick = { shareDialogOpen = false },
        ) {
          Text("Cancel")
        }
      },
    )
  }

  if (deleteDialogOpen && activePlaylist != null) {
    AlertDialog(
      onDismissRequest = {
        if (!actionBusy) {
          deleteDialogOpen = false
        }
      },
      title = { Text("Delete playlist?") },
      text = { Text("This will remove \"${activePlaylist.name}\" from your playlists.") },
      confirmButton = {
        TextButton(
          enabled = !actionBusy && !coverUpdateBusy,
          onClick = {
            actionBusy = true
            scope.launch {
              val deleted = onDeletePlaylist(activePlaylist)
              actionBusy = false
              if (deleted) {
                deleteDialogOpen = false
              }
            }
          },
        ) {
          Text(if (actionBusy) "Deleting..." else "Delete")
        }
      },
      dismissButton = {
        TextButton(
          enabled = !actionBusy && !coverUpdateBusy,
          onClick = { deleteDialogOpen = false },
        ) {
          Text("Cancel")
        }
      },
    )
  }
}
