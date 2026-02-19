package com.pirate.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val VerifiedBlue = Color(0xFF1D9BF0)

@Composable
fun VerifiedSealBadge(
  modifier: Modifier = Modifier,
  size: Dp = 18.dp,
) {
  Surface(
    modifier = modifier.size(size),
    shape = CircleShape,
    color = VerifiedBlue,
  ) {
    Box(contentAlignment = Alignment.Center) {
      Icon(
        imageVector = Icons.Rounded.Check,
        contentDescription = "Verified",
        tint = Color.White,
        modifier = Modifier.size(size * 0.62f),
      )
    }
  }
}
