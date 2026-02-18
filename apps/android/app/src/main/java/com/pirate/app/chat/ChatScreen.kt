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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.pirate.app.music.CoverRef
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettMessage
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import org.xmtp.android.library.libxmtp.PermissionOption
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class ChatView { Conversations, Thread, Scarlett }
private enum class ComposerTab { Dm, Group }

private const val SCARLETT_INTRO = "Hey, I'm Scarlett. I will match you with other users who like your music and meet your preferences to make new friends or date!"

private data class DmSuggestion(
  val title: String,
  val subtitle: String,
  val inputValue: String,
  val avatarUri: String?,
)

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ChatScreen(
  chatService: XmtpChatService,
  scarlettService: ScarlettService,
  voiceController: AgoraVoiceController,
  isAuthenticated: Boolean,
  userAddress: String?,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
  onNavigateToCall: () -> Unit = {},
  onThreadVisibilityChange: (Boolean) -> Unit = {},
) {
  val scope = rememberCoroutineScope()
  val connected by chatService.connected.collectAsState()
  val conversations by chatService.conversations.collectAsState()
  val messages by chatService.messages.collectAsState()
  val activeConversationId by chatService.activeConversationId.collectAsState()
  val activeConversation =
    remember(activeConversationId, conversations) {
      conversations.find { it.id == activeConversationId }
    }

  var currentView by remember { mutableStateOf(ChatView.Conversations) }
  var connecting by remember { mutableStateOf(false) }
  var showComposerSheet by remember { mutableStateOf(false) }
  var composerTab by remember { mutableStateOf(ComposerTab.Dm) }
  var newDmAddress by remember { mutableStateOf("") }
  var newDmBusy by remember { mutableStateOf(false) }
  var newDmError by remember { mutableStateOf<String?>(null) }
  var newGroupName by remember { mutableStateOf("") }
  var newGroupDescription by remember { mutableStateOf("") }
  var newGroupImageUrl by remember { mutableStateOf("") }
  var newGroupAppData by remember { mutableStateOf("") }
  var newGroupMembers by remember { mutableStateOf("") }
  var newGroupPermissionMode by remember { mutableStateOf(GroupPermissionMode.ALL_MEMBERS) }
  var newGroupBusy by remember { mutableStateOf(false) }
  var newGroupError by remember { mutableStateOf<String?>(null) }
  var showSettingsSheet by remember { mutableStateOf(false) }
  var disappearingRetentionSeconds by remember { mutableStateOf<Long?>(null) }
  var disappearingBusy by remember { mutableStateOf(false) }
  var groupMetaName by remember { mutableStateOf("") }
  var groupMetaDescription by remember { mutableStateOf("") }
  var groupMetaImageUrl by remember { mutableStateOf("") }
  var groupMetaAppData by remember { mutableStateOf("") }
  var groupMetaBusy by remember { mutableStateOf(false) }
  var groupMetaError by remember { mutableStateOf<String?>(null) }
  var groupPermissionAddMembers by remember { mutableStateOf(PermissionOption.Admin) }
  var groupPermissionMetadata by remember { mutableStateOf(PermissionOption.Allow) }
  var groupPermissionBusy by remember { mutableStateOf(false) }
  var groupPermissionError by remember { mutableStateOf<String?>(null) }
  val dmSuggestions = remember(conversations, newDmAddress, showComposerSheet, composerTab, activeConversationId) {
    if (showComposerSheet && composerTab == ComposerTab.Dm) {
      buildDmSuggestions(
        conversations = conversations,
        query = newDmAddress,
        excludeConversationId = activeConversationId,
      )
    } else {
      emptyList()
    }
  }

  // Auto-connect when authenticated (silently retry on failure)
  LaunchedEffect(isAuthenticated, userAddress) {
    if (isAuthenticated && !connected && !connecting && userAddress != null) {
      connecting = true
      try {
        chatService.connect(userAddress)
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
    showSettingsSheet = false
    disappearingRetentionSeconds = chatService.activeDisappearingSeconds()
  }

  val inThread = currentView == ChatView.Thread || currentView == ChatView.Scarlett || activeConversationId != null
  LaunchedEffect(inThread) {
    onThreadVisibilityChange(inThread)
  }

  Box(modifier = Modifier.fillMaxSize()) {
    when {
      currentView == ChatView.Scarlett -> {
        ScarlettThread(
          scarlettService = scarlettService,
          voiceController = voiceController,
          wallet = userAddress,
          onBack = { currentView = ChatView.Conversations },
          onShowMessage = onShowMessage,
          onNavigateToCall = onNavigateToCall,
        )
      }
      currentView == ChatView.Thread && activeConversationId != null -> {
        if (activeConversation == null) {
          ConnectingPlaceholder()
        } else {
          MessageThread(
            messages = messages,
            conversation = activeConversation,
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
            onOpenSettings = {
              showSettingsSheet = true
              if (activeConversation.type == ConversationType.GROUP) {
                scope.launch {
                  groupMetaBusy = true
                  groupMetaError = null
                  groupPermissionBusy = true
                  groupPermissionError = null
                  runCatching { chatService.getActiveGroupMetadata() }
                    .onSuccess { meta ->
                      if (meta != null) {
                        groupMetaName = meta.name
                        groupMetaDescription = meta.description
                        groupMetaImageUrl = meta.imageUrl
                        groupMetaAppData = meta.appData
                      }
                    }
                    .onFailure { err ->
                      groupMetaError = err.message ?: "Failed to load group settings"
                    }
                  runCatching { chatService.getActiveGroupPermissionPolicySet() }
                    .onSuccess { policy ->
                      if (policy != null) {
                        groupPermissionAddMembers = policy.addMemberPolicy
                        groupPermissionMetadata = policy.updateGroupNamePolicy
                      }
                    }
                    .onFailure { err ->
                      groupPermissionError = err.message ?: "Failed to load group permissions"
                    }
                  groupMetaBusy = false
                  groupPermissionBusy = false
                }
              }
            },
          )
        }
      }

      else -> {
        ConversationList(
          conversations = conversations,
          scarlettService = scarlettService,
          isAuthenticated = isAuthenticated,
          xmtpConnecting = connecting,
          onOpenScarlett = { currentView = ChatView.Scarlett },
          onOpenComposer = {
            composerTab = ComposerTab.Dm
            newDmError = null
            newGroupError = null
            showComposerSheet = true
          },
          onOpenConversation = { convId ->
            scope.launch {
              chatService.openConversation(convId)
            }
          },
          onOpenDrawer = onOpenDrawer,
        )
      }
    }

    if (showComposerSheet) {
      ModalBottomSheet(
        onDismissRequest = { showComposerSheet = false },
      ) {
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(bottom = 16.dp)
            .padding(horizontal = 16.dp),
        ) {
          Text(
            text = "New conversation",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
          )
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
          ) {
            OutlinedButton(
              onClick = { composerTab = ComposerTab.Dm },
              modifier = Modifier.weight(1f),
              enabled = !newDmBusy && !newGroupBusy,
            ) {
              Text(if (composerTab == ComposerTab.Dm) "DM ✓" else "Direct message")
            }
            OutlinedButton(
              onClick = { composerTab = ComposerTab.Group },
              modifier = Modifier.weight(1f),
              enabled = !newDmBusy && !newGroupBusy,
            ) {
              Text(if (composerTab == ComposerTab.Group) "Group ✓" else "Group")
            }
          }
          Spacer(modifier = Modifier.height(12.dp))

          if (composerTab == ComposerTab.Dm) {
            OutlinedTextField(
              value = newDmAddress,
              onValueChange = { newDmAddress = it },
              modifier = Modifier.fillMaxWidth(),
              placeholder = { Text("Search by name or paste address") },
              singleLine = true,
              enabled = !newDmBusy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
              onClick = {
                val target = newDmAddress.trim()
                if (target.isBlank()) return@Button
                scope.launch {
                  try {
                    newDmBusy = true
                    newDmError = null
                    val selfAddress = userAddress
                    if (!isAuthenticated || selfAddress.isNullOrBlank()) {
                      throw IllegalStateException("Sign in to start a DM")
                    }
                    if (!chatService.connected.value) {
                      chatService.connect(selfAddress)
                    }
                    val convId = chatService.newDm(target)
                    chatService.openConversation(convId)
                    newDmAddress = ""
                    showComposerSheet = false
                  } catch (e: Exception) {
                    val msg = e.message ?: "Unknown error"
                    newDmError = msg
                    onShowMessage("New DM failed: $msg")
                  } finally {
                    newDmBusy = false
                  }
                }
              },
              enabled = newDmAddress.isNotBlank() && !newDmBusy,
            ) {
              Text("Open chat")
            }
            if (dmSuggestions.isNotEmpty()) {
              Spacer(modifier = Modifier.height(8.dp))
              Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
              ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                  dmSuggestions.forEachIndexed { index, suggestion ->
                    Row(
                      modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !newDmBusy) {
                          newDmAddress = suggestion.inputValue
                        }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                      verticalAlignment = Alignment.CenterVertically,
                    ) {
                      IdentityAvatar(
                        displayName = suggestion.title,
                        avatarUri = suggestion.avatarUri,
                        size = 32.dp,
                      )
                      Spacer(modifier = Modifier.width(10.dp))
                      Column(modifier = Modifier.weight(1f)) {
                        Text(
                          text = suggestion.title,
                          fontWeight = FontWeight.Medium,
                          maxLines = 1,
                          overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                          text = suggestion.subtitle,
                          color = PiratePalette.TextMuted,
                          style = MaterialTheme.typography.bodySmall,
                          maxLines = 1,
                          overflow = TextOverflow.Ellipsis,
                        )
                      }
                    }
                    if (index < dmSuggestions.lastIndex) {
                      HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                  }
                }
              }
            }
            if (!newDmError.isNullOrBlank()) {
              Text(
                text = newDmError ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp),
              )
            }
          } else {
            OutlinedTextField(
              value = newGroupName,
              onValueChange = { newGroupName = it },
              modifier = Modifier.fillMaxWidth(),
              placeholder = { Text("Group name") },
              singleLine = true,
              enabled = !newGroupBusy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
              value = newGroupDescription,
              onValueChange = { newGroupDescription = it },
              modifier = Modifier.fillMaxWidth(),
              placeholder = { Text("Description (optional)") },
              enabled = !newGroupBusy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
              value = newGroupImageUrl,
              onValueChange = { newGroupImageUrl = it },
              modifier = Modifier.fillMaxWidth(),
              placeholder = { Text("Image URL (optional)") },
              singleLine = true,
              enabled = !newGroupBusy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
              value = newGroupMembers,
              onValueChange = { newGroupMembers = it },
              modifier = Modifier.fillMaxWidth(),
              placeholder = { Text("Member addresses or inbox IDs (comma, space, or newline)") },
              minLines = 2,
              enabled = !newGroupBusy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
              value = newGroupAppData,
              onValueChange = { newGroupAppData = it },
              modifier = Modifier.fillMaxWidth(),
              placeholder = { Text("App data JSON (optional)") },
              enabled = !newGroupBusy,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
              text = "Permissions",
              style = MaterialTheme.typography.labelLarge,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            listOf(
              GroupPermissionMode.ALL_MEMBERS to "All members",
              GroupPermissionMode.ADMIN_ONLY to "Admin only",
            ).forEach { (mode, label) ->
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .clickable(enabled = !newGroupBusy) { newGroupPermissionMode = mode }
                  .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
              ) {
                RadioButton(
                  selected = newGroupPermissionMode == mode,
                  onClick = null,
                  enabled = !newGroupBusy,
                )
                Text(text = label)
              }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
              onClick = {
                scope.launch {
                  try {
                    newGroupBusy = true
                    newGroupError = null
                    val selfAddress = userAddress
                    if (!isAuthenticated || selfAddress.isNullOrBlank()) {
                      throw IllegalStateException("Sign in to create a group")
                    }
                    if (!chatService.connected.value) {
                      chatService.connect(selfAddress)
                    }
                    val memberInputs = parseGroupMembersInput(newGroupMembers)
                    val groupId =
                      chatService.newGroup(
                        memberAddressesOrInboxIds = memberInputs,
                        name = newGroupName,
                        description = newGroupDescription,
                        imageUrl = newGroupImageUrl,
                        appData = newGroupAppData,
                        permissionMode = newGroupPermissionMode,
                      )
                    chatService.openConversation(groupId)
                    newGroupName = ""
                    newGroupDescription = ""
                    newGroupImageUrl = ""
                    newGroupAppData = ""
                    newGroupMembers = ""
                    newGroupPermissionMode = GroupPermissionMode.ALL_MEMBERS
                    showComposerSheet = false
                  } catch (e: Exception) {
                    val msg = e.message ?: "Unknown error"
                    newGroupError = msg
                    onShowMessage("Create group failed: $msg")
                  } finally {
                    newGroupBusy = false
                  }
                }
              },
              enabled = !newGroupBusy && parseGroupMembersInput(newGroupMembers).isNotEmpty(),
            ) {
              Text("Create group")
            }
            if (!newGroupError.isNullOrBlank()) {
              Text(
                text = newGroupError ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp),
              )
            }
          }
        }
      }
    }

    if (showSettingsSheet) {
      val options =
        listOf(
          "Off" to null,
          "5 minutes" to 5L * 60L,
          "1 hour" to 60L * 60L,
          "1 day" to 24L * 60L * 60L,
          "7 days" to 7L * 24L * 60L * 60L,
        )

      ModalBottomSheet(
        onDismissRequest = { showSettingsSheet = false },
      ) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
          Text(
            text = "Conversation settings",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          )
          if (activeConversation?.type == ConversationType.GROUP) {
            OutlinedTextField(
              value = groupMetaName,
              onValueChange = { groupMetaName = it },
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
              label = { Text("Group name") },
              enabled = !groupMetaBusy,
            )
            OutlinedTextField(
              value = groupMetaDescription,
              onValueChange = { groupMetaDescription = it },
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
              label = { Text("Description") },
              enabled = !groupMetaBusy,
            )
            OutlinedTextField(
              value = groupMetaImageUrl,
              onValueChange = { groupMetaImageUrl = it },
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
              label = { Text("Image URL") },
              enabled = !groupMetaBusy,
            )
            OutlinedTextField(
              value = groupMetaAppData,
              onValueChange = { groupMetaAppData = it },
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
              label = { Text("App data") },
              enabled = !groupMetaBusy,
            )
            Button(
              onClick = {
                scope.launch {
                  groupMetaBusy = true
                  groupMetaError = null
                  runCatching {
                    chatService.updateActiveGroupMetadata(
                      name = groupMetaName,
                      description = groupMetaDescription,
                      imageUrl = groupMetaImageUrl,
                      appData = groupMetaAppData,
                    )
                  }.onFailure { err ->
                    groupMetaError = err.message ?: "Failed to update group metadata"
                    onShowMessage(groupMetaError ?: "Failed to update group metadata")
                  }
                  groupMetaBusy = false
                }
              },
              modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
              enabled = !groupMetaBusy,
            ) {
              Text("Save group details")
            }
            if (!groupMetaError.isNullOrBlank()) {
              Text(
                text = groupMetaError ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
              )
            }
            Text(
              text = "Group permissions",
              style = MaterialTheme.typography.titleMedium,
              fontWeight = FontWeight.Medium,
              modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            PermissionOptionSelector(
              title = "Who can add members?",
              selected = groupPermissionAddMembers,
              onSelect = { groupPermissionAddMembers = it },
              enabled = !groupPermissionBusy,
            )
            PermissionOptionSelector(
              title = "Who can edit metadata?",
              selected = groupPermissionMetadata,
              onSelect = { groupPermissionMetadata = it },
              enabled = !groupPermissionBusy,
            )
            Button(
              onClick = {
                scope.launch {
                  groupPermissionBusy = true
                  groupPermissionError = null
                  runCatching {
                    chatService.updateActiveGroupPermissions(
                      addMemberPolicy = groupPermissionAddMembers,
                      removeMemberPolicy = groupPermissionAddMembers,
                      updateNamePolicy = groupPermissionMetadata,
                      updateDescriptionPolicy = groupPermissionMetadata,
                      updateImagePolicy = groupPermissionMetadata,
                    )
                  }.onFailure { err ->
                    groupPermissionError = err.message ?: "Failed to update group permissions"
                    onShowMessage(groupPermissionError ?: "Failed to update group permissions")
                  }
                  groupPermissionBusy = false
                }
              },
              modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
              enabled = !groupPermissionBusy,
            ) {
              Text("Save group permissions")
            }
            if (!groupPermissionError.isNullOrBlank()) {
              Text(
                text = groupPermissionError ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
              )
            }
            HorizontalDivider(
              modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
              color = MaterialTheme.colorScheme.outlineVariant,
            )
          }
          Text(
            text = "Disappearing messages",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
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
                        showSettingsSheet = false
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
  onOpenScarlett: () -> Unit,
  onOpenComposer: () -> Unit,
  onOpenConversation: (String) -> Unit,
  onOpenDrawer: () -> Unit,
) {
  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "Chat",
      isAuthenticated = true,
      onAvatarPress = onOpenDrawer,
      rightSlot = {
        if (isAuthenticated) {
          IconButton(onClick = onOpenComposer) {
            Icon(Icons.Rounded.Add, contentDescription = "New conversation")
          }
        }
      },
    )

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
              } else if (xmtpConnecting) {
                Text("Connecting to XMTP...", color = PiratePalette.TextMuted)
              } else {
                Text("No conversations yet. Tap + to start.", color = PiratePalette.TextMuted)
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
  val title =
    if (conversation.type == ConversationType.DM && !conversation.peerAddress.isNullOrBlank()) {
      val display = conversation.displayName.trim()
      if (display.isBlank() || display.equals(conversation.peerAddress, ignoreCase = true)) {
        abbreviateAddress(conversation.peerAddress)
      } else {
        display
      }
    } else {
      conversation.displayName.ifBlank { "Untitled group" }
    }
  val subtitle =
    when {
      conversation.lastMessage.isNotBlank() -> conversation.lastMessage
      !conversation.subtitle.isNullOrBlank() -> conversation.subtitle
      conversation.type == ConversationType.DM && !conversation.peerAddress.isNullOrBlank() ->
        abbreviateAddress(conversation.peerAddress)
      else -> ""
    }
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    IdentityAvatar(
      displayName = title,
      avatarUri = conversation.avatarUri,
      size = 48.dp,
    )

    Spacer(modifier = Modifier.width(12.dp))

    Column(modifier = Modifier.weight(1f)) {
      Text(
        text = title,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (subtitle.isNotBlank()) {
        Text(
          text = subtitle,
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
  conversation: ConversationItem,
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
    val threadTitle =
      when {
        conversation.type == ConversationType.DM && !conversation.peerAddress.isNullOrBlank() -> {
          val display = conversation.displayName.trim()
          if (display.isBlank() || display.equals(conversation.peerAddress, ignoreCase = true)) {
            abbreviateAddress(conversation.peerAddress)
          } else {
            display
          }
        }
        else -> conversation.displayName.ifBlank { "Conversation" }
      }
    PirateMobileHeader(
      title = threadTitle,
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
        MessageBubble(
          message = msg,
          defaultIncomingDisplayName = threadTitle,
          defaultIncomingAvatarUri = conversation.avatarUri,
          isGroupConversation = conversation.type == ConversationType.GROUP,
        )
      }
    }

    // Input bar
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .navigationBarsPadding()
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
private fun MessageBubble(
  message: ChatMessage,
  defaultIncomingDisplayName: String,
  defaultIncomingAvatarUri: String?,
  isGroupConversation: Boolean,
) {
  val alignment = if (message.isFromMe) Alignment.End else Alignment.Start
  val bgColor = if (message.isFromMe) MaterialTheme.colorScheme.primary
  else MaterialTheme.colorScheme.surfaceVariant
  val textColor = if (message.isFromMe) MaterialTheme.colorScheme.onPrimary
  else MaterialTheme.colorScheme.onSurfaceVariant
  val incomingLabel =
    when {
      message.isFromMe -> ""
      isGroupConversation && !message.senderDisplayName.isNullOrBlank() -> message.senderDisplayName.orEmpty()
      isGroupConversation -> abbreviateAddress(message.senderAddress)
      else -> defaultIncomingDisplayName.ifBlank { "Unknown" }
    }
  val incomingAvatar =
    if (isGroupConversation) message.senderAvatarUri ?: defaultIncomingAvatarUri
    else defaultIncomingAvatarUri

  Column(
    modifier = Modifier.fillMaxWidth(),
    horizontalAlignment = alignment,
  ) {
    if (!message.isFromMe) {
      Row(
        modifier = Modifier.padding(start = 2.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        IdentityAvatar(
          displayName = incomingLabel,
          avatarUri = incomingAvatar,
          size = 18.dp,
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
          text = incomingLabel,
          color = PiratePalette.TextMuted,
          style = MaterialTheme.typography.labelSmall,
        )
      }
    }
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
    // Check mic permission first
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
      == PackageManager.PERMISSION_GRANTED
    ) {
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

@Composable
private fun IdentityAvatar(
  displayName: String,
  avatarUri: String?,
  size: Dp,
) {
  val avatarUrl = resolveAvatarUrl(avatarUri)
  if (!avatarUrl.isNullOrBlank()) {
    AsyncImage(
      model = avatarUrl,
      contentDescription = displayName,
      modifier = Modifier.size(size).clip(CircleShape),
      contentScale = ContentScale.Crop,
    )
  } else {
    Surface(
      modifier = Modifier.size(size),
      shape = CircleShape,
      color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
      Box(contentAlignment = Alignment.Center) {
        Text(
          text = avatarInitial(displayName),
          style = MaterialTheme.typography.labelMedium,
          fontWeight = FontWeight.Bold,
          maxLines = 1,
        )
      }
    }
  }
}

@Composable
private fun PermissionOptionSelector(
  title: String,
  selected: PermissionOption,
  onSelect: (PermissionOption) -> Unit,
  enabled: Boolean,
) {
  val options =
    listOf(
      PermissionOption.Allow,
      PermissionOption.Admin,
      PermissionOption.SuperAdmin,
      PermissionOption.Deny,
    )
  Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
    Text(
      text = title,
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(modifier = Modifier.height(6.dp))
    options.forEach { option ->
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .clickable(enabled = enabled) { onSelect(option) }
          .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        RadioButton(
          selected = selected == option,
          onClick = null,
          enabled = enabled,
        )
        Text(permissionOptionLabel(option))
      }
    }
  }
}

private fun buildDmSuggestions(
  conversations: List<ConversationItem>,
  query: String,
  excludeConversationId: String? = null,
  limit: Int = 6,
): List<DmSuggestion> {
  val needle = query.trim().lowercase()
  if (needle.isBlank()) return emptyList()
  return conversations
    .asSequence()
    .filter { convo ->
      if (convo.type != ConversationType.DM) return@filter false
      if (!excludeConversationId.isNullOrBlank() && convo.id == excludeConversationId) return@filter false
      val address = convo.peerAddress.orEmpty()
      val inboxId = convo.peerInboxId.orEmpty()
      convo.displayName.lowercase().contains(needle) ||
        address.lowercase().contains(needle) ||
        inboxId.lowercase().contains(needle)
    }
    .map { convo ->
      val address = convo.peerAddress.orEmpty()
      val inboxId = convo.peerInboxId.orEmpty()
      val hasResolvedName =
        convo.displayName.isNotBlank() &&
          !convo.displayName.equals(address, ignoreCase = true)
      val title =
        if (hasResolvedName) convo.displayName else abbreviateAddress(address.ifBlank { inboxId })
      val subtitle =
        if (hasResolvedName) abbreviateAddress(address.ifBlank { inboxId }) else abbreviateAddress(inboxId)
      val inputValue =
        if (looksLikeEthereumAddress(address)) address else inboxId
      DmSuggestion(
        title = title,
        subtitle = subtitle,
        inputValue = inputValue,
        avatarUri = convo.avatarUri,
      )
    }
    .distinctBy { it.inputValue.lowercase() }
    .take(limit)
    .toList()
}

private fun parseGroupMembersInput(input: String): List<String> {
  return input
    .split(',', '\n', '\t', ' ')
    .map { it.trim() }
    .filter { it.isNotBlank() }
}

private fun permissionOptionLabel(option: PermissionOption): String {
  return when (option) {
    PermissionOption.Allow -> "All members"
    PermissionOption.Admin -> "Admins only"
    PermissionOption.SuperAdmin -> "Super admin only"
    PermissionOption.Deny -> "Deny all"
    PermissionOption.Unknown -> "Unknown"
  }
}

private fun looksLikeEthereumAddress(value: String): Boolean {
  val trimmed = value.trim()
  if (!trimmed.startsWith("0x") || trimmed.length != 42) return false
  return trimmed.drop(2).all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }
}

private fun resolveAvatarUrl(avatarUri: String?): String? {
  return CoverRef.resolveCoverUrl(
    ref = avatarUri,
    width = null,
    height = null,
    format = null,
    quality = null,
  )
}

private fun avatarInitial(displayName: String): String {
  val normalized = displayName.trim()
  if (normalized.isBlank()) return "?"
  return normalized.take(1).uppercase()
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
