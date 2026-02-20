package com.pirate.app.music.ui

import androidx.fragment.app.FragmentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.pirate.app.music.MusicTrack
import com.pirate.app.music.PlaylistDisplayItem
import com.pirate.app.tempo.TempoPasskeyManager
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
  open: Boolean,
  track: MusicTrack?,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
  hostActivity: FragmentActivity?,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
  onSuccess: (playlistId: String, playlistName: String) -> Unit,
) {
  if (!open || track == null) return

  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  var loading by remember { mutableStateOf(false) }
  var mutating by remember { mutableStateOf(false) }
  var playlists by remember { mutableStateOf<List<PlaylistDisplayItem>>(emptyList()) }
  var showCreate by remember { mutableStateOf(false) }
  var newName by remember { mutableStateOf("") }

  LaunchedEffect(open, isAuthenticated, ownerEthAddress) {
    if (!open) return@LaunchedEffect
    loading = true
    playlists =
      loadPlaylistDisplayItems(
        context = context,
        isAuthenticated = isAuthenticated,
        ownerEthAddress = ownerEthAddress,
      )
    loading = false
  }

  val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  ModalBottomSheet(
    sheetState = sheetState,
    onDismissRequest = {
      showCreate = false
      newName = ""
      onClose()
    },
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Add to Playlist", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
      Text("${track.title} — ${track.artist}", color = MaterialTheme.colorScheme.onSurfaceVariant)

      HorizontalDivider()

      if (showCreate) {
        OutlinedTextField(
          value = newName,
          onValueChange = { newName = it },
          label = { Text("Playlist name") },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedButton(
            onClick = {
              showCreate = false
              newName = ""
            },
          ) { Text("Cancel") }

          Button(
            enabled = !mutating && newName.trim().isNotEmpty(),
            onClick = {
              val name = newName.trim()
              scope.launch {
                mutating = true
                val result =
                  createPlaylistWithTrack(
                    context = context,
                    track = track,
                    playlistName = name,
                    isAuthenticated = isAuthenticated,
                    ownerEthAddress = ownerEthAddress,
                    tempoAccount = tempoAccount,
                    hostActivity = hostActivity,
                    onShowMessage = onShowMessage,
                  )
                if (result != null) {
                  onSuccess(result.playlistId, result.playlistName)
                  showCreate = false
                  newName = ""
                  onClose()
                }
                mutating = false
              }
            },
          ) { Text("Create") }
        }
      } else {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .clickable { showCreate = true }
            .padding(vertical = 10.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
          Icon(Icons.Rounded.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
          Text("Create New Playlist", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
        }
      }

      HorizontalDivider()

      if (loading) {
        Text("Loading playlists...", color = MaterialTheme.colorScheme.onSurfaceVariant)
      } else if (mutating) {
        Text("Updating playlist...", color = MaterialTheme.colorScheme.onSurfaceVariant)
      } else if (playlists.isEmpty()) {
        Text("No playlists yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      } else {
        playlists.forEach { pl ->
          PlaylistRow(
            playlist = pl,
            onClick = {
              scope.launch {
                if (mutating) return@launch
                mutating = true
                val result =
                  addTrackToPlaylistWithUi(
                    context = context,
                    playlist = pl,
                    track = track,
                    isAuthenticated = isAuthenticated,
                    ownerEthAddress = ownerEthAddress,
                    tempoAccount = tempoAccount,
                    hostActivity = hostActivity,
                    onShowMessage = onShowMessage,
                  )
                if (result != null) {
                  onSuccess(result.playlistId, result.playlistName)
                  showCreate = false
                  newName = ""
                }
                mutating = false
                if (result != null) {
                  onClose()
                }
              }
            },
          )
        }
      }

      Spacer(modifier = Modifier.height(8.dp))
    }
  }
}

@Composable
private fun PlaylistRow(
  playlist: PlaylistDisplayItem,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onClick() }
      .padding(vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    Column(modifier = Modifier.weight(1f)) {
      Text(playlist.name, fontWeight = FontWeight.Medium)
      Text("${playlist.trackCount} tracks", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (!playlist.isLocal) {
      Text("on-chain", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}
