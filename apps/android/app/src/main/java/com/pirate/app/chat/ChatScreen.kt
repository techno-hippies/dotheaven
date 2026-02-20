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
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettMessage
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import com.pirate.app.util.abbreviateAddress
import com.pirate.app.util.resolveAvatarUrl
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.xmtp.android.library.libxmtp.PermissionOption
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class ChatView {
  Conversations,
  Thread,
  Scarlett,
  NewConversation,
  NewGroupMembers,
  NewGroupDetails,
}

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
  var newDmAddress by remember { mutableStateOf("") }
  var newDmBusy by remember { mutableStateOf(false) }
  var newDmError by remember { mutableStateOf<String?>(null) }
  var dmDirectorySuggestions by remember { mutableStateOf<List<DmSuggestion>>(emptyList()) }
  var dmDirectoryBusy by remember { mutableStateOf(false) }
  var dmDirectoryError by remember { mutableStateOf<String?>(null) }
  var newGroupMemberQuery by remember { mutableStateOf("") }
  var newGroupMembers by remember { mutableStateOf<List<String>>(emptyList()) }
  var newGroupName by remember { mutableStateOf("") }
  var newGroupDescription by remember { mutableStateOf("") }
  var newGroupBusy by remember { mutableStateOf(false) }
  var newGroupError by remember { mutableStateOf<String?>(null) }
  var groupDirectorySuggestions by remember { mutableStateOf<List<DmSuggestion>>(emptyList()) }
  var groupDirectoryBusy by remember { mutableStateOf(false) }
  var groupDirectoryError by remember { mutableStateOf<String?>(null) }
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
  val dmRecentSuggestions = remember(conversations, newDmAddress, currentView, activeConversationId) {
    if (currentView == ChatView.NewConversation) {
      buildDmSuggestions(
        conversations = conversations,
        query = newDmAddress,
        excludeConversationId = activeConversationId,
      )
    } else {
      emptyList()
    }
  }
  val groupRecentSuggestions = remember(conversations, newGroupMemberQuery, currentView, activeConversationId) {
    if (currentView == ChatView.NewGroupMembers) {
      buildDmSuggestions(
        conversations = conversations,
        query = newGroupMemberQuery,
        excludeConversationId = activeConversationId,
      )
    } else {
      emptyList()
    }
  }
  val dmVisibleDirectorySuggestions =
    remember(dmDirectorySuggestions, dmRecentSuggestions) {
      dropKnownSuggestions(
        directorySuggestions = dmDirectorySuggestions,
        existingSuggestions = dmRecentSuggestions,
      )
    }
  val groupVisibleDirectorySuggestions =
    remember(groupDirectorySuggestions, groupRecentSuggestions) {
      dropKnownSuggestions(
        directorySuggestions = groupDirectorySuggestions,
        existingSuggestions = groupRecentSuggestions,
      )
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

  LaunchedEffect(currentView, newDmAddress) {
    refreshDirectorySuggestions(
      currentView = currentView,
      expectedView = ChatView.NewConversation,
      rawQuery = newDmAddress,
      onSuggestions = { dmDirectorySuggestions = it },
      onBusy = { dmDirectoryBusy = it },
      onError = { dmDirectoryError = it },
    )
  }

  LaunchedEffect(currentView, newGroupMemberQuery) {
    refreshDirectorySuggestions(
      currentView = currentView,
      expectedView = ChatView.NewGroupMembers,
      rawQuery = newGroupMemberQuery,
      onSuggestions = { groupDirectorySuggestions = it },
      onBusy = { groupDirectoryBusy = it },
      onError = { groupDirectoryError = it },
    )
  }

  fun openDm(targetInput: String) {
    val target = targetInput.trim()
    if (target.isBlank() || newDmBusy) return
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
      } catch (e: Exception) {
        val msg = e.message ?: "Unknown error"
        newDmError = msg
        onShowMessage("New DM failed: $msg")
      } finally {
        newDmBusy = false
      }
    }
  }

  fun addGroupMembers(rawInput: String) {
    val inputs = parseGroupMembersInput(rawInput)
    if (inputs.isEmpty()) return
    val existing = newGroupMembers.associateBy { it.lowercase() }.toMutableMap()
    inputs.forEach { member ->
      existing.putIfAbsent(member.lowercase(), member)
    }
    newGroupMembers = existing.values.toList()
  }

  fun createGroup() {
    if (newGroupBusy || newGroupMembers.isEmpty()) return
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
        val groupId =
          chatService.newGroup(
            memberAddressesOrInboxIds = newGroupMembers,
            name = newGroupName,
            description = newGroupDescription,
            imageUrl = "",
            appData = "",
            permissionMode = GroupPermissionMode.ALL_MEMBERS,
          )
        chatService.openConversation(groupId)
        newGroupName = ""
        newGroupDescription = ""
        newGroupMemberQuery = ""
        newGroupMembers = emptyList()
      } catch (e: Exception) {
        val msg = e.message ?: "Unknown error"
        newGroupError = msg
        onShowMessage("Create group failed: $msg")
      } finally {
        newGroupBusy = false
      }
    }
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

      currentView == ChatView.NewConversation -> {
        NewConversationScreen(
          query = newDmAddress,
          submitBusy = newDmBusy,
          submitError = newDmError,
          directorySuggestions = dmVisibleDirectorySuggestions,
          directoryBusy = dmDirectoryBusy,
          directoryError = dmDirectoryError,
          onBack = { currentView = ChatView.Conversations },
          onQueryChange = {
            newDmAddress = it
            if (!newDmError.isNullOrBlank()) newDmError = null
            if (!dmDirectoryError.isNullOrBlank()) dmDirectoryError = null
          },
          onSubmit = { openDm(newDmAddress) },
          onOpenSuggestion = { openDm(it) },
          onOpenGroup = {
            newGroupMemberQuery = ""
            newGroupMembers = emptyList()
            newGroupName = ""
            newGroupDescription = ""
            newGroupError = null
            groupDirectorySuggestions = emptyList()
            groupDirectoryBusy = false
            groupDirectoryError = null
            currentView = ChatView.NewGroupMembers
          },
        )
      }

      currentView == ChatView.NewGroupMembers -> {
        NewGroupMembersScreen(
          query = newGroupMemberQuery,
          members = newGroupMembers,
          recents = groupRecentSuggestions,
          directorySuggestions = groupVisibleDirectorySuggestions,
          directoryBusy = groupDirectoryBusy,
          directoryError = groupDirectoryError,
          busy = newGroupBusy,
          error = newGroupError,
          onBack = { currentView = ChatView.NewConversation },
          onQueryChange = {
            newGroupMemberQuery = it
            if (!newGroupError.isNullOrBlank()) newGroupError = null
            if (!groupDirectoryError.isNullOrBlank()) groupDirectoryError = null
          },
          onAddQuery = {
            addGroupMembers(newGroupMemberQuery)
            newGroupMemberQuery = ""
          },
          onAddSuggestion = { value ->
            addGroupMembers(value)
            newGroupMemberQuery = ""
          },
          onRemoveMember = { member ->
            newGroupMembers =
              newGroupMembers.filterNot { it.equals(member, ignoreCase = true) }
          },
          onNext = { currentView = ChatView.NewGroupDetails },
        )
      }

      currentView == ChatView.NewGroupDetails -> {
        NewGroupDetailsScreen(
          groupName = newGroupName,
          description = newGroupDescription,
          memberCount = newGroupMembers.size,
          busy = newGroupBusy,
          error = newGroupError,
          onBack = { currentView = ChatView.NewGroupMembers },
          onNameChange = {
            newGroupName = it
            if (!newGroupError.isNullOrBlank()) newGroupError = null
          },
          onDescriptionChange = { newGroupDescription = it },
          onCreate = { createGroup() },
        )
      }

      else -> {
        ConversationList(
          conversations = conversations,
          scarlettService = scarlettService,
          isAuthenticated = isAuthenticated,
          xmtpConnecting = connecting,
          onOpenScarlett = { currentView = ChatView.Scarlett },
          onOpenComposer = {
            newDmAddress = ""
            newDmError = null
            dmDirectorySuggestions = emptyList()
            dmDirectoryBusy = false
            dmDirectoryError = null
            newGroupMemberQuery = ""
            newGroupMembers = emptyList()
            newGroupName = ""
            newGroupDescription = ""
            newGroupError = null
            groupDirectorySuggestions = emptyList()
            groupDirectoryBusy = false
            groupDirectoryError = null
            currentView = ChatView.NewConversation
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
private fun NewConversationScreen(
  query: String,
  submitBusy: Boolean,
  submitError: String?,
  directorySuggestions: List<DmSuggestion>,
  directoryBusy: Boolean,
  directoryError: String?,
  onBack: () -> Unit,
  onQueryChange: (String) -> Unit,
  onSubmit: () -> Unit,
  onOpenSuggestion: (String) -> Unit,
  onOpenGroup: () -> Unit,
) {
  val queryTrimmed = query.trim()
  val showDirectorySection = shouldSearchDirectory(queryTrimmed)
  val canOpenDirect = looksLikeDirectDmTarget(queryTrimmed)
  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "New conversation",
      onBackPress = onBack,
      isAuthenticated = true,
    )
    OutlinedTextField(
      value = query,
      onValueChange = onQueryChange,
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 8.dp),
      placeholder = { Text("Search users") },
      singleLine = true,
      enabled = !submitBusy,
      keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
        imeAction = androidx.compose.ui.text.input.ImeAction.Send,
      ),
      keyboardActions = androidx.compose.foundation.text.KeyboardActions(
        onSend = { onSubmit() },
      ),
    )
    if (!submitError.isNullOrBlank()) {
      Text(
        text = submitError,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
      )
    }
    if (!directoryError.isNullOrBlank()) {
      Text(
        text = directoryError,
        color = PiratePalette.TextMuted,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp),
      )
    }
    LazyColumn(
      modifier = Modifier.fillMaxWidth().weight(1f),
    ) {
      item(key = "new-group") {
        ListItem(
          headlineContent = { Text("New group") },
          leadingContent = { Icon(Icons.Rounded.Add, contentDescription = null) },
          modifier = Modifier.clickable(enabled = !submitBusy, onClick = onOpenGroup),
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
      }

      if (canOpenDirect) {
        item(key = "direct-open") {
          ListItem(
            headlineContent = { Text("Message \"$queryTrimmed\"") },
            supportingContent = { Text("Exact name.heaven / name.pirate or wallet address") },
            modifier = Modifier.clickable(enabled = !submitBusy, onClick = onSubmit),
          )
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
      }

      if (showDirectorySection) {
        item(key = "directory-label") {
          Text(
            text = "Directory",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          )
        }
        when {
          directoryBusy -> {
            item(key = "directory-loading") {
              Text(
                text = "Searching directory...",
                color = PiratePalette.TextMuted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
              )
            }
          }
          directorySuggestions.isEmpty() -> {
            item(key = "directory-empty") {
              Text(
                text = "No directory matches",
                color = PiratePalette.TextMuted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
              )
            }
          }
          else -> {
            items(
              items = directorySuggestions,
              key = { "dir-${it.inputValue.lowercase()}" },
            ) { suggestion ->
              DmSuggestionRow(
                suggestion = suggestion,
                enabled = !submitBusy,
                onClick = { onOpenSuggestion(suggestion.inputValue) },
              )
              HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
          }
        }
      }
    }
  }
}

@Composable
private fun NewGroupMembersScreen(
  query: String,
  members: List<String>,
  recents: List<DmSuggestion>,
  directorySuggestions: List<DmSuggestion>,
  directoryBusy: Boolean,
  directoryError: String?,
  busy: Boolean,
  error: String?,
  onBack: () -> Unit,
  onQueryChange: (String) -> Unit,
  onAddQuery: () -> Unit,
  onAddSuggestion: (String) -> Unit,
  onRemoveMember: (String) -> Unit,
  onNext: () -> Unit,
) {
  val queryTrimmed = query.trim()
  val showDirectorySection = shouldSearchDirectory(queryTrimmed)
  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "New group",
      onBackPress = onBack,
      isAuthenticated = true,
    )
    Text(
      text = "Add members",
      style = MaterialTheme.typography.titleMedium,
      modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 8.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier.weight(1f),
        placeholder = { Text("Search users") },
        singleLine = true,
        enabled = !busy,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
          imeAction = androidx.compose.ui.text.input.ImeAction.Send,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(
          onSend = { onAddQuery() },
        ),
      )
      Button(
        onClick = onAddQuery,
        enabled = query.trim().isNotBlank() && !busy,
      ) {
        Text("Add")
      }
    }
    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
      )
    }
    if (!directoryError.isNullOrBlank()) {
      Text(
        text = directoryError,
        color = PiratePalette.TextMuted,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp),
      )
    }
    LazyColumn(
      modifier = Modifier.fillMaxWidth().weight(1f),
    ) {
      if (members.isEmpty()) {
        item(key = "members-empty") {
          Text(
            text = "No members selected yet",
            color = PiratePalette.TextMuted,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          )
        }
      } else {
        item(key = "members-title") {
          Text(
            text = "Selected (${members.size})",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          )
        }
        items(
          items = members,
          key = { "member-${it.lowercase()}" },
        ) { member ->
          ListItem(
            headlineContent = { Text(memberDisplayName(member)) },
            supportingContent = { Text(member, style = MaterialTheme.typography.bodySmall) },
            trailingContent = { Text("Remove", color = MaterialTheme.colorScheme.primary) },
            modifier = Modifier.clickable(enabled = !busy) { onRemoveMember(member) },
          )
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
      }
      item(key = "suggestions-title") {
        Text(
          text = "Recents",
          style = MaterialTheme.typography.labelLarge,
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
      }
      if (recents.isEmpty()) {
        item(key = "suggestions-empty") {
          Text(
            text = "No recent suggestions",
            color = PiratePalette.TextMuted,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
          )
        }
      } else {
        items(
          items = recents,
          key = { "recent-suggest-${it.inputValue.lowercase()}" },
        ) { suggestion ->
          DmSuggestionRow(
            suggestion = suggestion,
            enabled = !busy,
            onClick = { onAddSuggestion(suggestion.inputValue) },
          )
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
      }
      if (showDirectorySection) {
        item(key = "directory-title") {
          Text(
            text = "Directory",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
          )
        }
        when {
          directoryBusy -> {
            item(key = "directory-loading") {
              Text(
                text = "Searching directory...",
                color = PiratePalette.TextMuted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
              )
            }
          }
          directorySuggestions.isEmpty() -> {
            item(key = "directory-empty") {
              Text(
                text = "No directory matches",
                color = PiratePalette.TextMuted,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
              )
            }
          }
          else -> {
            items(
              items = directorySuggestions,
              key = { "dir-suggest-${it.inputValue.lowercase()}" },
            ) { suggestion ->
              DmSuggestionRow(
                suggestion = suggestion,
                enabled = !busy,
                onClick = { onAddSuggestion(suggestion.inputValue) },
              )
              HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
          }
        }
      }
      item(key = "spacer-end") {
        Spacer(modifier = Modifier.height(16.dp))
      }
    }
    Button(
      onClick = onNext,
      enabled = members.isNotEmpty() && !busy,
      modifier = Modifier
        .fillMaxWidth()
        .navigationBarsPadding()
        .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
      Text("Next")
    }
  }
}

@Composable
private fun NewGroupDetailsScreen(
  groupName: String,
  description: String,
  memberCount: Int,
  busy: Boolean,
  error: String?,
  onBack: () -> Unit,
  onNameChange: (String) -> Unit,
  onDescriptionChange: (String) -> Unit,
  onCreate: () -> Unit,
) {
  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "Group details",
      onBackPress = onBack,
      isAuthenticated = true,
    )
    Text(
      text = "$memberCount member${if (memberCount == 1) "" else "s"} selected",
      color = PiratePalette.TextMuted,
      modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
    OutlinedTextField(
      value = groupName,
      onValueChange = onNameChange,
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 8.dp),
      placeholder = { Text("Group name (optional)") },
      singleLine = true,
      enabled = !busy,
    )
    OutlinedTextField(
      value = description,
      onValueChange = onDescriptionChange,
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 4.dp),
      placeholder = { Text("Description (optional)") },
      enabled = !busy,
      minLines = 2,
    )
    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
      )
    }
    Spacer(modifier = Modifier.weight(1f))
    Button(
      onClick = onCreate,
      enabled = memberCount > 0 && !busy,
      modifier = Modifier
        .fillMaxWidth()
        .navigationBarsPadding()
        .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
      Text(if (busy) "Creating..." else "Create group")
    }
  }
}

@Composable
private fun DmSuggestionRow(
  suggestion: DmSuggestion,
  enabled: Boolean,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(enabled = enabled, onClick = onClick)
      .padding(horizontal = 16.dp, vertical = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    IdentityAvatar(
      displayName = suggestion.title,
      avatarUri = suggestion.avatarUri,
      size = 36.dp,
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
  return conversations
    .asSequence()
    .filter { convo ->
      if (convo.type != ConversationType.DM) return@filter false
      if (!excludeConversationId.isNullOrBlank() && convo.id == excludeConversationId) return@filter false
      val address = convo.peerAddress.orEmpty()
      val inboxId = convo.peerInboxId.orEmpty()
      if (needle.isBlank()) {
        true
      } else {
        convo.displayName.lowercase().contains(needle) ||
          address.lowercase().contains(needle) ||
          inboxId.lowercase().contains(needle)
      }
    }
    .sortedByDescending { it.lastMessageTimestampMs }
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
    .filter { it.inputValue.isNotBlank() }
    .distinctBy { it.inputValue.lowercase() }
    .take(limit)
    .toList()
}

private suspend fun refreshDirectorySuggestions(
  currentView: ChatView,
  expectedView: ChatView,
  rawQuery: String,
  onSuggestions: (List<DmSuggestion>) -> Unit,
  onBusy: (Boolean) -> Unit,
  onError: (String?) -> Unit,
) {
  if (currentView != expectedView || !shouldSearchDirectory(rawQuery)) {
    onSuggestions(emptyList())
    onBusy(false)
    onError(null)
    return
  }

  val query = rawQuery.trim()
  delay(280)
  onBusy(true)
  onError(null)
  try {
    val profiles = ChatDirectoryApi.searchProfilesByDisplayNamePrefix(query, first = 12)
    onSuggestions(profiles.mapNotNull(::directoryProfileToSuggestion))
    onError(null)
  } catch (error: CancellationException) {
    throw error
  } catch (error: Exception) {
    onSuggestions(emptyList())
    onError(error.message ?: "Directory search unavailable")
  } finally {
    onBusy(false)
  }
}

private fun parseGroupMembersInput(input: String): List<String> {
  return input
    .split(',', '\n', '\t', ' ')
    .map { it.trim() }
    .filter { it.isNotBlank() }
}

private fun shouldSearchDirectory(query: String): Boolean {
  val normalized = query.trim()
  if (normalized.length < 2) return false
  if (looksLikeEthereumAddress(normalized)) return false
  return true
}

private fun looksLikeDirectDmTarget(value: String): Boolean {
  val normalized = value.trim()
  if (normalized.isBlank()) return false
  if (looksLikeEthereumAddress(normalized)) return true
  if (looksLikeTempoName(normalized)) return true
  return false
}

private fun looksLikeTempoName(value: String): Boolean {
  val normalized = value.trim().lowercase().removePrefix("@")
  if (normalized.isBlank()) return false
  val dotIndex = normalized.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= normalized.lastIndex) return false
  val label = normalized.substring(0, dotIndex)
  val tld = normalized.substring(dotIndex + 1)
  if (tld != "heaven" && tld != "pirate") return false
  if (label.isBlank()) return false
  return label.all { it.isLetterOrDigit() || it == '-' || it == '_' }
}

private fun directoryProfileToSuggestion(profile: ChatDirectoryProfile): DmSuggestion? {
  val address = profile.address.trim().lowercase()
  if (!looksLikeEthereumAddress(address)) return null
  val title = profile.displayName.ifBlank { abbreviateAddress(address) }
  return DmSuggestion(
    title = title,
    subtitle = abbreviateAddress(address),
    inputValue = address,
    avatarUri = profile.photoUri,
  )
}

private fun dropKnownSuggestions(
  directorySuggestions: List<DmSuggestion>,
  existingSuggestions: List<DmSuggestion>,
): List<DmSuggestion> {
  if (directorySuggestions.isEmpty()) return emptyList()
  if (existingSuggestions.isEmpty()) return directorySuggestions
  val existingInputs =
    existingSuggestions
      .asSequence()
      .map { it.inputValue.trim().lowercase() }
      .filter { it.isNotBlank() }
      .toSet()
  if (existingInputs.isEmpty()) return directorySuggestions
  return directorySuggestions.filterNot { it.inputValue.trim().lowercase() in existingInputs }
}

private fun memberDisplayName(value: String): String {
  val trimmed = value.trim()
  if (trimmed.isBlank()) return ""
  return if (looksLikeEthereumAddress(trimmed) || trimmed.length > 22) {
    abbreviateAddress(trimmed)
  } else {
    trimmed
  }
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

private fun avatarInitial(displayName: String): String {
  val normalized = displayName.trim()
  if (normalized.isBlank()) return "?"
  return normalized.take(1).uppercase()
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
