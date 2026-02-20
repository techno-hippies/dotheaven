package com.pirate.app.music

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.identity.SelfVerificationGate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ── Step enum ───────────────────────────────────────────────────

private enum class PublishStep { SONG, CANVAS, DETAILS, LICENSE, PUBLISHING, SUCCESS, ERROR }

// ── Constants ───────────────────────────────────────────────────

internal data class DropdownOption(val value: String, val label: String)

internal val GENRE_OPTIONS = listOf(
  DropdownOption("pop", "Pop"), DropdownOption("rock", "Rock"),
  DropdownOption("hip-hop", "Hip-Hop / Rap"), DropdownOption("rnb", "R&B / Soul"),
  DropdownOption("electronic", "Electronic / Dance"), DropdownOption("blues", "Blues"),
  DropdownOption("jazz", "Jazz"), DropdownOption("classical", "Classical"),
  DropdownOption("country", "Country"), DropdownOption("folk", "Folk / Acoustic"),
  DropdownOption("metal", "Metal"), DropdownOption("punk", "Punk"),
  DropdownOption("indie", "Indie"), DropdownOption("kpop", "K-Pop"),
  DropdownOption("jpop", "J-Pop"), DropdownOption("latin", "Latin"),
  DropdownOption("reggae", "Reggae / Dancehall"), DropdownOption("afrobeats", "Afrobeats"),
  DropdownOption("ambient", "Ambient"), DropdownOption("soundtrack", "Soundtrack / Score"),
  DropdownOption("other", "Other"),
)

internal val LANGUAGE_OPTIONS = listOf(
  DropdownOption("en", "English"), DropdownOption("es", "Spanish"),
  DropdownOption("fr", "French"), DropdownOption("de", "German"),
  DropdownOption("it", "Italian"), DropdownOption("pt", "Portuguese"),
  DropdownOption("ru", "Russian"), DropdownOption("ja", "Japanese"),
  DropdownOption("ko", "Korean"), DropdownOption("zh", "Mandarin Chinese"),
  DropdownOption("ar", "Arabic"), DropdownOption("hi", "Hindi"),
  DropdownOption("tr", "Turkish"), DropdownOption("th", "Thai"),
  DropdownOption("vi", "Vietnamese"), DropdownOption("id", "Indonesian"),
  DropdownOption("tl", "Tagalog"), DropdownOption("sw", "Swahili"),
)

internal val SECONDARY_LANGUAGE_OPTIONS = listOf(DropdownOption("", "None")) + LANGUAGE_OPTIONS

internal val LICENSE_OPTIONS = listOf(
  DropdownOption("non-commercial", "Non-Commercial Social Remixing"),
  DropdownOption("commercial-use", "Commercial Use"),
  DropdownOption("commercial-remix", "Commercial Remix"),
)

// ── Main Screen ─────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PublishScreen(
  authState: PirateAuthUiState,
  ownerAddress: String?,
  heavenName: String?,
  isAuthenticated: Boolean,
  onSelfVerifiedChange: (Boolean) -> Unit = {},
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  // Gate: require Self.xyz identity verification before showing publish form.
  if (!isAuthenticated || ownerAddress == null) {
    LaunchedEffect(Unit) {
      onShowMessage("Please sign in first")
      onClose()
    }
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
      Text("Redirecting…", style = MaterialTheme.typography.bodyLarge)
    }
    return
  }

  SelfVerificationGate(
    pkpAddress = ownerAddress,
    cachedVerified = authState.selfVerified,
    onVerified = { onSelfVerifiedChange(true) },
  ) {
    PublishFormContent(
      ownerAddress = ownerAddress,
      heavenName = heavenName,
      onClose = onClose,
      onShowMessage = onShowMessage,
    )
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PublishFormContent(
  ownerAddress: String,
  heavenName: String?,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  // Auto-fill artist with primary name (e.g. "alice.heaven" or "alice.pirate"), user can change it.
  val defaultArtist = heavenName ?: ""

  var step by remember { mutableStateOf(PublishStep.SONG) }
  var formData by remember { mutableStateOf(SongPublishService.SongFormData(artist = defaultArtist)) }
  var progress by remember { mutableFloatStateOf(0f) }
  var errorMessage by remember { mutableStateOf("") }
  var publishResult by remember { mutableStateOf<SongPublishService.PublishResult?>(null) }

  // File pickers
  val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    if (uri != null) formData = formData.copy(audioUri = uri)
  }
  val vocalsPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    if (uri != null) formData = formData.copy(vocalsUri = uri)
  }
  val instrumentalPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    if (uri != null) formData = formData.copy(instrumentalUri = uri)
  }
  val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    if (uri != null) formData = formData.copy(coverUri = uri)
  }
  val canvasPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    if (uri != null) formData = formData.copy(canvasUri = uri)
  }

  fun getFileName(uri: Uri?): String? {
    if (uri == null) return null
    return uri.lastPathSegment?.substringAfterLast('/') ?: "file"
  }

  fun doPublish() {
    fun buildErrorSummary(error: Throwable): String {
      val parts = ArrayList<String>(4)
      var cur: Throwable? = error
      while (cur != null && parts.size < 4) {
        val msg = cur.message?.trim().orEmpty()
        if (msg.isNotEmpty()) parts.add(msg)
        cur = cur.cause
      }
      return parts.distinct().joinToString(" | ").ifBlank { "Unknown error" }
    }

    step = PublishStep.PUBLISHING
    progress = 0f

    scope.launch {
      try {
        val result = withContext(Dispatchers.IO) {
          SongPublishService.publish(
            context = context,
            formData = formData,
            ownerAddress = ownerAddress,
            onProgress = { pct -> progress = pct / 100f },
          )
        }
        publishResult = result
        step = PublishStep.SUCCESS
      } catch (e: Exception) {
        android.util.Log.e("PublishScreen", "Publish failed", e)
        errorMessage = buildErrorSummary(e)
        step = PublishStep.ERROR
      }
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Text(
            when (step) {
              PublishStep.SONG -> "Your Song"
              PublishStep.CANVAS -> "Canvas (Optional)"
              PublishStep.DETAILS -> "Details"
              PublishStep.LICENSE -> "License & Publish"
              PublishStep.PUBLISHING -> "Publishing..."
              PublishStep.SUCCESS -> "Song Published!"
              PublishStep.ERROR -> "Error"
            },
          )
        },
        navigationIcon = {
          if (step != PublishStep.PUBLISHING) {
            IconButton(onClick = {
              when (step) {
                PublishStep.SONG -> onClose()
                PublishStep.CANVAS -> step = PublishStep.SONG
                PublishStep.DETAILS -> step = PublishStep.CANVAS
                PublishStep.LICENSE -> step = PublishStep.DETAILS
                PublishStep.SUCCESS -> onClose()
                PublishStep.ERROR -> step = PublishStep.LICENSE
                else -> {}
              }
            }) {
              Icon(
                if (step == PublishStep.SUCCESS) Icons.Rounded.Close else Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = "Back",
              )
            }
          }
        },
      )
    },
  ) { padding ->
    AnimatedContent(
      targetState = step,
      modifier = Modifier.padding(padding),
      label = "publish-step",
    ) { currentStep ->
      when (currentStep) {
        PublishStep.SONG -> SongStep(
          formData = formData,
          onFormChange = { formData = it },
          onPickAudio = { audioPicker.launch("audio/*") },
          onPickVocals = { vocalsPicker.launch("audio/*") },
          onPickInstrumental = { instrumentalPicker.launch("audio/*") },
          onPickCover = { coverPicker.launch("image/*") },
          getFileName = ::getFileName,
          onNext = { step = PublishStep.CANVAS },
        )

        PublishStep.CANVAS -> CanvasStep(
          formData = formData,
          onPickCanvas = { canvasPicker.launch("video/*") },
          onClearCanvas = { formData = formData.copy(canvasUri = null) },
          getFileName = ::getFileName,
          onNext = { step = PublishStep.DETAILS },
          onSkip = { step = PublishStep.DETAILS },
        )

        PublishStep.DETAILS -> DetailsStep(
          formData = formData,
          onFormChange = { formData = it },
          onNext = { step = PublishStep.LICENSE },
        )

        PublishStep.LICENSE -> LicenseStep(
          formData = formData,
          onFormChange = { formData = it },
          onPublish = { doPublish() },
          getFileName = ::getFileName,
        )

        PublishStep.PUBLISHING -> PublishingStep(progress = progress)

        PublishStep.SUCCESS -> SuccessStep(
          result = publishResult,
          formData = formData,
          onDone = onClose,
        )

        PublishStep.ERROR -> ErrorStep(
          error = errorMessage,
          onRetry = { step = PublishStep.LICENSE },
        )
      }
    }
  }
}
