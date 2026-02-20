package com.pirate.app.music

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// ── Step 1: Song ─────────────────────────────────────────────────

@Composable
internal fun SongStep(
  formData: SongPublishService.SongFormData,
  onFormChange: (SongPublishService.SongFormData) -> Unit,
  onPickAudio: () -> Unit,
  onPickVocals: () -> Unit,
  onPickInstrumental: () -> Unit,
  onPickCover: () -> Unit,
  getFileName: (Uri?) -> String?,
  onNext: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    // Cover art — square preview or placeholder
    Box(
      modifier = Modifier
        .size(160.dp)
        .align(Alignment.CenterHorizontally)
        .clip(RoundedCornerShape(12.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .border(
          width = 2.dp,
          color = if (formData.coverUri != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline,
          shape = RoundedCornerShape(12.dp),
        )
        .clickable { onPickCover() },
      contentAlignment = Alignment.Center,
    ) {
      if (formData.coverUri != null) {
        coil.compose.AsyncImage(
          model = formData.coverUri,
          contentDescription = "Cover Art",
          modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)),
          contentScale = androidx.compose.ui.layout.ContentScale.Crop,
        )
      } else {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(32.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
          Spacer(modifier = Modifier.height(4.dp))
          Text("Cover Art", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
          Text("Square image", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
        }
      }
    }

    // Title
    OutlinedTextField(
      value = formData.title,
      onValueChange = { onFormChange(formData.copy(title = it)) },
      label = { Text("Song Title") },
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
    )

    // Artist
    OutlinedTextField(
      value = formData.artist,
      onValueChange = { onFormChange(formData.copy(artist = it)) },
      label = { Text("Artist Name") },
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
    )

    // Genre dropdown
    DropdownField(
      label = "Genre",
      options = GENRE_OPTIONS,
      selectedValue = formData.genre,
      onSelect = { onFormChange(formData.copy(genre = it)) },
    )

    // Audio file picker (full mix)
    FilePickerButton(
      label = "Full Mix (MP3/WAV/M4A)",
      fileName = getFileName(formData.audioUri),
      icon = { Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(24.dp)) },
      onClick = onPickAudio,
    )

    // Vocals stem picker (optional, reserved for future alignment pipeline)
    FilePickerButton(
      label = "Vocals Stem (optional)",
      fileName = getFileName(formData.vocalsUri),
      icon = { Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(24.dp)) },
      onClick = onPickVocals,
    )

    // Instrumental track (optional, reserved for future karaoke pipeline)
    FilePickerButton(
      label = "Instrumental Track (optional)",
      fileName = getFileName(formData.instrumentalUri),
      icon = { Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(24.dp)) },
      onClick = onPickInstrumental,
    )

    Spacer(modifier = Modifier.weight(1f))

    Button(
      onClick = onNext,
      modifier = Modifier.fillMaxWidth(),
      enabled = formData.title.isNotBlank() &&
        formData.artist.isNotBlank() &&
        formData.audioUri != null &&
        formData.coverUri != null,
    ) {
      Text("Next")
    }
  }
}

// ── Step 2: Canvas ───────────────────────────────────────────────

@Composable
internal fun CanvasStep(
  formData: SongPublishService.SongFormData,
  onPickCanvas: () -> Unit,
  onClearCanvas: () -> Unit,
  getFileName: (Uri?) -> String?,
  onNext: () -> Unit,
  onSkip: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text(
      "Add an optional canvas video (9:16 aspect ratio, 3-8 seconds).",
      style = MaterialTheme.typography.bodyLarge,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    if (formData.canvasUri != null) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Icon(Icons.Rounded.Videocam, contentDescription = null, modifier = Modifier.size(24.dp))
          Text(getFileName(formData.canvasUri) ?: "video", style = MaterialTheme.typography.bodyLarge)
        }
        IconButton(onClick = onClearCanvas) {
          Icon(Icons.Rounded.Close, contentDescription = "Remove")
        }
      }
    } else {
      FilePickerButton(
        label = "Canvas Video (MP4/WebM)",
        fileName = null,
        icon = { Icon(Icons.Rounded.Videocam, contentDescription = null, modifier = Modifier.size(24.dp)) },
        onClick = onPickCanvas,
      )
    }

    Spacer(modifier = Modifier.weight(1f))

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      OutlinedButton(onClick = onSkip, modifier = Modifier.weight(1f)) {
        Text("Skip")
      }
      Button(onClick = onNext, modifier = Modifier.weight(1f)) {
        Text("Next")
      }
    }
  }
}

// ── Step 3: Details ──────────────────────────────────────────────

@Composable
internal fun DetailsStep(
  formData: SongPublishService.SongFormData,
  onFormChange: (SongPublishService.SongFormData) -> Unit,
  onNext: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    // Primary language
    DropdownField(
      label = "Primary Language",
      options = LANGUAGE_OPTIONS,
      selectedValue = formData.primaryLanguage,
      onSelect = { onFormChange(formData.copy(primaryLanguage = it)) },
    )

    // Secondary language
    DropdownField(
      label = "Secondary Language (optional)",
      options = SECONDARY_LANGUAGE_OPTIONS,
      selectedValue = formData.secondaryLanguage,
      onSelect = { onFormChange(formData.copy(secondaryLanguage = it)) },
    )

    // Lyrics
    OutlinedTextField(
      value = formData.lyrics,
      onValueChange = { onFormChange(formData.copy(lyrics = it)) },
      label = { Text("Lyrics") },
      modifier = Modifier.fillMaxWidth().height(200.dp),
      placeholder = { Text("Paste lyrics here...\n\n[Verse 1]\n...\n[Chorus]\n...") },
    )

    Spacer(modifier = Modifier.weight(1f))

    Button(
      onClick = onNext,
      modifier = Modifier.fillMaxWidth(),
      enabled = formData.primaryLanguage.isNotBlank() && formData.lyrics.isNotBlank(),
    ) {
      Text("Next")
    }
  }
}

// ── Step 4: License & Publish ────────────────────────────────────

@Composable
internal fun LicenseStep(
  formData: SongPublishService.SongFormData,
  onFormChange: (SongPublishService.SongFormData) -> Unit,
  onPublish: () -> Unit,
  getFileName: (Uri?) -> String?,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    // License type
    DropdownField(
      label = "License Type",
      options = LICENSE_OPTIONS,
      selectedValue = formData.license,
      onSelect = { onFormChange(formData.copy(license = it)) },
    )

    // Rev share (only for commercial licenses)
    if (formData.license != "non-commercial") {
      Text("Revenue Share: ${formData.revShare}%", style = MaterialTheme.typography.bodyLarge)
      Slider(
        value = formData.revShare.toFloat(),
        onValueChange = { onFormChange(formData.copy(revShare = it.toInt())) },
        valueRange = 0f..100f,
        steps = 99,
      )
    }

    // Review summary
    Text("Review", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

    Column(
      modifier = Modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(8.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .padding(12.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      SummaryRow("Title", formData.title)
      SummaryRow("Artist", formData.artist)
      SummaryRow("Genre", GENRE_OPTIONS.find { it.value == formData.genre }?.label ?: formData.genre)
      SummaryRow("Language", LANGUAGE_OPTIONS.find { it.value == formData.primaryLanguage }?.label ?: formData.primaryLanguage)
      if (formData.secondaryLanguage.isNotBlank()) {
        SummaryRow("Secondary", LANGUAGE_OPTIONS.find { it.value == formData.secondaryLanguage }?.label ?: formData.secondaryLanguage)
      }
      SummaryRow("Lyrics", if (formData.lyrics.isBlank()) "(instrumental)" else "${formData.lyrics.lines().size} lines")
      SummaryRow("License", LICENSE_OPTIONS.find { it.value == formData.license }?.label ?: formData.license)
      if (formData.license != "non-commercial") {
        SummaryRow("Rev Share", "${formData.revShare}%")
      }
      SummaryRow("Audio", getFileName(formData.audioUri) ?: "—")
      SummaryRow("Instrumental", getFileName(formData.instrumentalUri) ?: "—")
    }

    // Attestation checkbox
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .clickable { onFormChange(formData.copy(attestation = !formData.attestation)) },
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Checkbox(
        checked = formData.attestation,
        onCheckedChange = { onFormChange(formData.copy(attestation = it)) },
      )
      Spacer(modifier = Modifier.width(8.dp))
      Text(
        "I own or have the rights to distribute this work",
        style = MaterialTheme.typography.bodyLarge,
      )
    }

    Button(
      onClick = onPublish,
      modifier = Modifier.fillMaxWidth(),
      enabled = formData.attestation,
    ) {
      Text("Publish")
    }
  }
}
