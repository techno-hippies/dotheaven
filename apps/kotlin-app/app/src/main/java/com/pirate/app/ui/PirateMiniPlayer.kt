package com.pirate.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.player.PlayerController

@Composable
fun PirateMiniPlayer(
  player: PlayerController,
  onOpen: (() -> Unit)? = null,
) {
  val track by player.currentTrack.collectAsState()
  val isPlaying by player.isPlaying.collectAsState()
  val progress by player.progress.collectAsState()

  val current = track ?: return

  var artworkUri by remember(current.id) { mutableStateOf(current.artworkUri) }
  var artworkFailed by remember(current.id) { mutableStateOf(false) }

  fun handleArtworkError() {
    if (
      artworkUri == current.artworkUri &&
      !current.artworkFallbackUri.isNullOrBlank() &&
      current.artworkFallbackUri != artworkUri
    ) {
      artworkUri = current.artworkFallbackUri
      return
    }
    artworkFailed = true
  }

  val progressPct =
    if (progress.durationSec > 0f) {
      (progress.positionSec / progress.durationSec).coerceIn(0f, 1f)
    } else {
      0f
    }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .background(MaterialTheme.colorScheme.surface)
      .clickable { onOpen?.invoke() },
  ) {
    // Progress bar
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .height(2.dp)
        .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
      Box(
        modifier = Modifier
          .fillMaxWidth(progressPct)
          .height(2.dp)
          .background(MaterialTheme.colorScheme.primary),
      )
    }

    Row(
      modifier = Modifier
        .fillMaxWidth()
        .height(64.dp)
        .padding(horizontal = 12.dp),
      verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      // Album art
      Box(
        modifier = Modifier
          .size(48.dp)
          .clip(RoundedCornerShape(8.dp))
          .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = androidx.compose.ui.Alignment.Center,
      ) {
        if (!artworkUri.isNullOrBlank() && !artworkFailed) {
          AsyncImage(
            model = artworkUri,
            contentDescription = "Album art",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onError = { handleArtworkError() },
          )
        } else {
          Icon(
            Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
          )
        }
      }

      // Track info
      Column(modifier = Modifier.weight(1f)) {
        Text(
          current.title,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          fontWeight = FontWeight.Medium,
          color = MaterialTheme.colorScheme.onSurface,
          style = MaterialTheme.typography.bodyLarge,
        )
        Text(
          current.artist,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          style = MaterialTheme.typography.bodyLarge,
        )
      }

      // Controls
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Surface(
          shape = RoundedCornerShape(999.dp),
          color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
          IconButton(onClick = { player.togglePlayPause() }) {
            Icon(
              if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
              contentDescription = if (isPlaying) "Pause" else "Play",
              tint = MaterialTheme.colorScheme.onSurface,
              modifier = Modifier.size(20.dp),
            )
          }
        }

        IconButton(onClick = { player.skipNext() }) {
          Icon(
            Icons.Rounded.SkipNext,
            contentDescription = "Next",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
    }

    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
  }
}
