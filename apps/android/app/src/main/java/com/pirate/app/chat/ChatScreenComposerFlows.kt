package com.pirate.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader

@Composable
internal fun NewConversationScreen(
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
      modifier =
        Modifier
          .fillMaxWidth()
          .padding(horizontal = 16.dp, vertical = 8.dp),
      placeholder = { Text("Search users") },
      singleLine = true,
      enabled = !submitBusy,
      keyboardOptions =
        androidx.compose.foundation.text.KeyboardOptions(
          imeAction = androidx.compose.ui.text.input.ImeAction.Send,
        ),
      keyboardActions =
        androidx.compose.foundation.text.KeyboardActions(
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
