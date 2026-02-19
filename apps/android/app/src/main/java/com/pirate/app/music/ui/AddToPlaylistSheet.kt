package com.pirate.app.music.ui

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
import com.pirate.app.music.LocalPlaylist
import com.pirate.app.music.LocalPlaylistTrack
import com.pirate.app.music.LocalPlaylistsStore
import com.pirate.app.music.MusicTrack
import com.pirate.app.music.OnChainPlaylist
import com.pirate.app.music.OnChainPlaylistsApi
import com.pirate.app.music.PlaylistDisplayItem
import com.pirate.app.music.TempoPlaylistApi
import com.pirate.app.music.TrackIds
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import kotlinx.coroutines.launch

private const val IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs/"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
  open: Boolean,
  track: MusicTrack?,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
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

  suspend fun loadPlaylists() {
    loading = true

    val local = runCatching { LocalPlaylistsStore.getLocalPlaylists(context) }.getOrElse { emptyList() }
    val onChain =
      if (isAuthenticated && !ownerEthAddress.isNullOrBlank()) {
        runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ownerEthAddress) }.getOrElse { emptyList() }
      } else {
        emptyList()
      }

    playlists = toDisplayItems(local, onChain)
    loading = false
  }

  LaunchedEffect(open, isAuthenticated, ownerEthAddress) {
    if (open) loadPlaylists()
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
                val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
                if (isAuthenticated && owner.isNotBlank() && tempoAccount != null) {
                  val sessionKey =
                    SessionKeyManager.load(context)?.takeIf {
                      SessionKeyManager.isValid(it, ownerAddress = owner)
                    }
                  if (sessionKey == null) {
                    onShowMessage("Session expired. Sign in again to create playlists.")
                    mutating = false
                    return@launch
                  }

                  val trackId =
                    TrackIds.computeMetaTrackId(
                      title = track.title,
                      artist = track.artist,
                      album = track.album.ifBlank { null },
                    )
                  val createResult =
                    TempoPlaylistApi.createPlaylist(
                      account = tempoAccount,
                      sessionKey = sessionKey,
                      name = name,
                      coverCid = "",
                      visibility = 0,
                      trackIds = listOf(trackId),
                    )
                  if (!createResult.success) {
                    onShowMessage("Create failed: ${createResult.error ?: "unknown error"}")
                    mutating = false
                    return@launch
                  }

                  val resolvedId = resolveCreatedPlaylistId(owner, name, createResult.playlistId)
                  onShowMessage("Added to $name")
                  onSuccess(
                    resolvedId ?: "pending:${System.currentTimeMillis()}",
                    name,
                  )
                } else {
                  val created = LocalPlaylistsStore.createLocalPlaylist(context, name, track.toLocalPlaylistTrack())
                  onShowMessage("Added to ${created.name}")
                  onSuccess(created.id, created.name)
                }
                mutating = false
                showCreate = false
                newName = ""
                onClose()
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
                if (pl.isLocal) {
                  LocalPlaylistsStore.addTrackToLocalPlaylist(context, pl.id, track.toLocalPlaylistTrack())
                  onShowMessage("Added to ${pl.name}")
                  onSuccess(pl.id, pl.name)
                } else {
                  val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
                  if (!isAuthenticated || owner.isBlank() || tempoAccount == null) {
                    onShowMessage("Sign in with Tempo passkey to update on-chain playlists")
                    mutating = false
                    return@launch
                  }

                  val sessionKey =
                    SessionKeyManager.load(context)?.takeIf {
                      SessionKeyManager.isValid(it, ownerAddress = owner)
                    }
                  if (sessionKey == null) {
                    onShowMessage("Session expired. Sign in again to update playlists.")
                    mutating = false
                    return@launch
                  }

                  val trackId =
                    TrackIds.computeMetaTrackId(
                      title = track.title,
                      artist = track.artist,
                      album = track.album.ifBlank { null },
                    )

                  val existingTrackIds = runCatching { OnChainPlaylistsApi.fetchPlaylistTrackIds(pl.id) }
                    .getOrElse {
                      onShowMessage("Could not load playlist tracks yet. Try again in a moment.")
                      mutating = false
                      return@launch
                    }

                  if (pl.trackCount > 0 && existingTrackIds.isEmpty()) {
                    onShowMessage("Playlist tracks are still indexing. Try again shortly.")
                    mutating = false
                    return@launch
                  }

                  if (existingTrackIds.any { it.equals(trackId, ignoreCase = true) }) {
                    onShowMessage("Already in ${pl.name}")
                    onSuccess(pl.id, pl.name)
                    mutating = false
                    onClose()
                    return@launch
                  }

                  val nextTrackIds = ArrayList<String>(existingTrackIds.size + 1)
                  nextTrackIds.addAll(existingTrackIds)
                  nextTrackIds.add(trackId)

                  val result =
                    TempoPlaylistApi.setTracks(
                      account = tempoAccount,
                      sessionKey = sessionKey,
                      playlistId = pl.id,
                      trackIds = nextTrackIds,
                    )
                  if (!result.success) {
                    onShowMessage("Add failed: ${result.error ?: "unknown error"}")
                    mutating = false
                    return@launch
                  }

                  onShowMessage("Added to ${pl.name}")
                  onSuccess(pl.id, pl.name)
                }
                showCreate = false
                newName = ""
                mutating = false
                onClose()
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

private fun toDisplayItems(local: List<LocalPlaylist>, onChain: List<OnChainPlaylist>): List<PlaylistDisplayItem> {
  val out = ArrayList<PlaylistDisplayItem>(local.size + onChain.size)
  for (lp in local) {
    out.add(
      PlaylistDisplayItem(
        id = lp.id,
        name = lp.name,
        trackCount = lp.tracks.size,
        coverUri = lp.coverUri ?: lp.tracks.firstOrNull()?.artworkUri,
        isLocal = true,
      ),
    )
  }
  for (p in onChain) {
    out.add(
      PlaylistDisplayItem(
        id = p.id,
        name = p.name,
        trackCount = p.trackCount,
        coverUri = p.coverCid.ifBlank { null }?.let { cid ->
          "${IPFS_GATEWAY}${cid}?img-width=96&img-height=96&img-format=webp&img-quality=80"
        },
        isLocal = false,
      ),
    )
  }
  return out
}

private fun MusicTrack.toLocalPlaylistTrack(): LocalPlaylistTrack {
  return LocalPlaylistTrack(
    artist = artist,
    title = title,
    album = album.ifBlank { null },
    durationSec = durationSec.takeIf { it > 0 },
    uri = uri,
    artworkUri = artworkUri,
    artworkFallbackUri = artworkFallbackUri,
  )
}

private suspend fun resolveCreatedPlaylistId(
  ownerAddress: String,
  playlistName: String,
  immediateId: String?,
): String? {
  val direct = immediateId?.trim().orEmpty()
  if (direct.startsWith("0x") && direct.length == 66) return direct.lowercase()

  repeat(4) {
    val candidates = runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ownerAddress, maxEntries = 30) }.getOrNull()
    val match =
      candidates
        ?.firstOrNull { playlist ->
          playlist.name.trim().equals(playlistName.trim(), ignoreCase = true)
        }
        ?.id
        ?.trim()
    if (!match.isNullOrBlank()) return match.lowercase()
    kotlinx.coroutines.delay(1_200L)
  }

  return null
}
