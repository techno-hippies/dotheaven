package com.pirate.app.music.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pirate.app.music.LocalPlaylistsStore
import com.pirate.app.music.PlaylistV1LitAction
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatePlaylistSheet(
  open: Boolean,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
  pkpPublicKey: String?,
  litNetwork: String,
  litRpcUrl: String,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
  onSuccess: (playlistId: String, playlistName: String) -> Unit,
) {
  if (!open) return

  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  var name by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var onChain by remember { mutableStateOf(false) }

  LaunchedEffect(open) {
    if (open) {
      name = ""
      busy = false
      onChain = false
    }
  }

  val canCreateOnChain = isAuthenticated && !ownerEthAddress.isNullOrBlank() && !pkpPublicKey.isNullOrBlank()

  val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  ModalBottomSheet(
    sheetState = sheetState,
    onDismissRequest = {
      if (!busy) onClose()
    },
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("New Playlist", fontWeight = FontWeight.SemiBold)
      HorizontalDivider()

      OutlinedTextField(
        value = name,
        onValueChange = { name = it },
        label = { Text("Playlist name") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        enabled = !busy,
      )

      if (canCreateOnChain) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          ChoicePill(
            label = "Local",
            selected = !onChain,
            enabled = !busy,
            onClick = { onChain = false },
          )
          ChoicePill(
            label = "On-chain",
            selected = onChain,
            enabled = !busy,
            onClick = { onChain = true },
          )
        }
      }

      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(
          enabled = !busy,
          onClick = onClose,
        ) { Text("Cancel") }

        Button(
          enabled = !busy && name.trim().isNotEmpty(),
          onClick = {
            val trimmed = name.trim()
            scope.launch {
              busy = true
              if (!onChain) {
                val created = LocalPlaylistsStore.createLocalPlaylist(context, trimmed, initialTrack = null)
                onShowMessage("Created ${created.name}")
                onSuccess(created.id, created.name)
                busy = false
                onClose()
                return@launch
              }

              if (!canCreateOnChain) {
                onShowMessage("Sign in to create on-chain playlists")
                busy = false
                return@launch
              }

              val result =
                runCatching {
                  PlaylistV1LitAction.createEmptyPlaylist(
                    litNetwork = litNetwork,
                    litRpcUrl = litRpcUrl,
                    userPkpPublicKey = pkpPublicKey!!,
                    userEthAddress = ownerEthAddress!!,
                    name = trimmed,
                    visibility = 0,
                  )
                }.getOrElse { err ->
                  onShowMessage("On-chain create failed: ${err.message ?: "unknown error"}")
                  busy = false
                  return@launch
                }

              if (!result.success || result.playlistId.isNullOrBlank()) {
                onShowMessage("On-chain create failed: ${result.error ?: "unknown error"}")
                busy = false
                return@launch
              }

              onShowMessage("Created on-chain playlist")
              onSuccess(result.playlistId, trimmed)
              busy = false
              onClose()
            }
          },
        ) { Text(if (busy) "Creating..." else "Create") }
      }

      Spacer(modifier = Modifier.height(8.dp))
    }
  }
}

@Composable
private fun ChoicePill(
  label: String,
  selected: Boolean,
  enabled: Boolean,
  onClick: () -> Unit,
) {
  val bg =
    if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
  val fg =
    if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant

  Surface(
    modifier = Modifier.clickable(enabled = enabled, onClick = onClick),
    color = bg,
    shape = MaterialTheme.shapes.extraLarge,
  ) {
    Text(
      text = label,
      modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
      color = fg,
      fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
    )
  }
}
