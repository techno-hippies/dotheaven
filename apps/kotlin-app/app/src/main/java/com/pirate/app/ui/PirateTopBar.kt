package com.pirate.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PirateTopBar(
  title: String,
  isAuthenticated: Boolean,
  onAvatarClick: () -> Unit,
) {
  val bg = if (isAuthenticated) {
    MaterialTheme.colorScheme.primaryContainer
  } else {
    MaterialTheme.colorScheme.surfaceVariant
  }
  val fg = if (isAuthenticated) {
    MaterialTheme.colorScheme.onPrimaryContainer
  } else {
    MaterialTheme.colorScheme.onSurfaceVariant
  }

  CenterAlignedTopAppBar(
    title = { Text(title, fontWeight = FontWeight.SemiBold) },
    navigationIcon = {
      IconButton(onClick = onAvatarClick) {
        Surface(
          modifier = Modifier.size(36.dp),
          shape = CircleShape,
          color = bg,
          border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
          Box(contentAlignment = Alignment.Center) {
            Text("P", color = fg, fontWeight = FontWeight.Bold)
          }
        }
      }
    },
    actions = {
      Box(modifier = Modifier.size(48.dp))
    },
  )
}

