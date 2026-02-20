package com.pirate.app.chat

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.pirate.app.R
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettMessage
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import kotlinx.coroutines.launch

@Composable
internal fun ScarlettConversationRow(
  lastMessage: String?,
  onClick: () -> Unit,
) {
  val accentPurple = Color(0xFFCBA6F7)

  Row(
    modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Image(
      painter = painterResource(R.drawable.scarlett_avatar),
      contentDescription = "Scarlett",
      modifier = Modifier.size(48.dp).clip(CircleShape),
      contentScale = ContentScale.Crop,
    )

    Spacer(modifier = Modifier.width(12.dp))

    Column(modifier = Modifier.weight(1f)) {
      Text(
        text = "Scarlett",
        fontWeight = FontWeight.Medium,
        color = accentPurple,
      )
      Text(
        text = lastMessage ?: SCARLETT_INTRO,
        color = PiratePalette.TextMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
  }
}

@Composable
internal fun ScarlettThread(
  scarlettService: ScarlettService,
  voiceController: AgoraVoiceController,
  wallet: String?,
  onBack: () -> Unit,
  onShowMessage: (String) -> Unit,
  onNavigateToCall: () -> Unit,
) {
  val context = androidx.compose.ui.platform.LocalContext.current
  val messages by scarlettService.messages.collectAsState()
  val sending by scarlettService.sending.collectAsState()
  val voiceState by voiceController.state.collectAsState()
  var inputText by remember { mutableStateOf("") }
  val listState = rememberLazyListState()
  val scope = rememberCoroutineScope()
  val accentPurple = Color(0xFFCBA6F7)

  val micPermissionLauncher =
    rememberLauncherForActivityResult(
      ActivityResultContracts.RequestPermission(),
    ) { granted ->
      if (granted && wallet != null) {
        voiceController.startCall(wallet)
        onNavigateToCall()
      } else if (!granted) {
        onShowMessage("Microphone permission is required for voice calls")
      }
    }

  LaunchedEffect(messages.size) {
    if (messages.isNotEmpty()) {
      listState.animateScrollToItem(messages.size - 1)
    }
  }

  fun doSend() {
    val text = inputText.trim()
    if (text.isBlank() || sending) return
    if (wallet == null) {
      onShowMessage("Sign in to chat with Scarlett")
      return
    }
    inputText = ""
    scope.launch {
      val result = scarlettService.sendMessage(text, wallet)
      result.onFailure { e ->
        onShowMessage("Scarlett: ${e.message ?: "Error"}")
      }
    }
  }

  fun startVoiceCall() {
    if (wallet == null) {
      onShowMessage("Sign in to call Scarlett")
      return
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      voiceController.startCall(wallet)
      onNavigateToCall()
    } else {
      micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }
  }

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "Scarlett",
      onBackPress = onBack,
      isAuthenticated = true,
      rightSlot = {
        if (voiceState == VoiceCallState.Idle || voiceState == VoiceCallState.Error) {
          IconButton(onClick = { startVoiceCall() }) {
            Icon(
              Icons.Rounded.Call,
              contentDescription = "Voice call",
              tint = accentPurple,
            )
          }
        }
      },
    )

    LazyColumn(
      modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
      state = listState,
      verticalArrangement = Arrangement.spacedBy(4.dp),
      contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
    ) {
      if (messages.isEmpty()) {
        item {
          ScarlettMessageBubble(
            ScarlettMessage(
              id = "intro",
              role = "assistant",
              content = SCARLETT_INTRO,
              timestamp = 0L,
            ),
          )
        }
      }
      items(messages, key = { it.id }) { msg ->
        ScarlettMessageBubble(msg)
      }
      if (sending) {
        item {
          Row(modifier = Modifier.padding(vertical = 8.dp)) {
            CircularProgressIndicator(
              modifier = Modifier.size(20.dp),
              strokeWidth = 2.dp,
              color = accentPurple,
            )
            Spacer(Modifier.width(8.dp))
            Text("Scarlett is thinking...", color = PiratePalette.TextMuted)
          }
        }
      }
    }

    Row(
      modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      OutlinedTextField(
        value = inputText,
        onValueChange = { inputText = it },
        modifier = Modifier.weight(1f),
        placeholder = { Text("Message Scarlett") },
        singleLine = true,
        shape = RoundedCornerShape(24.dp),
        enabled = !sending,
        keyboardOptions = KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Send),
        keyboardActions = KeyboardActions(onSend = { doSend() }),
      )
      Spacer(modifier = Modifier.width(8.dp))
      IconButton(
        onClick = { doSend() },
        enabled = inputText.isNotBlank() && !sending,
      ) {
        Icon(
          Icons.AutoMirrored.Rounded.Send,
          contentDescription = "Send",
          tint = if (inputText.isNotBlank() && !sending) accentPurple else PiratePalette.TextMuted,
        )
      }
    }
  }
}

@Composable
internal fun ScarlettMessageBubble(msg: ScarlettMessage) {
  val isUser = msg.role == "user"
  val bgColor = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
  val textColor = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant

  Column(
    modifier = Modifier.fillMaxWidth(),
    horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
  ) {
    Surface(
      shape = RoundedCornerShape(16.dp),
      color = bgColor,
      modifier = Modifier.widthIn(max = 280.dp),
    ) {
      Text(
        text = msg.content,
        color = textColor,
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
      )
    }
  }
}
