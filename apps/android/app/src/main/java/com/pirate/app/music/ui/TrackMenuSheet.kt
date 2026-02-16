package com.pirate.app.music.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.AllInclusive
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pirate.app.music.MusicTrack

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackMenuSheet(
  open: Boolean,
  track: MusicTrack?,
  onClose: () -> Unit,
  onUpload: ((MusicTrack) -> Unit)? = null,
  onSaveForever: ((MusicTrack) -> Unit)? = null,
  onAddToPlaylist: ((MusicTrack) -> Unit)? = null,
  onAddToQueue: ((MusicTrack) -> Unit)? = null,
  onGoToAlbum: ((MusicTrack) -> Unit)? = null,
  onGoToArtist: ((MusicTrack) -> Unit)? = null,
) {
  if (!open || track == null) return

  val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  ModalBottomSheet(
    sheetState = sheetState,
    onDismissRequest = onClose,
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Text(track.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
      Text(track.artist, color = MaterialTheme.colorScheme.onSurfaceVariant)
      HorizontalDivider()

      val alreadyUploaded = !track.pieceCid.isNullOrBlank()
      val isPermanent = alreadyUploaded && track.savedForever

      if (onUpload != null) {
        if (!alreadyUploaded) {
          MenuItemRow(
            icon = { Icon(Icons.Rounded.CloudUpload, contentDescription = null) },
            label = "Upload",
            onClick = {
              onUpload(track)
              onClose()
            },
          )
        }
      }

      if (onSaveForever != null) {
        if (isPermanent) {
          MenuItemRow(
            icon = { Icon(Icons.Rounded.AllInclusive, contentDescription = null) },
            label = "Saved Forever",
            labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
            onClick = { onClose() },
          )
        } else {
          MenuItemRow(
            icon = { Icon(Icons.Rounded.AllInclusive, contentDescription = null) },
            label = "Save Forever",
            onClick = {
              onSaveForever(track)
              onClose()
            },
          )
        }
      } else if (isPermanent) {
        MenuItemRow(
          icon = { Icon(Icons.Rounded.AllInclusive, contentDescription = null) },
          label = "Saved Forever",
          labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
          onClick = { onClose() },
        )
      }

      if (onAddToPlaylist != null) {
        MenuItemRow(
          icon = { Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, contentDescription = null) },
          label = "Add to Playlist",
          onClick = {
            onAddToPlaylist(track)
            onClose()
          },
        )
      }

      if (onAddToQueue != null) {
        MenuItemRow(
          icon = { Icon(Icons.AutoMirrored.Rounded.QueueMusic, contentDescription = null) },
          label = "Add to Queue",
          onClick = {
            onAddToQueue(track)
            onClose()
          },
        )
      }

      if (onGoToAlbum != null && track.album.isNotBlank()) {
        MenuItemRow(
          icon = { Icon(Icons.Rounded.Album, contentDescription = null) },
          label = "Go to Album",
          onClick = {
            onGoToAlbum(track)
            onClose()
          },
        )
      }

      if (onGoToArtist != null) {
        MenuItemRow(
          icon = { Icon(Icons.Rounded.Person, contentDescription = null) },
          label = "Go to Artist",
          onClick = {
            onGoToArtist(track)
            onClose()
          },
        )
      }

      Spacer(modifier = Modifier.size(4.dp))
    }
  }
}

@Composable
private fun MenuItemRow(
  icon: @Composable () -> Unit,
  label: String,
  labelColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onClick() }
      .padding(vertical = 14.dp, horizontal = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Spacer(modifier = Modifier.width(6.dp))
    icon()
    Spacer(modifier = Modifier.width(16.dp))
    Text(label, color = labelColor, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
  }
}
