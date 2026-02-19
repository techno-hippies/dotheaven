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
import androidx.compose.material3.MenuAnchorType
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

private data class DropdownOption(val value: String, val label: String)

private val GENRE_OPTIONS = listOf(
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

private val LANGUAGE_OPTIONS = listOf(
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

private val SECONDARY_LANGUAGE_OPTIONS = listOf(DropdownOption("", "None")) + LANGUAGE_OPTIONS

private val LICENSE_OPTIONS = listOf(
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

// ── Step 1: Song ─────────────────────────────────────────────────

@Composable
private fun SongStep(
  formData: SongPublishService.SongFormData,
  onFormChange: (SongPublishService.SongFormData) -> Unit,
  onPickAudio: () -> Unit,
  onPickVocals: () -> Unit,
  onPickInstrumental: () -> Unit,
  onPickCover: () -> Unit,
  getFileName: (Uri?) -> String?,
  onNext: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    // Cover art — square preview or placeholder
    Box(
      modifier = Modifier
        .size(160.dp)
        .align(Alignment.CenterHorizontally)
        .clip(RoundedCornerShape(12.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .border(
          width = 2.dp,
          color = if (formData.coverUri != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline,
          shape = RoundedCornerShape(12.dp),
        )
        .clickable { onPickCover() },
      contentAlignment = Alignment.Center,
    ) {
      if (formData.coverUri != null) {
        coil.compose.AsyncImage(
          model = formData.coverUri,
          contentDescription = "Cover Art",
          modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp)),
          contentScale = androidx.compose.ui.layout.ContentScale.Crop,
        )
      } else {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(32.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
          Spacer(modifier = Modifier.height(4.dp))
          Text("Cover Art", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
          Text("Square image", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
        }
      }
    }

    // Title
    OutlinedTextField(
      value = formData.title,
      onValueChange = { onFormChange(formData.copy(title = it)) },
      label = { Text("Song Title") },
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
    )

    // Artist
    OutlinedTextField(
      value = formData.artist,
      onValueChange = { onFormChange(formData.copy(artist = it)) },
      label = { Text("Artist Name") },
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
    )

    // Genre dropdown
    DropdownField(
      label = "Genre",
      options = GENRE_OPTIONS,
      selectedValue = formData.genre,
      onSelect = { onFormChange(formData.copy(genre = it)) },
    )

    // Audio file picker (full mix)
    FilePickerButton(
      label = "Full Mix (MP3/WAV/M4A)",
      fileName = getFileName(formData.audioUri),
      icon = { Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(24.dp)) },
      onClick = onPickAudio,
    )

    // Vocals stem picker (optional, reserved for future alignment pipeline)
    FilePickerButton(
      label = "Vocals Stem (optional)",
      fileName = getFileName(formData.vocalsUri),
      icon = { Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(24.dp)) },
      onClick = onPickVocals,
    )

    // Instrumental track (optional, reserved for future karaoke pipeline)
    FilePickerButton(
      label = "Instrumental Track (optional)",
      fileName = getFileName(formData.instrumentalUri),
      icon = { Icon(Icons.Rounded.MusicNote, contentDescription = null, modifier = Modifier.size(24.dp)) },
      onClick = onPickInstrumental,
    )

    Spacer(modifier = Modifier.weight(1f))

    Button(
      onClick = onNext,
      modifier = Modifier.fillMaxWidth(),
      enabled = formData.title.isNotBlank() &&
        formData.artist.isNotBlank() &&
        formData.audioUri != null &&
        formData.coverUri != null,
    ) {
      Text("Next")
    }
  }
}

// ── Step 2: Canvas ───────────────────────────────────────────────

@Composable
private fun CanvasStep(
  formData: SongPublishService.SongFormData,
  onPickCanvas: () -> Unit,
  onClearCanvas: () -> Unit,
  getFileName: (Uri?) -> String?,
  onNext: () -> Unit,
  onSkip: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text(
      "Add an optional canvas video (9:16 aspect ratio, 3-8 seconds).",
      style = MaterialTheme.typography.bodyLarge,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    if (formData.canvasUri != null) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Icon(Icons.Rounded.Videocam, contentDescription = null, modifier = Modifier.size(24.dp))
          Text(getFileName(formData.canvasUri) ?: "video", style = MaterialTheme.typography.bodyLarge)
        }
        IconButton(onClick = onClearCanvas) {
          Icon(Icons.Rounded.Close, contentDescription = "Remove")
        }
      }
    } else {
      FilePickerButton(
        label = "Canvas Video (MP4/WebM)",
        fileName = null,
        icon = { Icon(Icons.Rounded.Videocam, contentDescription = null, modifier = Modifier.size(24.dp)) },
        onClick = onPickCanvas,
      )
    }

    Spacer(modifier = Modifier.weight(1f))

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      OutlinedButton(onClick = onSkip, modifier = Modifier.weight(1f)) {
        Text("Skip")
      }
      Button(onClick = onNext, modifier = Modifier.weight(1f)) {
        Text("Next")
      }
    }
  }
}

// ── Step 3: Details ──────────────────────────────────────────────

@Composable
private fun DetailsStep(
  formData: SongPublishService.SongFormData,
  onFormChange: (SongPublishService.SongFormData) -> Unit,
  onNext: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    // Primary language
    DropdownField(
      label = "Primary Language",
      options = LANGUAGE_OPTIONS,
      selectedValue = formData.primaryLanguage,
      onSelect = { onFormChange(formData.copy(primaryLanguage = it)) },
    )

    // Secondary language
    DropdownField(
      label = "Secondary Language (optional)",
      options = SECONDARY_LANGUAGE_OPTIONS,
      selectedValue = formData.secondaryLanguage,
      onSelect = { onFormChange(formData.copy(secondaryLanguage = it)) },
    )

    // Lyrics
    OutlinedTextField(
      value = formData.lyrics,
      onValueChange = { onFormChange(formData.copy(lyrics = it)) },
      label = { Text("Lyrics") },
      modifier = Modifier.fillMaxWidth().height(200.dp),
      placeholder = { Text("Paste lyrics here...\n\n[Verse 1]\n...\n[Chorus]\n...") },
    )

    Spacer(modifier = Modifier.weight(1f))

    Button(
      onClick = onNext,
      modifier = Modifier.fillMaxWidth(),
      enabled = formData.primaryLanguage.isNotBlank() && formData.lyrics.isNotBlank(),
    ) {
      Text("Next")
    }
  }
}

// ── Step 4: License & Publish ────────────────────────────────────

@Composable
private fun LicenseStep(
  formData: SongPublishService.SongFormData,
  onFormChange: (SongPublishService.SongFormData) -> Unit,
  onPublish: () -> Unit,
  getFileName: (Uri?) -> String?,
) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    // License type
    DropdownField(
      label = "License Type",
      options = LICENSE_OPTIONS,
      selectedValue = formData.license,
      onSelect = { onFormChange(formData.copy(license = it)) },
    )

    // Rev share (only for commercial licenses)
    if (formData.license != "non-commercial") {
      Text("Revenue Share: ${formData.revShare}%", style = MaterialTheme.typography.bodyLarge)
      Slider(
        value = formData.revShare.toFloat(),
        onValueChange = { onFormChange(formData.copy(revShare = it.toInt())) },
        valueRange = 0f..100f,
        steps = 99,
      )
    }

    // Review summary
    Text("Review", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

    Column(
      modifier = Modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(8.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .padding(12.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      SummaryRow("Title", formData.title)
      SummaryRow("Artist", formData.artist)
      SummaryRow("Genre", GENRE_OPTIONS.find { it.value == formData.genre }?.label ?: formData.genre)
      SummaryRow("Language", LANGUAGE_OPTIONS.find { it.value == formData.primaryLanguage }?.label ?: formData.primaryLanguage)
      if (formData.secondaryLanguage.isNotBlank()) {
        SummaryRow("Secondary", LANGUAGE_OPTIONS.find { it.value == formData.secondaryLanguage }?.label ?: formData.secondaryLanguage)
      }
      SummaryRow("Lyrics", if (formData.lyrics.isBlank()) "(instrumental)" else "${formData.lyrics.lines().size} lines")
      SummaryRow("License", LICENSE_OPTIONS.find { it.value == formData.license }?.label ?: formData.license)
      if (formData.license != "non-commercial") {
        SummaryRow("Rev Share", "${formData.revShare}%")
      }
      SummaryRow("Audio", getFileName(formData.audioUri) ?: "—")
      SummaryRow("Instrumental", getFileName(formData.instrumentalUri) ?: "—")
    }

    // Attestation checkbox
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .clickable { onFormChange(formData.copy(attestation = !formData.attestation)) },
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Checkbox(
        checked = formData.attestation,
        onCheckedChange = { onFormChange(formData.copy(attestation = it)) },
      )
      Spacer(modifier = Modifier.width(8.dp))
      Text(
        "I own or have the rights to distribute this work",
        style = MaterialTheme.typography.bodyLarge,
      )
    }

    Button(
      onClick = onPublish,
      modifier = Modifier.fillMaxWidth(),
      enabled = formData.attestation,
    ) {
      Text("Publish")
    }
  }
}

// ── Publishing progress ──────────────────────────────────────────

@Composable
private fun PublishingStep(progress: Float) {
  val label = when {
    progress < 0.15f -> "Preparing files..."
    progress < 0.55f -> "Staging audio on Load..."
    progress < 0.90f -> "Running upload policy checks..."
    else -> "Finalizing publish..."
  }

  Column(
    modifier = Modifier.fillMaxSize().padding(32.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(label, style = MaterialTheme.typography.titleMedium)
    Spacer(modifier = Modifier.height(24.dp))
    LinearProgressIndicator(
      progress = { progress },
      modifier = Modifier.fillMaxWidth(),
    )
    Spacer(modifier = Modifier.height(12.dp))
    Text("${(progress * 100).toInt()}%", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

// ── Success ──────────────────────────────────────────────────────

@Composable
private fun SuccessStep(
  result: SongPublishService.PublishResult?,
  formData: SongPublishService.SongFormData? = null,
  onDone: () -> Unit,
) {
  Column(
    modifier = Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.SpaceBetween,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Spacer(modifier = Modifier.height(1.dp))
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Box(
        modifier = Modifier
          .size(64.dp)
          .clip(CircleShape)
          .background(Color(0xFF4CAF50)),
        contentAlignment = Alignment.Center,
      ) {
        Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
      }

      Spacer(modifier = Modifier.height(16.dp))
      Text("Song Published!", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
      Spacer(modifier = Modifier.height(20.dp))

      if (result != null && formData?.coverUri != null) {
        coil.compose.AsyncImage(
          model = formData.coverUri,
          contentDescription = "Cover Art",
          modifier = Modifier
            .size(120.dp)
            .clip(RoundedCornerShape(12.dp)),
          contentScale = androidx.compose.ui.layout.ContentScale.Crop,
        )
        Spacer(modifier = Modifier.height(12.dp))
      }
      if (formData != null) {
        Text(formData.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(formData.artist, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }

    Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
      Text("Done")
    }
  }
}

// ── Error ────────────────────────────────────────────────────────

@Composable
private fun ErrorStep(
  error: String,
  onRetry: () -> Unit,
) {
  Column(
    modifier = Modifier.fillMaxSize().padding(32.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Box(
      modifier = Modifier
        .size(64.dp)
        .clip(CircleShape)
        .background(Color(0xFFF44336)),
      contentAlignment = Alignment.Center,
    ) {
      Icon(Icons.Rounded.Warning, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
    }

    Spacer(modifier = Modifier.height(16.dp))
    Text("Publishing failed", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    Spacer(modifier = Modifier.height(12.dp))
    Text(
      error,
      style = MaterialTheme.typography.bodyLarge,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      textAlign = TextAlign.Center,
    )
    Spacer(modifier = Modifier.height(32.dp))
    Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
      Text("Try Again")
    }
  }
}

// ── Reusable components ──────────────────────────────────────────

@Composable
private fun FilePickerButton(
  label: String,
  fileName: String?,
  icon: @Composable () -> Unit,
  onClick: () -> Unit,
) {
  OutlinedButton(
    onClick = onClick,
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
  ) {
    icon()
    Spacer(modifier = Modifier.width(8.dp))
    Text(fileName ?: label, maxLines = 1)
    if (fileName != null) {
      Spacer(modifier = Modifier.width(8.dp))
      Icon(Icons.Rounded.Check, contentDescription = null, tint = Color(0xFF4CAF50), modifier = Modifier.size(20.dp))
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownField(
  label: String,
  options: List<DropdownOption>,
  selectedValue: String,
  onSelect: (String) -> Unit,
) {
  var expanded by remember { mutableStateOf(false) }
  val selectedLabel = options.find { it.value == selectedValue }?.label ?: selectedValue

  ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
    OutlinedTextField(
      value = selectedLabel,
      onValueChange = {},
      readOnly = true,
      label = { Text(label) },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
      modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
    )
    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
      options.forEach { option ->
        DropdownMenuItem(
          text = { Text(option.label) },
          onClick = {
            onSelect(option.value)
            expanded = false
          },
        )
      }
    }
  }
}

@Composable
private fun SummaryRow(label: String, value: String) {
  Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
  }
}

@Composable
private fun MonoRow(label: String, value: String) {
  Column {
    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(
      value,
      style = MaterialTheme.typography.bodyMedium,
      fontFamily = FontFamily.Monospace,
      maxLines = 1,
    )
  }
}
