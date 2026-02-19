package com.pirate.app.profile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.onboarding.steps.LANGUAGE_OPTIONS
import com.pirate.app.onboarding.steps.LocationResult
import com.pirate.app.onboarding.steps.searchLocations
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoAccountFactory
import com.pirate.app.tempo.TempoSessionKeyApi
import com.pirate.app.theme.PiratePalette
import com.pirate.app.util.resolveAvatarUrl
import java.io.ByteArrayOutputStream
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val MAX_AVATAR_SIZE = 512
private const val JPEG_QUALITY = 85
private const val MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

private enum class ProfileEditSheet {
  DisplayName,
  Photo,
  Basics,
  Languages,
  Location,
  School,
  Preferences,
}

private data class LoadedProfileContext(
  val profile: ContractProfileData,
  val heavenName: String?,
  val node: String?,
  val avatarRecord: String?,
  val locationRecord: String?,
  val schoolRecord: String?,
)

private data class CountryOption(
  val code: String,
  val label: String,
)

private data class LanguageProficiencyOption(
  val value: Int,
  val label: String,
)

private val proficiencyOptions = listOf(
  LanguageProficiencyOption(1, "A1"),
  LanguageProficiencyOption(2, "A2"),
  LanguageProficiencyOption(3, "B1"),
  LanguageProficiencyOption(4, "B2"),
  LanguageProficiencyOption(5, "C1"),
  LanguageProficiencyOption(6, "C2"),
  LanguageProficiencyOption(7, "Native"),
)

private val countryOptions: List<CountryOption> by lazy {
  val countries = Locale.getISOCountries()
    .mapNotNull { code ->
      runCatching {
        val label = Locale.Builder().setRegion(code).build().displayCountry.trim()
        if (label.isBlank()) null else CountryOption(code = code.uppercase(), label = label)
      }.getOrNull()
    }
    .distinctBy { it.code }
    .sortedBy { it.label }
  listOf(CountryOption("", "Not specified")) + countries
}

private fun countryLabel(code: String): String {
  val normalized = code.trim().uppercase()
  if (normalized.isBlank()) return "Not specified"
  return countryOptions.firstOrNull { it.code == normalized }?.label ?: normalized
}

private fun processAvatarImage(context: android.content.Context, uri: Uri): Pair<Bitmap, String> {
  val inputStream = context.contentResolver.openInputStream(uri)
    ?: throw IllegalStateException("Cannot open image")
  val bytes = inputStream.readBytes()
  inputStream.close()

  if (bytes.size > MAX_FILE_SIZE) {
    val sizeMB = String.format(Locale.US, "%.1f", bytes.size / (1024.0 * 1024.0))
    throw IllegalStateException("Image is too large (${sizeMB} MB). Please use an image under 2 MB.")
  }

  val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    ?: throw IllegalStateException("Cannot decode image")

  val (w, h) = original.width to original.height
  val scale = if (w > MAX_AVATAR_SIZE || h > MAX_AVATAR_SIZE) {
    MAX_AVATAR_SIZE.toFloat() / maxOf(w, h)
  } else {
    1f
  }
  val targetW = (w * scale).toInt().coerceAtLeast(1)
  val targetH = (h * scale).toInt().coerceAtLeast(1)
  val scaled = if (scale < 1f) Bitmap.createScaledBitmap(original, targetW, targetH, true) else original

  val out = ByteArrayOutputStream()
  scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
  val jpegBytes = out.toByteArray()
  val base64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)

  return scaled to base64
}

private fun basicsSummary(draft: ContractProfileData): String {
  val parts = buildList {
    if (draft.age > 0) add("${draft.age} yrs")
    if (draft.heightCm > 0) add("${draft.heightCm} cm")
    if (draft.nationality.isNotBlank()) add(countryLabel(draft.nationality))
  }
  return if (parts.isEmpty()) "Age, height, nationality" else parts.joinToString(" · ")
}

private fun languageSummary(entries: List<ProfileLanguageEntry>): String {
  if (entries.isEmpty()) return "No languages set"
  return entries.joinToString(" · ") { entry ->
    "${ProfileContractApi.languageLabel(entry.code)} (${ProfileContractApi.proficiencyLabel(entry.proficiency)})"
  }
}

private fun locationSummary(locationLabel: String, draft: ContractProfileData): String {
  if (locationLabel.isNotBlank()) return locationLabel
  if (draft.locationCityId.isNotBlank()) return "Location set"
  return "No location set"
}

private fun schoolSummary(schoolName: String, draft: ContractProfileData): String {
  if (schoolName.isNotBlank()) return schoolName
  if (draft.schoolId.isNotBlank()) return "School set"
  return "No school set"
}

private fun preferenceSummary(draft: ContractProfileData): String {
  var setCount = listOf(
    draft.gender,
    draft.relocate,
    draft.degree,
    draft.fieldBucket,
    draft.profession,
    draft.industry,
    draft.relationshipStatus,
    draft.sexuality,
    draft.ethnicity,
    draft.datingStyle,
    draft.children,
    draft.wantsChildren,
    draft.drinking,
    draft.smoking,
    draft.drugs,
    draft.lookingFor,
    draft.religion,
    draft.pets,
    draft.diet,
  ).count { it > 0 }
  if ((draft.friendsOpenToMask and 0x07) != 0) setCount += 1
  return if (setCount == 0) "No preferences set" else "$setCount fields set"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileEditScreen(
  activity: androidx.fragment.app.FragmentActivity,
  ethAddress: String,
  tempoAddress: String?,
  tempoCredentialId: String?,
  tempoPubKeyX: String?,
  tempoPubKeyY: String?,
  tempoRpId: String,
  onBack: () -> Unit,
  onSaved: () -> Unit,
) {
  val appContext = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  val tempoAccount = remember(tempoAddress, tempoCredentialId, tempoPubKeyX, tempoPubKeyY, tempoRpId) {
    TempoAccountFactory.fromSession(
      tempoAddress = tempoAddress,
      tempoCredentialId = tempoCredentialId,
      tempoPubKeyX = tempoPubKeyX,
      tempoPubKeyY = tempoPubKeyY,
      tempoRpId = tempoRpId,
    )
  }

  var loading by remember { mutableStateOf(true) }
  var saving by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var draft by remember { mutableStateOf(ProfileContractApi.emptyProfile()) }
  var activeSheet by remember { mutableStateOf<ProfileEditSheet?>(null) }

  var heavenName by remember { mutableStateOf<String?>(null) }
  var profileNode by remember { mutableStateOf<String?>(null) }

  var avatarUri by remember { mutableStateOf<String?>(null) }
  var avatarPreviewBitmap by remember { mutableStateOf<Bitmap?>(null) }
  var avatarBase64 by remember { mutableStateOf<String?>(null) }
  var avatarDirty by remember { mutableStateOf(false) }

  var locationLabel by remember { mutableStateOf("") }
  var selectedLocation by remember { mutableStateOf<LocationResult?>(null) }
  var locationDirty by remember { mutableStateOf(false) }

  var schoolName by remember { mutableStateOf("") }
  var schoolDirty by remember { mutableStateOf(false) }

  var sessionKey by remember { mutableStateOf<SessionKeyManager.SessionKey?>(null) }

  val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    uri ?: return@rememberLauncherForActivityResult
    runCatching { processAvatarImage(appContext, uri) }
      .onSuccess { (bitmap, base64) ->
        avatarPreviewBitmap = bitmap
        avatarBase64 = base64
        avatarDirty = true
      }
      .onFailure { err ->
        error = err.message ?: "Failed to process image"
      }
  }

  LaunchedEffect(ethAddress, tempoAccount?.address, tempoAccount?.credentialId) {
    loading = true
    error = null
    runCatching {
      withContext(Dispatchers.IO) {
        val profile = ProfileContractApi.fetchProfile(ethAddress) ?: ProfileContractApi.emptyProfile()
        val name = TempoNameRecordsApi.getPrimaryName(ethAddress)
        val node = name?.let { TempoNameRecordsApi.computeNode(it) }
        val avatarRecord = node?.let { TempoNameRecordsApi.getTextRecord(it, "avatar") }
        val locationRecord = node?.let { TempoNameRecordsApi.getTextRecord(it, "heaven.location") }
        val schoolRecord = node?.let { TempoNameRecordsApi.getTextRecord(it, "heaven.school") }
        LoadedProfileContext(
          profile = profile,
          heavenName = name,
          node = node,
          avatarRecord = avatarRecord,
          locationRecord = locationRecord,
          schoolRecord = schoolRecord,
        )
      }
    }
      .onSuccess { ctx ->
        draft = ctx.profile
        heavenName = ctx.heavenName
        profileNode = ctx.node

        avatarUri = ctx.avatarRecord?.ifBlank { null } ?: ctx.profile.photoUri.ifBlank { null }
        avatarPreviewBitmap = null
        avatarBase64 = null
        avatarDirty = false

        locationLabel = ctx.locationRecord?.trim().orEmpty()
        selectedLocation = if (locationLabel.isNotBlank() && ProfileContractApi.hasCoords(draft.locationLatE6, draft.locationLngE6)) {
          LocationResult(
            label = locationLabel,
            lat = draft.locationLatE6.toDouble() / 1_000_000.0,
            lng = draft.locationLngE6.toDouble() / 1_000_000.0,
            countryCode = null,
          )
        } else {
          null
        }
        locationDirty = false

        schoolName = ctx.schoolRecord?.trim().orEmpty()
        schoolDirty = false

        // Load session key for silent signing
        if (tempoAccount != null) {
          val loaded = SessionKeyManager.load(activity)
          if (SessionKeyManager.isValid(loaded, ownerAddress = tempoAccount.address) &&
            loaded?.keyAuthorization?.isNotEmpty() == true
          ) {
            sessionKey = loaded
          }
        }
        loading = false
      }
      .onFailure { err ->
        loading = false
        error = err.message ?: "Failed to load profile"
      }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colorScheme.background),
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .statusBarsPadding()
        .padding(horizontal = 8.dp, vertical = 6.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      IconButton(onClick = onBack, enabled = !saving) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
      }
      Text(
        "Edit Profile",
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.weight(1f),
      )
      TextButton(
        onClick = {
          if (saving) return@TextButton
          val activeTempoAccount = tempoAccount
          if (activeTempoAccount == null) {
            error = "Tempo passkey account required."
            return@TextButton
          }
          if (!activeTempoAccount.address.equals(ethAddress, ignoreCase = true)) {
            error = "Active address does not match Tempo passkey account."
            return@TextButton
          }
          saving = true
          error = null
          scope.launch {
            var working = draft
            var nextAvatarUri = avatarUri.orEmpty()
            var activeSessionKey = sessionKey

            if (avatarDirty) {
              if (!avatarBase64.isNullOrBlank()) {
                if (activeSessionKey == null) {
                  Log.d("ProfileEdit", "No session key for avatar upload, authorizing...")
                  val authResult = TempoSessionKeyApi.authorizeSessionKey(
                    activity = activity,
                    account = activeTempoAccount,
                    rpId = activeTempoAccount.rpId,
                  )
                  if (authResult.success && authResult.sessionKey != null) {
                    activeSessionKey = authResult.sessionKey
                    sessionKey = activeSessionKey
                    Log.d("ProfileEdit", "Session key authorized for avatar upload")
                  } else {
                    error = authResult.error ?: "Session key authorization failed for avatar upload."
                    saving = false
                    return@launch
                  }
                }

                val uploadResult = withContext(Dispatchers.IO) {
                  val jpegBytes = Base64.decode(avatarBase64, Base64.DEFAULT)
                  ProfileAvatarUploadApi.uploadAvatarJpeg(
                    appContext = appContext,
                    ownerEthAddress = activeTempoAccount.address,
                    jpegBytes = jpegBytes,
                  )
                }
                if (!uploadResult.success || uploadResult.avatarRef.isNullOrBlank()) {
                  error = uploadResult.error ?: "Avatar upload failed"
                  saving = false
                  return@launch
                }
                nextAvatarUri = uploadResult.avatarRef
              }
              working = working.copy(photoUri = nextAvatarUri)
            } else if (!avatarUri.isNullOrBlank() && working.photoUri.isBlank()) {
              working = working.copy(photoUri = avatarUri!!)
            }

            if (locationDirty) {
              if (locationLabel.isBlank()) {
                working = working.copy(
                  locationCityId = "",
                  locationLatE6 = 0,
                  locationLngE6 = 0,
                )
              } else {
                val picked = selectedLocation
                if (picked != null) {
                  working = working.copy(
                    locationCityId = picked.label,
                    locationLatE6 = (picked.lat * 1_000_000.0).toInt(),
                    locationLngE6 = (picked.lng * 1_000_000.0).toInt(),
                  )
                } else {
                  working = working.copy(locationCityId = locationLabel)
                }
              }
            }

            if (schoolDirty) {
              working = working.copy(schoolId = schoolName.trim())
            }

            val payload = ProfileContractApi.buildProfileInput(working)

            // Ensure session key for silent signing
            if (activeSessionKey == null) {
              Log.d("ProfileEdit", "No session key, authorizing...")
              val authResult = TempoSessionKeyApi.authorizeSessionKey(
                activity = activity,
                account = activeTempoAccount,
                rpId = activeTempoAccount.rpId,
              )
              if (authResult.success && authResult.sessionKey != null) {
                activeSessionKey = authResult.sessionKey
                sessionKey = activeSessionKey
                Log.d("ProfileEdit", "Session key authorized")
              } else {
                Log.w("ProfileEdit", "Session key auth failed: ${authResult.error}, falling back to passkey")
              }
            }

            val profileResult =
              TempoProfileContractApi.upsertProfile(
                activity = activity,
                account = activeTempoAccount,
                profileInput = payload,
                rpId = activeTempoAccount.rpId,
                sessionKey = activeSessionKey,
              )
            val profileError = if (profileResult.success) null else profileResult.error ?: "Profile update failed"
            if (profileError != null) {
              error = profileError
              saving = false
              return@launch
            }

            val node = profileNode
            if (node != null) {
              val keys = mutableListOf<String>()
              val values = mutableListOf<String>()

              if (avatarDirty) {
                keys.add("avatar")
                values.add(nextAvatarUri)
              }
              if (locationDirty) {
                keys.add("heaven.location")
                values.add(locationLabel)
              }
              if (schoolDirty) {
                keys.add("heaven.school")
                values.add(schoolName.trim())
              }

              if (keys.isNotEmpty()) {
                val recordResult =
                  TempoNameRecordsApi.setTextRecords(
                    activity = activity,
                    account = activeTempoAccount,
                    node = node,
                    keys = keys,
                    values = values,
                    rpId = activeTempoAccount.rpId,
                    sessionKey = activeSessionKey,
                  )
                if (!recordResult.success) {
                  error = "Profile saved, but name records failed to sync: ${recordResult.error ?: "Unknown error"}"
                  saving = false
                  return@launch
                }
              }
            }

            draft = working
            avatarUri = nextAvatarUri.ifBlank { null }
            avatarBase64 = null
            avatarPreviewBitmap = null
            avatarDirty = false
            locationDirty = false
            schoolDirty = false
            onSaved()
            saving = false
          }
        },
        enabled = !loading && !saving,
      ) {
        Text(if (saving) "Saving..." else "Save")
      }
    }

    when {
      loading -> {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          CircularProgressIndicator()
        }
      }
      else -> {
        Column(
          modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          if (!error.isNullOrBlank()) {
            Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
          }
          if (heavenName.isNullOrBlank()) {
            Text(
              "Tip: claim a .heaven or .pirate name to sync avatar, location, and school across name records.",
              color = PiratePalette.TextMuted,
              style = MaterialTheme.typography.bodyMedium,
            )
          }

          SectionCard("Identity") {
            EditSummaryRow(
              title = "Display Name",
              value = draft.displayName.ifBlank { "Not set" },
              onClick = { activeSheet = ProfileEditSheet.DisplayName },
            )
            EditSummaryRow(
              title = "Profile Photo",
              value = when {
                avatarPreviewBitmap != null -> "New photo selected"
                !avatarUri.isNullOrBlank() -> "Tap to change"
                else -> "No photo"
              },
              trailingPreview = {
                ProfilePhotoSummaryPreview(
                  previewBitmap = avatarPreviewBitmap,
                  avatarUri = avatarUri,
                )
              },
              onClick = { activeSheet = ProfileEditSheet.Photo },
            )
          }

          SectionCard("Basics") {
            EditSummaryRow(
              title = "About Me",
              value = basicsSummary(draft),
              onClick = { activeSheet = ProfileEditSheet.Basics },
            )
            EditSummaryRow(
              title = "Languages",
              value = languageSummary(draft.languages),
              onClick = { activeSheet = ProfileEditSheet.Languages },
            )
          }

          SectionCard("Location & Education") {
            EditSummaryRow(
              title = "Location",
              value = locationSummary(locationLabel, draft),
              onClick = { activeSheet = ProfileEditSheet.Location },
            )
            EditSummaryRow(
              title = "School",
              value = schoolSummary(schoolName, draft),
              onClick = { activeSheet = ProfileEditSheet.School },
            )
          }

          SectionCard("Preferences") {
            EditSummaryRow(
              title = "Dating & Lifestyle",
              value = preferenceSummary(draft),
              onClick = { activeSheet = ProfileEditSheet.Preferences },
            )
          }

          Spacer(Modifier.height(16.dp))
        }
      }
    }
  }

  val sheet = activeSheet
  if (sheet != null) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
      onDismissRequest = { activeSheet = null },
      sheetState = sheetState,
      containerColor = Color(0xFF1C1C1C),
    ) {
      when (sheet) {
        ProfileEditSheet.DisplayName -> {
          var value by remember(draft.displayName) { mutableStateOf(draft.displayName) }
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            Text("Display Name", style = MaterialTheme.typography.titleLarge)
            LabeledTextField(
              label = "Name",
              value = value,
              placeholder = "Enter a display name",
              onValueChange = { value = it },
            )
            Button(
              onClick = {
                draft = draft.copy(displayName = value.trim())
                activeSheet = null
              },
              modifier = Modifier.fillMaxWidth(),
            ) {
              Text("Done")
            }
          }
        }

        ProfileEditSheet.Photo -> {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
          ) {
            Text("Profile Photo", style = MaterialTheme.typography.titleLarge)
            Surface(
              modifier = Modifier
                .size(124.dp)
                .align(Alignment.CenterHorizontally),
              shape = RoundedCornerShape(62.dp),
              color = Color(0xFF262626),
            ) {
              val resolved = resolveAvatarUrl(avatarUri)
              Box(contentAlignment = Alignment.Center) {
                when {
                  avatarPreviewBitmap != null -> {
                    Image(
                      bitmap = avatarPreviewBitmap!!.asImageBitmap(),
                      contentDescription = "Avatar preview",
                      contentScale = ContentScale.Crop,
                      modifier = Modifier.fillMaxSize(),
                    )
                  }
                  resolved != null -> {
                    AsyncImage(
                      model = resolved,
                      contentDescription = "Avatar",
                      contentScale = ContentScale.Crop,
                      modifier = Modifier.fillMaxSize(),
                    )
                  }
                  else -> {
                    Icon(
                      imageVector = Icons.Rounded.AddAPhoto,
                      contentDescription = null,
                      tint = PiratePalette.TextMuted,
                      modifier = Modifier.size(30.dp),
                    )
                  }
                }
              }
            }
            Text(
              "Pick an image and we will upload it to IPFS through Heaven API.",
              color = PiratePalette.TextMuted,
              style = MaterialTheme.typography.bodyMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
              Button(
                onClick = { imagePicker.launch("image/*") },
                modifier = Modifier.weight(1f),
              ) {
                Text("Choose Photo")
              }
              TextButton(
                onClick = {
                  avatarUri = null
                  avatarPreviewBitmap = null
                  avatarBase64 = null
                  avatarDirty = true
                },
                enabled = avatarUri != null || avatarPreviewBitmap != null,
                modifier = Modifier.weight(1f),
              ) {
                Icon(Icons.Rounded.Delete, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Remove")
              }
            }
            Button(
              onClick = { activeSheet = null },
              modifier = Modifier.fillMaxWidth(),
            ) {
              Text("Done")
            }
          }
        }

        ProfileEditSheet.Basics -> {
          BasicsEditorSheet(
            draft = draft,
            onDraftChange = { draft = it },
            onDone = { activeSheet = null },
          )
        }

        ProfileEditSheet.Languages -> {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .fillMaxHeight(0.9f)
              .verticalScroll(rememberScrollState())
              .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            Text("Languages", style = MaterialTheme.typography.titleLarge)
            LanguageEditor(
              entries = draft.languages,
              onChange = { draft = draft.copy(languages = it) },
            )
            Button(
              onClick = { activeSheet = null },
              modifier = Modifier.fillMaxWidth(),
            ) {
              Text("Done")
            }
          }
        }

        ProfileEditSheet.Location -> {
          LocationEditorSheet(
            initialLocationLabel = locationLabel,
            initialSelection = selectedLocation,
            initialLatE6 = draft.locationLatE6,
            initialLngE6 = draft.locationLngE6,
            onApply = { selection, clearLocation ->
              when {
                clearLocation -> {
                  locationLabel = ""
                  selectedLocation = null
                  locationDirty = true
                }
                selection != null && selection.label != locationLabel -> {
                  locationLabel = selection.label
                  selectedLocation = selection
                  locationDirty = true
                }
              }
              activeSheet = null
            },
            onCancel = { activeSheet = null },
          )
        }

        ProfileEditSheet.School -> {
          SchoolEditorSheet(
            initialSchoolName = schoolName,
            onApply = { updatedSchool ->
              val schoolTrimmed = updatedSchool.trim()
              if (schoolTrimmed != schoolName) {
                schoolName = schoolTrimmed
                schoolDirty = true
              }
              activeSheet = null
            },
            onCancel = { activeSheet = null },
          )
        }

        ProfileEditSheet.Preferences -> {
          PreferencesEditorSheet(
            draft = draft,
            onDraftChange = { draft = it },
            onDone = { activeSheet = null },
          )
        }
      }
    }
  }
}

@Composable
private fun SectionCard(
  title: String,
  content: @Composable ColumnScope.() -> Unit,
) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
    color = Color(0xFF1C1C1C),
    shape = RoundedCornerShape(16.dp),
  ) {
    Column(
      modifier = Modifier.padding(14.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
      content()
    }
  }
}

@Composable
private fun EditSummaryRow(
  title: String,
  value: String,
  trailingPreview: (@Composable () -> Unit)? = null,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .padding(vertical = 8.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(modifier = Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onBackground)
      Text(value, style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    }
    trailingPreview?.invoke()
    if (trailingPreview != null) Spacer(Modifier.width(10.dp))
    Icon(
      imageVector = Icons.Rounded.ChevronRight,
      contentDescription = null,
      tint = PiratePalette.TextMuted,
    )
  }
  HorizontalDivider(color = Color(0xFF333333))
}

@Composable
private fun ProfilePhotoSummaryPreview(
  previewBitmap: Bitmap?,
  avatarUri: String?,
) {
  Surface(
    modifier = Modifier.size(40.dp),
    shape = RoundedCornerShape(20.dp),
    color = Color(0xFF262626),
  ) {
    val resolved = resolveAvatarUrl(avatarUri)
    Box(contentAlignment = Alignment.Center) {
      when {
        previewBitmap != null -> {
          Image(
            bitmap = previewBitmap.asImageBitmap(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        }
        resolved != null -> {
          AsyncImage(
            model = resolved,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        }
        else -> {
          Icon(
            imageVector = Icons.Rounded.AddAPhoto,
            contentDescription = null,
            tint = PiratePalette.TextMuted,
            modifier = Modifier.size(20.dp),
          )
        }
      }
    }
  }
}

@Composable
private fun LabeledTextField(
  label: String,
  value: String,
  placeholder: String,
  keyboardType: KeyboardType = KeyboardType.Text,
  onValueChange: (String) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label, style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    OutlinedTextField(
      value = value,
      onValueChange = onValueChange,
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
      placeholder = { Text(placeholder) },
      keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
    )
  }
}

@Composable
private fun NumericField(
  label: String,
  value: Int,
  onValueChange: (Int) -> Unit,
) {
  val display = if (value == 0) "" else value.toString()
  LabeledTextField(
    label = label,
    value = display,
    placeholder = "0",
    keyboardType = KeyboardType.Number,
    onValueChange = { next ->
      val parsed = next.filter { it.isDigit() }.take(3).toIntOrNull() ?: 0
      onValueChange(parsed)
    },
  )
}

@Composable
private fun BasicsEditorSheet(
  draft: ContractProfileData,
  onDraftChange: (ContractProfileData) -> Unit,
  onDone: () -> Unit,
) {
  val selectedCountry = countryOptions.firstOrNull { it.code.equals(draft.nationality, ignoreCase = true) }
    ?: countryOptions.first()
  var nationalityQuery by remember { mutableStateOf("") }
  var nationalityFocused by remember { mutableStateOf(false) }
  val filteredCountries = remember(nationalityQuery) {
    val q = nationalityQuery.trim().lowercase()
    if (q.isBlank()) {
      countryOptions.take(20)
    } else {
      countryOptions.filter { it.label.lowercase().contains(q) }
    }
  }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .fillMaxHeight(0.9f)
      .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("Basics", style = MaterialTheme.typography.titleLarge)
    NumericField(
      label = "Age",
      value = draft.age,
      onValueChange = { onDraftChange(draft.copy(age = it.coerceIn(0, 120))) },
    )
    NumericField(
      label = "Height (cm)",
      value = draft.heightCm,
      onValueChange = { onDraftChange(draft.copy(heightCm = it.coerceIn(0, 300))) },
    )

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Text("Nationality", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
      OutlinedTextField(
        value = if (nationalityFocused) nationalityQuery else selectedCountry.label,
        onValueChange = { nationalityQuery = it },
        modifier = Modifier
          .fillMaxWidth()
          .onFocusChanged { state ->
            if (state.isFocused && !nationalityFocused) {
              nationalityFocused = true
              nationalityQuery = ""
            } else if (!state.isFocused) {
              nationalityFocused = false
            }
          },
        singleLine = true,
        placeholder = { Text("Search country...") },
        trailingIcon = {
          if (nationalityFocused && nationalityQuery.isNotBlank()) {
            IconButton(onClick = { nationalityQuery = "" }) {
              Icon(Icons.Rounded.Close, contentDescription = "Clear")
            }
          }
        },
      )
      if (nationalityFocused && filteredCountries.isNotEmpty()) {
        Surface(color = Color(0xFF262626), shape = RoundedCornerShape(12.dp)) {
          LazyColumn(
            modifier = Modifier
              .fillMaxWidth()
              .heightIn(max = 220.dp),
          ) {
            items(filteredCountries, key = { it.code }) { option ->
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .clickable {
                    onDraftChange(draft.copy(nationality = option.code))
                    nationalityFocused = false
                    nationalityQuery = ""
                  }
                  .padding(horizontal = 12.dp, vertical = 10.dp),
              ) {
                Text(option.label)
              }
            }
          }
        }
      }
    }

    Button(
      onClick = onDone,
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Done")
    }
  }
}

@Composable
private fun LocationEditorSheet(
  initialLocationLabel: String,
  initialSelection: LocationResult?,
  initialLatE6: Int,
  initialLngE6: Int,
  onApply: (selection: LocationResult?, clearLocation: Boolean) -> Unit,
  onCancel: () -> Unit,
) {
  var query by remember(initialLocationLabel) { mutableStateOf(initialLocationLabel) }
  val derivedSelection = remember(initialLocationLabel, initialSelection, initialLatE6, initialLngE6) {
    initialSelection ?: if (initialLocationLabel.isNotBlank() && ProfileContractApi.hasCoords(initialLatE6, initialLngE6)) {
      LocationResult(
        label = initialLocationLabel,
        lat = initialLatE6.toDouble() / 1_000_000.0,
        lng = initialLngE6.toDouble() / 1_000_000.0,
        countryCode = null,
      )
    } else {
      null
    }
  }

  var selection by remember(derivedSelection) { mutableStateOf(derivedSelection) }
  var clearLocation by remember { mutableStateOf(false) }
  var searching by remember { mutableStateOf(false) }
  var suggestions by remember { mutableStateOf<List<LocationResult>>(emptyList()) }

  LaunchedEffect(query) {
    if (query == selection?.label) return@LaunchedEffect
    clearLocation = false
    selection = null
    suggestions = emptyList()

    if (query.length < 2) {
      searching = false
      return@LaunchedEffect
    }

    searching = true
    runCatching { searchLocations(query) }
      .onSuccess { suggestions = it }
      .onFailure { suggestions = emptyList() }
    searching = false
  }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .fillMaxHeight(0.9f)
      .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("Location", style = MaterialTheme.typography.titleLarge)
    Text(
      "Search and pick your city. We keep this user-friendly and hash internals automatically.",
      style = MaterialTheme.typography.bodyMedium,
      color = PiratePalette.TextMuted,
    )

    OutlinedTextField(
      value = query,
      onValueChange = { query = it },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("City") },
      placeholder = { Text("e.g. New York, US") },
      singleLine = true,
      trailingIcon = {
        if (searching) {
          CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        }
      },
    )

    if (selection != null) {
      Text(
        "Selected: ${selection!!.label}",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.primary,
      )
    } else if (initialLocationLabel.isNotBlank() && query == initialLocationLabel) {
      Text(
        "Current: $initialLocationLabel",
        style = MaterialTheme.typography.bodyMedium,
        color = PiratePalette.TextMuted,
      )
    }

    if (suggestions.isNotEmpty()) {
      Surface(color = Color(0xFF262626), shape = RoundedCornerShape(12.dp)) {
        LazyColumn(
          modifier = Modifier
            .fillMaxWidth()
            .height(220.dp),
        ) {
          items(suggestions, key = { it.label }) { result ->
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .clickable {
                  selection = result
                  query = result.label
                  suggestions = emptyList()
                  clearLocation = false
                }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
              Text(result.label)
            }
          }
        }
      }
    }

    TextButton(
      onClick = {
        selection = null
        query = ""
        clearLocation = true
        suggestions = emptyList()
      },
      enabled = query.isNotBlank() || initialLocationLabel.isNotBlank(),
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Clear Location")
    }

    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      TextButton(
        onClick = onCancel,
        modifier = Modifier.weight(1f),
      ) {
        Text("Cancel")
      }
      Button(
        onClick = { onApply(selection, clearLocation) },
        modifier = Modifier.weight(1f),
      ) {
        Text("Done")
      }
    }
  }
}

@Composable
private fun SchoolEditorSheet(
  initialSchoolName: String,
  onApply: (school: String) -> Unit,
  onCancel: () -> Unit,
) {
  var school by remember(initialSchoolName) { mutableStateOf(initialSchoolName) }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .fillMaxHeight(0.6f)
      .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("School", style = MaterialTheme.typography.titleLarge)
    LabeledTextField(
      label = "School",
      value = school,
      placeholder = "Enter your school",
      onValueChange = { school = it },
    )
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      TextButton(
        onClick = onCancel,
        modifier = Modifier.weight(1f),
      ) {
        Text("Cancel")
      }
      Button(
        onClick = { onApply(school) },
        modifier = Modifier.weight(1f),
      ) {
        Text("Done")
      }
    }
  }
}

@Composable
private fun PreferencesEditorSheet(
  draft: ContractProfileData,
  onDraftChange: (ContractProfileData) -> Unit,
  onDone: () -> Unit,
) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .fillMaxHeight(0.9f)
      .verticalScroll(rememberScrollState())
      .padding(horizontal = 20.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text("Preferences", style = MaterialTheme.typography.titleLarge)
    EnumDropdownField("Gender", draft.gender, ProfileContractApi.GENDER_OPTIONS) {
      onDraftChange(draft.copy(gender = it))
    }
    EnumDropdownField("Willing to relocate", draft.relocate, ProfileContractApi.RELOCATE_OPTIONS) {
      onDraftChange(draft.copy(relocate = it))
    }
    EnumDropdownField("Degree", draft.degree, ProfileContractApi.DEGREE_OPTIONS) {
      onDraftChange(draft.copy(degree = it))
    }
    EnumDropdownField("Field", draft.fieldBucket, ProfileContractApi.FIELD_OPTIONS) {
      onDraftChange(draft.copy(fieldBucket = it))
    }
    EnumDropdownField("Profession", draft.profession, ProfileContractApi.PROFESSION_OPTIONS) {
      onDraftChange(draft.copy(profession = it))
    }
    EnumDropdownField("Industry", draft.industry, ProfileContractApi.INDUSTRY_OPTIONS) {
      onDraftChange(draft.copy(industry = it))
    }
    EnumDropdownField("Relationship", draft.relationshipStatus, ProfileContractApi.RELATIONSHIP_OPTIONS) {
      onDraftChange(draft.copy(relationshipStatus = it))
    }
    FriendsMaskField(
      mask = draft.friendsOpenToMask,
      onValueChange = { onDraftChange(draft.copy(friendsOpenToMask = it and 0x07)) },
    )
    EnumDropdownField("Sexuality", draft.sexuality, ProfileContractApi.SEXUALITY_OPTIONS) {
      onDraftChange(draft.copy(sexuality = it))
    }
    EnumDropdownField("Ethnicity", draft.ethnicity, ProfileContractApi.ETHNICITY_OPTIONS) {
      onDraftChange(draft.copy(ethnicity = it))
    }
    EnumDropdownField("Dating Style", draft.datingStyle, ProfileContractApi.DATING_STYLE_OPTIONS) {
      onDraftChange(draft.copy(datingStyle = it))
    }
    EnumDropdownField("Children", draft.children, ProfileContractApi.CHILDREN_OPTIONS) {
      onDraftChange(draft.copy(children = it))
    }
    EnumDropdownField("Wants Children", draft.wantsChildren, ProfileContractApi.WANTS_CHILDREN_OPTIONS) {
      onDraftChange(draft.copy(wantsChildren = it))
    }
    EnumDropdownField("Looking For", draft.lookingFor, ProfileContractApi.LOOKING_FOR_OPTIONS) {
      onDraftChange(draft.copy(lookingFor = it))
    }
    EnumDropdownField("Drinking", draft.drinking, ProfileContractApi.DRINKING_OPTIONS) {
      onDraftChange(draft.copy(drinking = it))
    }
    EnumDropdownField("Smoking", draft.smoking, ProfileContractApi.SMOKING_OPTIONS) {
      onDraftChange(draft.copy(smoking = it))
    }
    EnumDropdownField("Drugs", draft.drugs, ProfileContractApi.DRUGS_OPTIONS) {
      onDraftChange(draft.copy(drugs = it))
    }
    EnumDropdownField("Religion", draft.religion, ProfileContractApi.RELIGION_OPTIONS) {
      onDraftChange(draft.copy(religion = it))
    }
    EnumDropdownField("Pets", draft.pets, ProfileContractApi.PETS_OPTIONS) {
      onDraftChange(draft.copy(pets = it))
    }
    EnumDropdownField("Diet", draft.diet, ProfileContractApi.DIET_OPTIONS) {
      onDraftChange(draft.copy(diet = it))
    }

    Button(
      onClick = onDone,
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Done")
    }
  }
}

@Composable
private fun FriendsMaskField(
  mask: Int,
  onValueChange: (Int) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("Open to dating", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      FriendsMaskChip(
        label = "Men",
        selected = (mask and 0x1) != 0,
        onClick = {
          onValueChange(if ((mask and 0x1) != 0) mask and 0x1.inv() else mask or 0x1)
        },
      )
      FriendsMaskChip(
        label = "Women",
        selected = (mask and 0x2) != 0,
        onClick = {
          onValueChange(if ((mask and 0x2) != 0) mask and 0x2.inv() else mask or 0x2)
        },
      )
      FriendsMaskChip(
        label = "Non-binary",
        selected = (mask and 0x4) != 0,
        onClick = {
          onValueChange(if ((mask and 0x4) != 0) mask and 0x4.inv() else mask or 0x4)
        },
      )
    }
  }
}

@Composable
private fun FriendsMaskChip(
  label: String,
  selected: Boolean,
  onClick: () -> Unit,
) {
  FilterChip(
    selected = selected,
    onClick = onClick,
    label = { Text(label) },
  )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EnumDropdownField(
  label: String,
  value: Int,
  options: List<ProfileEnumOption>,
  onValueChange: (Int) -> Unit,
) {
  var expanded by remember { mutableStateOf(false) }
  val selected = options.firstOrNull { it.value == value } ?: options.first()

  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label, style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    ExposedDropdownMenuBox(
      expanded = expanded,
      onExpandedChange = { expanded = it },
    ) {
      OutlinedTextField(
        value = selected.label,
        onValueChange = {},
        readOnly = true,
        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        modifier = Modifier
          .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
          .fillMaxWidth(),
      )
      ExposedDropdownMenu(
        expanded = expanded,
        onDismissRequest = { expanded = false },
      ) {
        options.forEach { option ->
          DropdownMenuItem(
            text = { Text(option.label) },
            onClick = {
              expanded = false
              onValueChange(option.value)
            },
          )
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguageEditor(
  entries: List<ProfileLanguageEntry>,
  onChange: (List<ProfileLanguageEntry>) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("Languages", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)

    entries.forEachIndexed { index, entry ->
      val usedCodes = entries
        .mapIndexedNotNull { i, v -> if (i == index) null else v.code.lowercase() }
        .toSet()

      Surface(
        color = Color(0xFF262626),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
      ) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(10.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          var langExpanded by remember(index, entry.code) { mutableStateOf(false) }
          ExposedDropdownMenuBox(
            expanded = langExpanded,
            onExpandedChange = { langExpanded = it },
            modifier = Modifier.weight(1f),
          ) {
            val selectedLanguage = LANGUAGE_OPTIONS.firstOrNull { it.code == entry.code.lowercase() }
            OutlinedTextField(
              value = selectedLanguage?.label ?: entry.code.uppercase(),
              onValueChange = {},
              readOnly = true,
              label = { Text("Language") },
              trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = langExpanded) },
              modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
              singleLine = true,
            )
            ExposedDropdownMenu(
              expanded = langExpanded,
              onDismissRequest = { langExpanded = false },
            ) {
              LANGUAGE_OPTIONS
                .filter { it.code !in usedCodes || it.code == entry.code.lowercase() }
                .forEach { option ->
                  DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                      val updated = entries.toMutableList()
                      updated[index] = entry.copy(code = option.code)
                      onChange(updated)
                      langExpanded = false
                    },
                  )
                }
            }
          }

          Spacer(Modifier.width(8.dp))

          var profExpanded by remember(index, entry.proficiency) { mutableStateOf(false) }
          ExposedDropdownMenuBox(
            expanded = profExpanded,
            onExpandedChange = { profExpanded = it },
            modifier = Modifier.weight(1f),
          ) {
            val selected = proficiencyOptions.firstOrNull { it.value == entry.proficiency } ?: proficiencyOptions.first()
            OutlinedTextField(
              value = selected.label,
              onValueChange = {},
              readOnly = true,
              label = { Text("Level") },
              trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = profExpanded) },
              modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
              singleLine = true,
            )
            ExposedDropdownMenu(
              expanded = profExpanded,
              onDismissRequest = { profExpanded = false },
            ) {
              proficiencyOptions.forEach { option ->
                DropdownMenuItem(
                  text = { Text(option.label) },
                  onClick = {
                    val updated = entries.toMutableList()
                    updated[index] = entry.copy(proficiency = option.value)
                    onChange(updated)
                    profExpanded = false
                  },
                )
              }
            }
          }

          IconButton(
            onClick = {
              val updated = entries.toMutableList()
              updated.removeAt(index)
              onChange(updated)
            },
          ) {
            Icon(Icons.Rounded.Close, contentDescription = "Remove language")
          }
        }
      }
    }

    if (entries.size < 8) {
      TextButton(
        onClick = {
          val existing = entries.map { it.code.lowercase() }.toSet()
          val code = LANGUAGE_OPTIONS.firstOrNull { it.code !in existing }?.code ?: "en"
          onChange(entries + ProfileLanguageEntry(code = code, proficiency = 1))
        },
      ) {
        Text("Add Language")
      }
    }
  }
}
