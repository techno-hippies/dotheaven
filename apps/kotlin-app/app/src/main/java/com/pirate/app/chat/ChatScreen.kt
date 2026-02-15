package com.pirate.app.chat

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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class ChatView { Conversations, Thread }

@Composable
fun ChatScreen(
  chatService: XmtpChatService,
  isAuthenticated: Boolean,
  pkpEthAddress: String?,
  pkpPublicKey: String?,
  litNetwork: String,
  litRpcUrl: String,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
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

  // Auto-connect when authenticated
  LaunchedEffect(isAuthenticated, connected) {
    if (isAuthenticated && !connected && !connecting && pkpEthAddress != null && pkpPublicKey != null) {
      connecting = true
      try {
        chatService.connect(pkpEthAddress, pkpPublicKey, litNetwork, litRpcUrl)
      } catch (e: Exception) {
        onShowMessage("Chat connect failed: ${e.message}")
      } finally {
        connecting = false
      }
    }
  }

  // Sync view state with active conversation
  LaunchedEffect(activeConversationId) {
    currentView = if (activeConversationId != null) ChatView.Thread else ChatView.Conversations
  }

  when {
    !isAuthenticated -> NotAuthenticatedPlaceholder()
    connecting -> ConnectingPlaceholder()
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
      )
    }
    else -> {
      ConversationList(
        conversations = conversations,
        showNewDm = showNewDm,
        newDmAddress = newDmAddress,
        onNewDmAddressChange = { newDmAddress = it },
        onToggleNewDm = { showNewDm = !showNewDm },
        onCreateDm = {
          if (newDmAddress.isNotBlank()) {
            scope.launch {
              try {
                val convId = chatService.newDm(newDmAddress.trim())
                if (convId != null) {
                  chatService.openConversation(convId)
                  newDmAddress = ""
                  showNewDm = false
                }
              } catch (e: Exception) {
                onShowMessage("New DM failed: ${e.message}")
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
  showNewDm: Boolean,
  newDmAddress: String,
  onNewDmAddressChange: (String) -> Unit,
  onToggleNewDm: () -> Unit,
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
        IconButton(onClick = onToggleNewDm) {
          Icon(Icons.Rounded.Add, contentDescription = "New DM")
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
        Button(onClick = onCreateDm, enabled = newDmAddress.isNotBlank()) {
          Text("Chat")
        }
      }
    }

    if (conversations.isEmpty()) {
      Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
      ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          Text("No conversations yet", color = PiratePalette.TextMuted)
          Spacer(modifier = Modifier.height(8.dp))
          OutlinedButton(onClick = onToggleNewDm) {
            Text("Start a conversation")
          }
        }
      }
    } else {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
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
