package com.pirate.app.scarlett

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MicOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private val AccentPurple = Color(0xFFCBA6F7)
private val EndCallRed = Color(0xFFE57373)

@Composable
fun ScarlettVoiceBar(controller: AgoraVoiceController, onOpen: (() -> Unit)? = null) {
  val state by controller.state.collectAsState()
  val isMuted by controller.isMuted.collectAsState()
  val duration by controller.durationSeconds.collectAsState()
  val isBotSpeaking by controller.isBotSpeaking.collectAsState()

  // Only show when connecting or connected
  if (state != VoiceCallState.Connecting && state != VoiceCallState.Connected) return

  Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)
    .clickable { onOpen?.invoke() }) {
    // Purple accent line at top
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .height(2.dp)
        .background(if (isBotSpeaking) AccentPurple else AccentPurple.copy(alpha = 0.4f)),
    )

    Row(
      modifier = Modifier
        .fillMaxWidth()
        .height(56.dp)
        .padding(horizontal = 12.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      // Avatar with speaking indicator
      SpeakingAvatar(isBotSpeaking = isBotSpeaking, isConnecting = state == VoiceCallState.Connecting)

      // Info
      Column(modifier = Modifier.weight(1f)) {
        Text(
          text = "Scarlett",
          fontWeight = FontWeight.Medium,
          color = AccentPurple,
          style = MaterialTheme.typography.bodyLarge,
        )
        Text(
          text = when (state) {
            VoiceCallState.Connecting -> "Connecting..."
            VoiceCallState.Connected -> formatDuration(duration)
            else -> ""
          },
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          style = MaterialTheme.typography.bodyLarge,
        )
      }

      // Mute button
      if (state == VoiceCallState.Connected) {
        Surface(
          shape = RoundedCornerShape(999.dp),
          color = if (isMuted) MaterialTheme.colorScheme.errorContainer
          else MaterialTheme.colorScheme.surfaceVariant,
        ) {
          IconButton(onClick = { controller.toggleMute() }) {
            Icon(
              if (isMuted) Icons.Rounded.MicOff else Icons.Rounded.Mic,
              contentDescription = if (isMuted) "Unmute" else "Mute",
              tint = if (isMuted) MaterialTheme.colorScheme.error
              else MaterialTheme.colorScheme.onSurface,
              modifier = Modifier.size(20.dp),
            )
          }
        }
      }

      // End call button
      Surface(
        shape = RoundedCornerShape(999.dp),
        color = EndCallRed,
      ) {
        IconButton(onClick = { controller.endCall() }) {
          Icon(
            Icons.Rounded.CallEnd,
            contentDescription = "End call",
            tint = Color.White,
            modifier = Modifier.size(20.dp),
          )
        }
      }
    }

    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
  }
}

@Composable
private fun SpeakingAvatar(isBotSpeaking: Boolean, isConnecting: Boolean) {
  val bgColor by animateColorAsState(
    targetValue = if (isBotSpeaking) AccentPurple else AccentPurple.copy(alpha = 0.6f),
    label = "avatarBg",
  )

  val pulseTransition = rememberInfiniteTransition(label = "pulse")
  val pulseAlpha by pulseTransition.animateFloat(
    initialValue = 1f,
    targetValue = 0.4f,
    animationSpec = infiniteRepeatable(tween(600), RepeatMode.Reverse),
    label = "pulseAlpha",
  )

  Box(contentAlignment = Alignment.Center) {
    Surface(
      modifier = Modifier
        .size(40.dp)
        .then(if (isBotSpeaking) Modifier.alpha(pulseAlpha) else Modifier),
      shape = CircleShape,
      color = bgColor,
    ) {
      Box(contentAlignment = Alignment.Center) {
        if (isConnecting) {
          CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            strokeWidth = 2.dp,
            color = Color.White,
          )
        } else {
          Text(
            text = "S",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = Color.Black,
          )
        }
      }
    }
  }
}

private fun formatDuration(seconds: Int): String {
  val m = seconds / 60
  val s = seconds % 60
  return "%d:%02d".format(m, s)
}
