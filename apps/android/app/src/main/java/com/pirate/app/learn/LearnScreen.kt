package com.pirate.app.learn

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pirate.app.ui.PirateMobileHeader
import com.pirate.app.util.formatTimeAgoShort
import kotlinx.coroutines.launch
import kotlin.math.max

@Composable
fun LearnScreen(
  isAuthenticated: Boolean,
  userAddress: String?,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
  onOpenSong: ((String) -> Unit)? = null,
) {
  val scope = rememberCoroutineScope()

  var summaries by remember { mutableStateOf<List<UserStudySetSummary>>(emptyList()) }
  var summariesLoading by remember { mutableStateOf(false) }
  var selectedStudySetKey by rememberSaveable { mutableStateOf<String?>(null) }

  var detailLoading by remember { mutableStateOf(false) }
  var detail by remember { mutableStateOf<UserStudySetDetail?>(null) }
  var queue by remember { mutableStateOf<StudyQueueSnapshot?>(null) }

  fun loadSummaries(address: String) {
    scope.launch {
      summariesLoading = true
      runCatching {
        StudyProgressApi.fetchUserStudySetSummaries(address)
      }.onSuccess { rows ->
        summaries = rows
        if (rows.isNotEmpty()) {
          val current = selectedStudySetKey?.lowercase()
          selectedStudySetKey = rows.firstOrNull { it.studySetKey.lowercase() == current }?.studySetKey
            ?: rows.first().studySetKey
        } else {
          selectedStudySetKey = null
          detail = null
          queue = null
        }
      }.onFailure { err ->
        summaries = emptyList()
        selectedStudySetKey = null
        detail = null
        queue = null
        onShowMessage("Learn load failed: ${err.message ?: "unknown error"}")
      }
      summariesLoading = false
    }
  }

  fun loadDetail(address: String, studySetKey: String) {
    scope.launch {
      detailLoading = true
      runCatching {
        StudyProgressApi.fetchUserStudySetDetail(address, studySetKey)
      }.onSuccess { result ->
        detail = result
        queue = if (result == null) null else StudyScheduler.replay(result.attempts)
      }.onFailure { err ->
        detail = null
        queue = null
        onShowMessage("Learn detail failed: ${err.message ?: "unknown error"}")
      }
      detailLoading = false
    }
  }

  LaunchedEffect(isAuthenticated, userAddress) {
    if (!isAuthenticated || userAddress.isNullOrBlank()) {
      summaries = emptyList()
      summariesLoading = false
      selectedStudySetKey = null
      detail = null
      queue = null
      detailLoading = false
      return@LaunchedEffect
    }
    loadSummaries(userAddress)
  }

  LaunchedEffect(isAuthenticated, userAddress, selectedStudySetKey) {
    val address = userAddress
    val studySetKey = selectedStudySetKey
    if (!isAuthenticated || address.isNullOrBlank() || studySetKey.isNullOrBlank()) {
      detail = null
      queue = null
      detailLoading = false
      return@LaunchedEffect
    }
    loadDetail(address, studySetKey)
  }

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "Learn",
      isAuthenticated = isAuthenticated,
      onAvatarPress = onOpenDrawer,
      rightSlot = {
        val canRefresh = isAuthenticated && !userAddress.isNullOrBlank() && !summariesLoading
        OutlinedButton(
          enabled = canRefresh,
          onClick = {
            val address = userAddress
            if (!address.isNullOrBlank()) {
              loadSummaries(address)
            }
          },
        ) {
          Text("Refresh")
        }
      },
    )

    if (!isAuthenticated || userAddress.isNullOrBlank()) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Sign in to load your study queue.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
      return@Column
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      item {
        StudyQueueSummaryCard(
          queue = queue,
          detail = detail,
          loading = detailLoading,
          onOpenSong = onOpenSong,
        )
      }

      item {
        Text(
          text = "Study Sets",
          style = MaterialTheme.typography.titleMedium,
          color = MaterialTheme.colorScheme.onSurface,
          fontWeight = FontWeight.SemiBold,
        )
      }

      if (summariesLoading) {
        item {
          Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
            horizontalArrangement = Arrangement.Center,
          ) {
            CircularProgressIndicator()
          }
        }
      } else if (summaries.isEmpty()) {
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(16.dp),
          ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
              Text("No study attempts indexed yet.", fontWeight = FontWeight.Medium)
              Text(
                "Complete a few exercises and submit attempts onchain. This queue hydrates from the study-progress subgraph.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
              )
            }
          }
        }
      } else {
        items(summaries, key = { it.id }) { summary ->
          val selected = summary.studySetKey.equals(selectedStudySetKey, ignoreCase = true)
          StudySetSummaryRow(
            summary = summary,
            selected = selected,
            onSelect = { selectedStudySetKey = summary.studySetKey },
          )
        }
      }

      if (detailLoading) {
        item {
          Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.Center,
          ) {
            CircularProgressIndicator()
          }
        }
      }

      val dueCards = queue?.dueCards.orEmpty().take(24)
      if (dueCards.isNotEmpty()) {
        item {
          Text(
            text = "Due Now",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.SemiBold,
          )
        }
        items(dueCards, key = { it.questionId }) { item ->
          DueQuestionRow(item)
        }
      }
    }
  }
}

@Composable
private fun StudyQueueSummaryCard(
  queue: StudyQueueSnapshot?,
  detail: UserStudySetDetail?,
  loading: Boolean,
  onOpenSong: ((String) -> Unit)? = null,
) {
  val trackedCards = queue?.trackedCards ?: 0
  val dueCards = queue?.dueCount ?: 0
  val completionProgress = if (trackedCards <= 0) {
    0f
  } else {
    ((trackedCards - dueCards).toFloat() / max(1, trackedCards).toFloat()).coerceIn(0f, 1f)
  }

  Card(
    shape = RoundedCornerShape(16.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(14.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text("Queue Snapshot", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
      if (loading) {
        Row(
          modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
          horizontalArrangement = Arrangement.Center,
        ) {
          CircularProgressIndicator()
        }
      } else {
        val detailSummary = detail?.summary
        Text(
          text = "Study set: ${detailSummary?.studySetKey?.let { abbreviateHex(it, 10, 6) } ?: "—"}",
          style = MaterialTheme.typography.bodyMedium,
        )
        val anchor = detail?.anchor
        if (anchor != null) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Text(
              text = "Track: ${abbreviateHex(anchor.trackId, 10, 6)} • v${anchor.version}",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (onOpenSong != null) {
              OutlinedButton(onClick = { onOpenSong(anchor.trackId) }) {
                Text("Song")
              }
            }
          }
        }
        LinearProgressIndicator(
          progress = { completionProgress },
          modifier = Modifier.fillMaxWidth().height(8.dp),
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("Due ${queue?.dueCount ?: 0}", style = MaterialTheme.typography.bodySmall)
          Text("Tracked ${queue?.trackedCards ?: 0}", style = MaterialTheme.typography.bodySmall)
        }
        HorizontalDivider()
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("Learning ${queue?.learningCount ?: 0}", style = MaterialTheme.typography.bodySmall)
          Text("Review ${queue?.reviewCount ?: 0}", style = MaterialTheme.typography.bodySmall)
          Text("Relearning ${queue?.relearningCount ?: 0}", style = MaterialTheme.typography.bodySmall)
        }
      }
    }
  }
}

@Composable
private fun StudySetSummaryRow(
  summary: UserStudySetSummary,
  selected: Boolean,
  onSelect: () -> Unit,
) {
  val container = if (selected) {
    MaterialTheme.colorScheme.secondaryContainer
  } else {
    MaterialTheme.colorScheme.surface
  }
  val content = if (selected) {
    MaterialTheme.colorScheme.onSecondaryContainer
  } else {
    MaterialTheme.colorScheme.onSurface
  }

  Card(
    modifier = Modifier.fillMaxWidth().clickable { onSelect() },
    shape = RoundedCornerShape(14.dp),
    colors = CardDefaults.cardColors(containerColor = container),
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
  ) {
    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Text(
        text = abbreviateHex(summary.studySetKey, 10, 6),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = content,
      )
      Text(
        text = "Attempts ${summary.totalAttempts} • Questions ${summary.uniqueQuestionsTouched}",
        style = MaterialTheme.typography.bodySmall,
        color = content,
      )
      Text(
        text = "Avg score ${formatScorePercent(summary.averageScore)} • Last ${formatTimeAgoShort(summary.latestBlockTimestampSec)}",
        style = MaterialTheme.typography.bodySmall,
        color = content,
      )
    }
  }
}

@Composable
private fun DueQuestionRow(item: StudyCardQueueItem) {
  Card(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
  ) {
    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Text(
        text = abbreviateHex(item.questionId, 12, 6),
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.SemiBold,
      )
      Text(
        text = "${item.state.name.lowercase().replaceFirstChar { it.uppercase() }} • due ${formatDue(item.dueAtSec)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Text(
        text = "difficulty ${item.difficulty} • stability ${item.stabilityDays}d • reps ${item.reps} • lapses ${item.lapses}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
  }
}

private fun abbreviateHex(value: String, prefix: Int, suffix: Int): String {
  if (value.length <= prefix + suffix + 3) return value
  return "${value.take(prefix)}...${value.takeLast(suffix)}"
}

private fun formatScorePercent(averageScore: Double): String {
  val pct = (averageScore / 100.0).coerceIn(0.0, 100.0)
  return String.format("%.1f%%", pct)
}

private fun formatDue(dueAtSec: Long): String {
  if (dueAtSec <= 0L) return "now"
  val nowSec = System.currentTimeMillis() / 1_000L
  val delta = dueAtSec - nowSec
  if (delta <= 0L) return "now"
  return when {
    delta < 60L -> "in ${delta}s"
    delta < 3_600L -> "in ${delta / 60L}m"
    delta < 86_400L -> "in ${delta / 3_600L}h"
    else -> "in ${delta / 86_400L}d"
  }
}
