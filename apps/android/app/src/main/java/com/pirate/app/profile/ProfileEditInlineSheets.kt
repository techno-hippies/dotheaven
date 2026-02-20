package com.pirate.app.profile

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.theme.PiratePalette
import com.pirate.app.util.resolveAvatarUrl

@Composable
internal fun DisplayNameEditorSheet(
  initialValue: String,
  onDone: (displayName: String) -> Unit,
) {
  var value by remember(initialValue) { mutableStateOf(initialValue) }
  Column(
    modifier =
      Modifier
        .fillMaxWidth()
        .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("Display Name", style = MaterialTheme.typography.titleLarge)
    LabeledTextField(
      label = "Name",
      value = value,
      placeholder = "Enter a display name",
      onValueChange = { value = it },
    )
    Button(
      onClick = { onDone(value.trim()) },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Done")
    }
  }
}

@Composable
internal fun PhotoEditorSheet(
  avatarUri: String?,
  avatarPreviewBitmap: Bitmap?,
  onPickPhoto: () -> Unit,
  onRemovePhoto: () -> Unit,
  onDone: () -> Unit,
) {
  Column(
    modifier =
      Modifier
        .fillMaxWidth()
        .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp),
  ) {
    Text("Profile Photo", style = MaterialTheme.typography.titleLarge)
    Surface(
      modifier =
        Modifier
          .size(124.dp)
          .align(Alignment.CenterHorizontally),
      shape = RoundedCornerShape(62.dp),
      color = Color(0xFF262626),
    ) {
      val resolved = resolveAvatarUrl(avatarUri)
      Box(contentAlignment = Alignment.Center) {
        when {
          avatarPreviewBitmap != null -> {
            Image(
              bitmap = avatarPreviewBitmap.asImageBitmap(),
              contentDescription = "Avatar preview",
              contentScale = ContentScale.Crop,
              modifier = Modifier.fillMaxSize(),
            )
          }
          resolved != null -> {
            AsyncImage(
              model = resolved,
              contentDescription = "Avatar",
              contentScale = ContentScale.Crop,
              modifier = Modifier.fillMaxSize(),
            )
          }
          else -> {
            Icon(
              imageVector = Icons.Rounded.AddAPhoto,
              contentDescription = null,
              tint = PiratePalette.TextMuted,
              modifier = Modifier.size(30.dp),
            )
          }
        }
      }
    }
    Text(
      "Pick an image and we will upload it to IPFS through Heaven API.",
      color = PiratePalette.TextMuted,
      style = MaterialTheme.typography.bodyMedium,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      Button(
        onClick = onPickPhoto,
        modifier = Modifier.weight(1f),
      ) {
        Text("Choose Photo")
      }
      TextButton(
        onClick = onRemovePhoto,
        enabled = avatarUri != null || avatarPreviewBitmap != null,
        modifier = Modifier.weight(1f),
      ) {
        Icon(Icons.Rounded.Delete, contentDescription = null)
        Spacer(Modifier.width(6.dp))
        Text("Remove")
      }
    }
    Button(
      onClick = onDone,
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Done")
    }
  }
}

@Composable
internal fun LanguagesEditorSheet(
  entries: List<ProfileLanguageEntry>,
  onChange: (List<ProfileLanguageEntry>) -> Unit,
  onDone: () -> Unit,
) {
  Column(
    modifier =
      Modifier
        .fillMaxWidth()
        .fillMaxHeight(0.9f)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("Languages", style = MaterialTheme.typography.titleLarge)
    LanguageEditor(
      entries = entries,
      onChange = onChange,
    )
    Button(
      onClick = onDone,
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Done")
    }
  }
}
