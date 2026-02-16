package com.pirate.app.chat

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.pirate.app.R
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettMessage
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class ChatView { Conversations, Thread, Scarlett }

private const val SCARLETT_INTRO = "Hey, I'm Scarlett. I will match you with other users who like your music and meet your preferences to make new friends or date!"

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ChatScreen(
  chatService: XmtpChatService,
  scarlettService: ScarlettService,
  voiceController: AgoraVoiceController,
  isAuthenticated: Boolean,
  pkpEthAddress: String?,
  pkpPublicKey: String?,
  litNetwork: String,
  litRpcUrl: String,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
  onNavigateToCall: () -> Unit = {},
) {
  val scope = rememberCoroutineScope()
  val connected by chatService.connected.collectAsState()
  val conversations by chatService.conversations.collectAsState()
  val messages by chatService.messages.collectAsState()
  val activeConversationId by chatService.activeConversationId.collectAsState()

  var currentView by remember { mutableStateOf(ChatView.Conversations) }
  var connecting by remember { mutableStateOf(false) }
  var showNewDm by remember { mutableStateOf(false) }
  var newDmAddress by remember { mutableStateOf("") }
  var newDmBusy by remember { mutableStateOf(false) }
  var newDmError by remember { mutableStateOf<String?>(null) }
  var showDisappearingSheet by remember { mutableStateOf(false) }
  var disappearingRetentionSeconds by remember { mutableStateOf<Long?>(null) }
  var disappearingBusy by remember { mutableStateOf(false) }

  // Auto-connect when authenticated (silently retry on failure)
  LaunchedEffect(isAuthenticated, pkpEthAddress, pkpPublicKey, litNetwork, litRpcUrl) {
    if (isAuthenticated && !connected && !connecting && pkpEthAddress != null && pkpPublicKey != null) {
      connecting = true
      try {
        chatService.connect(pkpEthAddress, pkpPublicKey, litNetwork, litRpcUrl)
      } catch (_: kotlinx.coroutines.CancellationException) {
        throw kotlinx.coroutines.CancellationException("cancelled")
      } catch (_: Exception) {
        // Silently fail — user can retry by navigating back to chat
      } finally {
        connecting = false
      }
    }
  }

  // Sync view state with active conversation
  LaunchedEffect(activeConversationId) {
    currentView = if (activeConversationId != null) ChatView.Thread else ChatView.Conversations
    showDisappearingSheet = false
    disappearingRetentionSeconds = chatService.activeDisappearingSeconds()
  }

  Box(modifier = Modifier.fillMaxSize()) {
    when {
      currentView == ChatView.Scarlett -> {
        ScarlettThread(
          scarlettService = scarlettService,
          voiceController = voiceController,
          wallet = pkpEthAddress,
          pkpPublicKey = pkpPublicKey,
          litNetwork = litNetwork,
          litRpcUrl = litRpcUrl,
          onBack = { currentView = ChatView.Conversations },
          onShowMessage = onShowMessage,
          onNavigateToCall = onNavigateToCall,
        )
      }
      currentView == ChatView.Thread && activeConversationId != null -> {
        val peerAddress = conversations.find { it.id == activeConversationId }?.peerAddress ?: ""
        MessageThread(
          messages = messages,
          peerAddress = peerAddress,
          onBack = {
            chatService.closeConversation()
            currentView = ChatView.Conversations
          },
          onSend = { text ->
            scope.launch {
              try {
                chatService.sendMessage(text)
              } catch (e: Exception) {
                onShowMessage("Send failed: ${e.message}")
              }
            }
          },
          onOpenSettings = { showDisappearingSheet = true },
        )
      }

      else -> {
        ConversationList(
          conversations = conversations,
          scarlettService = scarlettService,
          isAuthenticated = isAuthenticated,
          xmtpConnecting = connecting,
          showNewDm = showNewDm,
          newDmAddress = newDmAddress,
          newDmBusy = newDmBusy,
          newDmError = newDmError,
          onNewDmAddressChange = { newDmAddress = it },
          onToggleNewDm = { showNewDm = !showNewDm },
          onOpenScarlett = { currentView = ChatView.Scarlett },
          onCreateDm = {
            if (newDmAddress.isNotBlank()) {
              scope.launch {
                try {
                  newDmBusy = true
                  newDmError = null
                  val convId = chatService.newDm(newDmAddress.trim())
                  if (convId != null) {
                    chatService.openConversation(convId)
                    newDmAddress = ""
                    showNewDm = false
                  }
                } catch (e: Exception) {
                  val msg = e.message ?: "Unknown error"
                  newDmError = msg
                  onShowMessage("New DM failed: $msg")
                } finally {
                  newDmBusy = false
                }
              }
            }
          },
          onOpenConversation = { convId ->
            scope.launch {
              chatService.openConversation(convId)
            }
          },
          onOpenDrawer = onOpenDrawer,
          onRefresh = {
            scope.launch { chatService.refreshConversations() }
          },
        )
      }
    }

    if (showDisappearingSheet) {
      val options =
        listOf(
          "Off" to null,
          "5 minutes" to 5L * 60L,
          "1 hour" to 60L * 60L,
          "1 day" to 24L * 60L * 60L,
          "7 days" to 7L * 24L * 60L * 60L,
        )

      ModalBottomSheet(
        onDismissRequest = { showDisappearingSheet = false },
      ) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
          Text(
            text = "Disappearing messages",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          )
          options.forEach { (label, seconds) ->
            val selected = disappearingRetentionSeconds == seconds
            ListItem(
              headlineContent = { Text(label) },
              leadingContent = { Icon(Icons.Rounded.Timer, contentDescription = null) },
              trailingContent = {
                RadioButton(
                  selected = selected,
                  onClick = null,
                  enabled = !disappearingBusy,
                )
              },
              modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = !disappearingBusy) {
                  scope.launch {
                    disappearingBusy = true
                    runCatching { chatService.setActiveDisappearingSeconds(seconds) }
                      .onSuccess {
                        disappearingRetentionSeconds = seconds
                        showDisappearingSheet = false
                      }
                      .onFailure { e ->
                        onShowMessage("Failed to update disappearing messages: ${e.message}")
                      }
                    disappearingBusy = false
                  }
                },
            )
          }
        }
      }
    }
  }
}

@Composable
private fun NotAuthenticatedPlaceholder() {
  Box(
    modifier = Modifier.fillMaxSize(),
    contentAlignment = Alignment.Center,
  ) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Icon(
        Icons.Rounded.Person,
        contentDescription = null,
        modifier = Modifier.size(48.dp),
        tint = PiratePalette.TextMuted,
      )
      Spacer(modifier = Modifier.height(16.dp))
      Text("Sign in to chat", color = PiratePalette.TextMuted)
    }
  }
}

@Composable
private fun ConnectingPlaceholder() {
  Box(
    modifier = Modifier.fillMaxSize(),
    contentAlignment = Alignment.Center,
  ) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      CircularProgressIndicator(modifier = Modifier.size(32.dp))
      Spacer(modifier = Modifier.height(16.dp))
      Text("Connecting to XMTP...", color = PiratePalette.TextMuted)
    }
  }
}

@Composable
private fun ConversationList(
  conversations: List<ConversationItem>,
  scarlettService: ScarlettService,
  isAuthenticated: Boolean,
  xmtpConnecting: Boolean,
  showNewDm: Boolean,
  newDmAddress: String,
  newDmBusy: Boolean,
  newDmError: String?,
  onNewDmAddressChange: (String) -> Unit,
  onToggleNewDm: () -> Unit,
  onOpenScarlett: () -> Unit,
  onCreateDm: () -> Unit,
  onOpenConversation: (String) -> Unit,
  onOpenDrawer: () -> Unit,
  onRefresh: () -> Unit,
) {
  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "Chat",
      isAuthenticated = true,
      onAvatarPress = onOpenDrawer,
      rightSlot = {
        if (isAuthenticated) {
          IconButton(onClick = onToggleNewDm) {
            Icon(Icons.Rounded.Add, contentDescription = "New DM")
          }
        }
      },
    )

    if (showNewDm) {
      Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        OutlinedTextField(
          value = newDmAddress,
          onValueChange = onNewDmAddressChange,
          modifier = Modifier.weight(1f),
          placeholder = { Text("Ethereum address or inbox ID") },
          singleLine = true,
        )
        Spacer(modifier = Modifier.width(8.dp))
        Button(onClick = onCreateDm, enabled = newDmAddress.isNotBlank() && !newDmBusy) {
          Text("Chat")
        }
      }
      if (!newDmError.isNullOrBlank()) {
        Text(
          text = newDmError,
          color = MaterialTheme.colorScheme.error,
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
      }
    }

    LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
      // Scarlett pinned at top
      item(key = "scarlett") {
        val scarlettMessages by scarlettService.messages.collectAsState()
        val lastScarlettMsg = scarlettMessages.lastOrNull()
        ScarlettConversationRow(
          lastMessage = lastScarlettMsg?.content,
          onClick = onOpenScarlett,
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
      }

      if (conversations.isEmpty()) {
        item {
          Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
            contentAlignment = Alignment.Center,
          ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
              if (!isAuthenticated) {
                Text("Sign in to message other users", color = PiratePalette.TextMuted)
              }
            }
          }
        }
      } else {
        items(conversations, key = { it.id }) { convo ->
          ConversationRow(
            conversation = convo,
            onClick = { onOpenConversation(convo.id) },
          )
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
      }
    }
  }
}

@Composable
private fun ConversationRow(
  conversation: ConversationItem,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    // Avatar placeholder
    Surface(
      modifier = Modifier.size(48.dp),
      shape = CircleShape,
      color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
      Box(contentAlignment = Alignment.Center) {
        Text(
          text = conversation.peerAddress.take(2).uppercase(),
          style = MaterialTheme.typography.bodyLarge,
          fontWeight = FontWeight.Bold,
        )
      }
    }

    Spacer(modifier = Modifier.width(12.dp))

    Column(modifier = Modifier.weight(1f)) {
      Text(
        text = abbreviateAddress(conversation.peerAddress),
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (conversation.lastMessage.isNotBlank()) {
        Text(
          text = conversation.lastMessage,
          color = PiratePalette.TextMuted,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
      }
    }

    if (conversation.lastMessageTimestampMs > 0) {
      Text(
        text = formatTimestamp(conversation.lastMessageTimestampMs),
        color = PiratePalette.TextMuted,
        style = MaterialTheme.typography.bodySmall,
      )
    }
  }
}

@Composable
private fun MessageThread(
  messages: List<ChatMessage>,
  peerAddress: String,
  onBack: () -> Unit,
  onSend: (String) -> Unit,
  onOpenSettings: () -> Unit,
) {
  var inputText by remember { mutableStateOf("") }
  val listState = rememberLazyListState()

  // Scroll to bottom when messages change
  LaunchedEffect(messages.size) {
    if (messages.isNotEmpty()) {
      listState.animateScrollToItem(messages.size - 1)
    }
  }

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = abbreviateAddress(peerAddress),
      onBackPress = onBack,
      isAuthenticated = true,
      rightSlot = {
        IconButton(onClick = onOpenSettings) {
          Icon(Icons.Rounded.MoreVert, contentDescription = "Settings")
        }
      },
    )

    // Messages
    LazyColumn(
      modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
      state = listState,
      verticalArrangement = Arrangement.spacedBy(4.dp),
      contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
    ) {
      items(messages, key = { it.id }) { msg ->
        MessageBubble(message = msg)
      }
    }

    // Input bar
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .navigationBarsPadding()
        .imePadding()
        .padding(horizontal = 12.dp, vertical = 8.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      OutlinedTextField(
        value = inputText,
        onValueChange = { inputText = it },
        modifier = Modifier.weight(1f),
        placeholder = { Text("Message") },
        singleLine = true,
        shape = RoundedCornerShape(24.dp),
      )
      Spacer(modifier = Modifier.width(8.dp))
      IconButton(
        onClick = {
          if (inputText.isNotBlank()) {
            onSend(inputText.trim())
            inputText = ""
          }
        },
        enabled = inputText.isNotBlank(),
      ) {
        Icon(
          Icons.AutoMirrored.Rounded.Send,
          contentDescription = "Send",
          tint = if (inputText.isNotBlank()) MaterialTheme.colorScheme.primary
          else PiratePalette.TextMuted,
        )
      }
    }
  }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
  val alignment = if (message.isFromMe) Alignment.End else Alignment.Start
  val bgColor = if (message.isFromMe) MaterialTheme.colorScheme.primary
  else MaterialTheme.colorScheme.surfaceVariant
  val textColor = if (message.isFromMe) MaterialTheme.colorScheme.onPrimary
  else MaterialTheme.colorScheme.onSurfaceVariant

  Column(
    modifier = Modifier.fillMaxWidth(),
    horizontalAlignment = alignment,
  ) {
    Surface(
      shape = RoundedCornerShape(16.dp),
      color = bgColor,
      modifier = Modifier.widthIn(max = 280.dp),
    ) {
      Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(
          text = message.text,
          color = textColor,
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
          text = formatTime(message.timestampMs),
          style = MaterialTheme.typography.labelSmall,
          color = textColor.copy(alpha = 0.7f),
        )
      }
    }
  }
}

@Composable
private fun ScarlettConversationRow(
  lastMessage: String?,
  onClick: () -> Unit,
) {
  val accentPurple = androidx.compose.ui.graphics.Color(0xFFCBA6F7)

  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp, vertical = 12.dp),
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
private fun ScarlettThread(
  scarlettService: ScarlettService,
  voiceController: AgoraVoiceController,
  wallet: String?,
  pkpPublicKey: String?,
  litNetwork: String,
  litRpcUrl: String,
  onBack: () -> Unit,
  onShowMessage: (String) -> Unit,
  onNavigateToCall: () -> Unit,
) {
  val context = LocalContext.current
  val messages by scarlettService.messages.collectAsState()
  val sending by scarlettService.sending.collectAsState()
  val voiceState by voiceController.state.collectAsState()
  var inputText by remember { mutableStateOf("") }
  val listState = rememberLazyListState()
  val scope = rememberCoroutineScope()
  val accentPurple = androidx.compose.ui.graphics.Color(0xFFCBA6F7)

  // Mic permission launcher
  val micPermissionLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.RequestPermission(),
  ) { granted ->
    if (granted && wallet != null && pkpPublicKey != null) {
      voiceController.startCall(wallet, pkpPublicKey, litNetwork, litRpcUrl)
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
    if (wallet == null || pkpPublicKey == null) {
      onShowMessage("Sign in to chat with Scarlett")
      return
    }
    inputText = ""
    scope.launch {
      val result = scarlettService.sendMessage(text, wallet, pkpPublicKey, litNetwork, litRpcUrl)
      result.onFailure { e ->
        onShowMessage("Scarlett: ${e.message ?: "Error"}")
      }
    }
  }

  fun startVoiceCall() {
    if (wallet == null || pkpPublicKey == null) {
      onShowMessage("Sign in to call Scarlett")
      return
    }
    // Check mic permission first
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
      == PackageManager.PERMISSION_GRANTED
    ) {
      voiceController.startCall(wallet, pkpPublicKey, litNetwork, litRpcUrl)
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

    // Messages
    LazyColumn(
      modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
      state = listState,
      verticalArrangement = Arrangement.spacedBy(4.dp),
      contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
    ) {
      if (messages.isEmpty()) {
        item {
          // Show intro message as a Scarlett bubble
          ScarlettMessageBubble(
            ScarlettMessage(
              id = "intro",
              role = "assistant",
              content = SCARLETT_INTRO,
              timestamp = 0L,
            )
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

    // Input bar
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .navigationBarsPadding()
        .imePadding()
        .padding(horizontal = 12.dp, vertical = 8.dp),
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
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
          imeAction = androidx.compose.ui.text.input.ImeAction.Send,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(
          onSend = { doSend() },
        ),
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
private fun ScarlettMessageBubble(msg: ScarlettMessage) {
  val isUser = msg.role == "user"
  val bgColor = if (isUser) MaterialTheme.colorScheme.primary
  else MaterialTheme.colorScheme.surfaceVariant
  val textColor = if (isUser) MaterialTheme.colorScheme.onPrimary
  else MaterialTheme.colorScheme.onSurfaceVariant

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

private fun abbreviateAddress(address: String): String {
  if (address.length <= 12) return address
  if (address.startsWith("0x") && address.length >= 10) {
    return "${address.take(6)}...${address.takeLast(4)}"
  }
  return "${address.take(8)}...${address.takeLast(4)}"
}

private fun formatTimestamp(ms: Long): String {
  val now = System.currentTimeMillis()
  val diff = now - ms
  return when {
    diff < 60_000 -> "now"
    diff < 3600_000 -> "${diff / 60_000}m"
    diff < 86400_000 -> "${diff / 3600_000}h"
    else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(ms))
  }
}

private fun formatTime(ms: Long): String {
  return SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(ms))
}
