package com.pirate.app.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

@Composable
fun PlayerScreen(
  player: PlayerController,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
  onOpenSongPage: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtistPage: ((String) -> Unit)? = null,
  hostActivity: androidx.fragment.app.FragmentActivity? = null,
  tempoAccount: com.pirate.app.tempo.TempoPasskeyManager.PasskeyAccount? = null,
) {
  val currentTrack by player.currentTrack.collectAsState()
  val isPlaying by player.isPlaying.collectAsState()
  val progress by player.progress.collectAsState()

  val track = currentTrack
  if (track == null) {
    LaunchedEffect(Unit) { onClose() }
    return
  }

  var menuOpen by remember { mutableStateOf(false) }
  var artworkUri by remember(track.id) { mutableStateOf(track.artworkUri) }
  var artworkFailed by remember(track.id) { mutableStateOf(false) }

  fun handleArtworkError() {
    if (
      artworkUri == track.artworkUri &&
      !track.artworkFallbackUri.isNullOrBlank() &&
      track.artworkFallbackUri != artworkUri
    ) {
      artworkUri = track.artworkFallbackUri
      return
    }
    artworkFailed = true
  }

  val screenWidth = LocalConfiguration.current.screenWidthDp.dp
  val coverSize = minOf(screenWidth - 80.dp, 400.dp).coerceAtLeast(220.dp)

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background)
      .statusBarsPadding()
      .navigationBarsPadding()
      .padding(horizontal = 24.dp),
  ) {
    Row(
      modifier = Modifier.fillMaxWidth().height(56.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      IconButton(onClick = onClose) {
        Icon(
          Icons.Rounded.KeyboardArrowDown,
          contentDescription = "Close player",
          tint = MaterialTheme.colorScheme.onBackground,
          modifier = Modifier.size(28.dp),
        )
      }

      IconButton(onClick = { menuOpen = true }) {
        Icon(
          Icons.Rounded.MoreHoriz,
          contentDescription = "Track menu",
          tint = MaterialTheme.colorScheme.onBackground,
          modifier = Modifier.size(28.dp),
        )
      }
    }

    Box(
      modifier = Modifier.fillMaxWidth().weight(1f),
      contentAlignment = Alignment.Center,
    ) {
      Box(
        modifier = Modifier.size(coverSize).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
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
            modifier = Modifier.size(80.dp),
          )
        }
      }
    }

    Column(
      modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      Text(
        track.title,
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        maxLines = 2,
      )
      Text(
        track.artist,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        maxLines = 1,
      )
      if (track.album.isNotBlank()) {
        Text(
          track.album,
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          textAlign = TextAlign.Center,
          maxLines = 1,
        )
      }
    }

    PlayerScrubber(
      positionSec = progress.positionSec,
      durationSec = progress.durationSec,
      onSeek = { player.seekTo(it) },
    )

    Row(
      modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
      horizontalArrangement = Arrangement.Center,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      SoftIconButton(onClick = { player.skipPrevious() }) {
        Icon(
          Icons.Rounded.SkipPrevious,
          contentDescription = "Previous track",
          tint = MaterialTheme.colorScheme.onSurface,
          modifier = Modifier.size(28.dp),
        )
      }

      Spacer(modifier = Modifier.size(24.dp))

      Surface(
        modifier = Modifier.size(80.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary,
      ) {
        IconButton(onClick = { player.togglePlayPause() }) {
          Icon(
            if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            contentDescription = if (isPlaying) "Pause" else "Play",
            tint = MaterialTheme.colorScheme.background,
            modifier = Modifier.size(40.dp),
          )
        }
      }

      Spacer(modifier = Modifier.size(24.dp))

      SoftIconButton(onClick = { player.skipNext() }) {
        Icon(
          Icons.Rounded.SkipNext,
          contentDescription = "Next track",
          tint = MaterialTheme.colorScheme.onSurface,
          modifier = Modifier.size(28.dp),
        )
      }
    }

    Spacer(modifier = Modifier.height(32.dp))
  }

  PlayerTrackMenuOverlay(
    track = track,
    player = player,
    menuOpen = menuOpen,
    onMenuOpenChange = { menuOpen = it },
    ownerEthAddress = ownerEthAddress,
    isAuthenticated = isAuthenticated,
    onShowMessage = onShowMessage,
    onOpenSongPage = onOpenSongPage,
    onOpenArtistPage = onOpenArtistPage,
    hostActivity = hostActivity,
    tempoAccount = tempoAccount,
  )
}
