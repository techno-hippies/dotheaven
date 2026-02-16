package com.pirate.app.onboarding.steps

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun DoneStep(
  claimedName: String,
  onFinished: () -> Unit,
) {
  LaunchedEffect(Unit) {
    delay(1500)
    onFinished()
  }

  Column(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.Start,
  ) {
    Spacer(Modifier.height(48.dp))
    Icon(
      Icons.Rounded.CheckCircle,
      contentDescription = "Done",
      modifier = Modifier.size(64.dp),
      tint = Color(0xFFA6E3A1), // catppuccin green
    )
    Spacer(Modifier.height(24.dp))
    Text(
      "You're all set!",
      fontSize = 28.sp,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onBackground,
    )
    Spacer(Modifier.height(8.dp))
    Text(
      "Welcome to Pirate, $claimedName",
      fontSize = 18.sp,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
  }
}
