package com.pirate.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.theme.PiratePalette

@Composable
internal fun ScrobblesPanel(
  scrobbles: List<ScrobbleRow>,
  loading: Boolean,
  error: String?,
  onOpenSong: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtist: ((String) -> Unit)? = null,
  onRetry: () -> Unit,
) {
  when {
    loading -> CenteredStatus { CircularProgressIndicator(Modifier.size(32.dp)); Spacer(Modifier.height(12.dp)); Text("Loading scrobbles...", color = PiratePalette.TextMuted) }
    error != null -> CenteredStatus { Text(error, color = MaterialTheme.colorScheme.error); Spacer(Modifier.height(8.dp)); TextButton(onClick = onRetry) { Text("Retry") } }
    scrobbles.isEmpty() -> CenteredStatus { Text("No scrobbles yet.", color = PiratePalette.TextMuted) }
    else -> {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
        itemsIndexed(scrobbles, key = { i, s -> "${s.playedAtSec}:${s.trackId ?: i}" }) { _, scrobble ->
          ScrobbleRowItem(
            scrobble = scrobble,
            onOpenSong = onOpenSong,
            onOpenArtist = onOpenArtist,
          )
        }
      }
    }
  }
}

@Composable
internal fun ScrobbleRowItem(
  scrobble: ScrobbleRow,
  onOpenSong: ((trackId: String, title: String?, artist: String?) -> Unit)? = null,
  onOpenArtist: ((String) -> Unit)? = null,
) {
  val songClickable = onOpenSong != null && !scrobble.trackId.isNullOrBlank()
  val artistClickable = onOpenArtist != null && scrobble.artist.isNotBlank()
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(enabled = songClickable) {
        val trackId = scrobble.trackId
        if (!trackId.isNullOrBlank()) onOpenSong?.invoke(trackId, scrobble.title, scrobble.artist)
      }
      .padding(horizontal = 16.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
      contentAlignment = Alignment.Center,
    ) {
      if (scrobble.coverCid != null) {
        AsyncImage(
          model = ProfileScrobbleApi.coverUrl(scrobble.coverCid),
          contentDescription = "Album art",
          modifier = Modifier.fillMaxSize(),
          contentScale = ContentScale.Crop,
        )
      } else {
        Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(20.dp), tint = PiratePalette.TextMuted)
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Text(scrobble.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground)
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
          scrobble.artist,
          style = MaterialTheme.typography.bodyLarge,
          color = PiratePalette.TextMuted,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          modifier = if (artistClickable) Modifier.clickable { onOpenArtist?.invoke(scrobble.artist) } else Modifier,
        )
        Text(" · ${scrobble.playedAgo}", style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}
