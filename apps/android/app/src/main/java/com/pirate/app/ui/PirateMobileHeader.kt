package com.pirate.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PirateMobileHeader(
  title: String,
  isAuthenticated: Boolean = false,
  onAvatarPress: (() -> Unit)? = null,
  onBackPress: (() -> Unit)? = null,
  onClosePress: (() -> Unit)? = null,
  rightSlot: (@Composable () -> Unit)? = null,
) {
  Surface(color = MaterialTheme.colorScheme.background) {
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .statusBarsPadding()
        .padding(horizontal = 16.dp)
        .padding(top = 8.dp, bottom = 6.dp)
        .heightIn(min = 56.dp),
    ) {
      if (onBackPress != null) {
        IconButton(
          modifier = Modifier.align(Alignment.CenterStart),
          onClick = onBackPress,
        ) {
          Icon(
            Icons.AutoMirrored.Rounded.ArrowBack,
            contentDescription = "Back",
            tint = MaterialTheme.colorScheme.onBackground,
          )
        }
      } else if (onClosePress != null) {
        IconButton(
          modifier = Modifier.align(Alignment.CenterStart),
          onClick = onClosePress,
        ) {
          Icon(
            Icons.Rounded.Close,
            contentDescription = "Close",
            tint = MaterialTheme.colorScheme.onBackground,
          )
        }
      } else {
        IconButton(
          modifier = Modifier.align(Alignment.CenterStart),
          enabled = onAvatarPress != null,
          onClick = { onAvatarPress?.invoke() },
        ) {
          val bg = if (isAuthenticated) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
          val fg = if (isAuthenticated) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
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
      }

      Text(
        title,
        modifier = Modifier.align(Alignment.Center),
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground,
        style = MaterialTheme.typography.titleLarge,
      )

      Box(modifier = Modifier.align(Alignment.CenterEnd)) {
        rightSlot?.invoke() ?: Spacer(modifier = Modifier.size(36.dp))
      }
    }
  }
}
