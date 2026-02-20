package com.pirate.app.music

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
internal fun PublishingStep(progress: Float) {
  val label = when {
    progress < 0.15f -> "Preparing files..."
    progress < 0.55f -> "Staging audio on Load..."
    progress < 0.90f -> "Running upload policy checks..."
    else -> "Finalizing publish..."
  }

  Column(
    modifier = Modifier.fillMaxSize().padding(32.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(label, style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(24.dp))
    LinearProgressIndicator(
      progress = { progress },
      modifier = Modifier.fillMaxWidth(),
    )
    Spacer(modifier = Modifier.height(12.dp))
    Text("${(progress * 100).toInt()}%", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

@Composable
internal fun SuccessStep(
  result: SongPublishService.PublishResult?,
  formData: SongPublishService.SongFormData? = null,
  onDone: () -> Unit,
) {
  Column(
    modifier = Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.SpaceBetween,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Spacer(modifier = Modifier.height(1.dp))
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Box(
        modifier =
          Modifier
            .size(64.dp)
            .clip(CircleShape)
            .background(Color(0xFF4CAF50)),
        contentAlignment = Alignment.Center,
      ) {
        Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
      }

      Spacer(modifier = Modifier.height(16.dp))
      Text("Song Published!", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
      Spacer(modifier = Modifier.height(20.dp))

      if (result != null && formData?.coverUri != null) {
        coil.compose.AsyncImage(
          model = formData.coverUri,
          contentDescription = "Cover Art",
          modifier =
            Modifier
              .size(120.dp)
              .clip(RoundedCornerShape(12.dp)),
          contentScale = ContentScale.Crop,
        )
        Spacer(modifier = Modifier.height(12.dp))
      }
      if (formData != null) {
        Text(formData.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(formData.artist, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }

    Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
      Text("Done")
    }
  }
}

@Composable
internal fun ErrorStep(
  error: String,
  onRetry: () -> Unit,
) {
  Column(
    modifier = Modifier.fillMaxSize().padding(32.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Box(
      modifier =
        Modifier
          .size(64.dp)
          .clip(CircleShape)
          .background(Color(0xFFF44336)),
      contentAlignment = Alignment.Center,
    ) {
      Icon(Icons.Rounded.Warning, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
    }

    Spacer(modifier = Modifier.height(16.dp))
    Text("Publishing failed", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Spacer(modifier = Modifier.height(12.dp))
    Text(
      error,
      style = MaterialTheme.typography.bodyLarge,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center,
    )
    Spacer(modifier = Modifier.height(32.dp))
    Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
      Text("Try Again")
    }
  }
}

@Composable
internal fun FilePickerButton(
  label: String,
  fileName: String?,
  icon: @Composable () -> Unit,
  onClick: () -> Unit,
) {
  OutlinedButton(
    onClick = onClick,
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
  ) {
    icon()
    Spacer(modifier = Modifier.width(8.dp))
    Text(fileName ?: label, maxLines = 1)
    if (fileName != null) {
      Spacer(modifier = Modifier.width(8.dp))
      Icon(Icons.Rounded.Check, contentDescription = null, tint = Color(0xFF4CAF50), modifier = Modifier.size(20.dp))
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DropdownField(
  label: String,
  options: List<DropdownOption>,
  selectedValue: String,
  onSelect: (String) -> Unit,
) {
  var expanded by remember { mutableStateOf(false) }
  val selectedLabel = options.find { it.value == selectedValue }?.label ?: selectedValue

  ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
    OutlinedTextField(
      value = selectedLabel,
      onValueChange = {},
      readOnly = true,
      label = { Text(label) },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
      modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
    )
    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
      options.forEach { option ->
        DropdownMenuItem(
          text = { Text(option.label) },
          onClick = {
            onSelect(option.value)
            expanded = false
          },
        )
      }
    }
  }
}

@Composable
internal fun SummaryRow(label: String, value: String) {
  Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
  }
}

@Composable
internal fun MonoRow(label: String, value: String) {
  Column {
    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(
      value,
      style = MaterialTheme.typography.bodyMedium,
      fontFamily = FontFamily.Monospace,
      maxLines = 1,
    )
  }
}
