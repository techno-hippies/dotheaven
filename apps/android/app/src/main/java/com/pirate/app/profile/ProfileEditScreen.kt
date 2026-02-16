package com.pirate.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pirate.app.onboarding.OnboardingLitActions
import com.pirate.app.onboarding.steps.LANGUAGE_OPTIONS
import com.pirate.app.theme.PiratePalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileEditScreen(
  ethAddress: String,
  pkpPublicKey: String?,
  litNetwork: String,
  litRpcUrl: String,
  onBack: () -> Unit,
  onSaved: () -> Unit,
) {
  val appContext = androidx.compose.ui.platform.LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()

  var loading by remember { mutableStateOf(true) }
  var saving by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var draft by remember { mutableStateOf(ProfileContractApi.emptyProfile()) }

  LaunchedEffect(ethAddress) {
    loading = true
    error = null
    runCatching { ProfileContractApi.fetchProfile(ethAddress) }
      .onSuccess { profile ->
        draft = profile ?: ProfileContractApi.emptyProfile()
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
          val pubKey = pkpPublicKey
          if (pubKey.isNullOrBlank()) {
            error = "Missing profile auth context"
            return@TextButton
          }
          saving = true
          error = null
          scope.launch {
            val payload = ProfileContractApi.buildProfileInput(draft)
            val result = withContext(Dispatchers.IO) {
              OnboardingLitActions.setProfile(
                appContext = appContext,
                userAddress = ethAddress,
                profileInput = payload,
                pkpPublicKey = pubKey,
                litNetwork = litNetwork,
                litRpcUrl = litRpcUrl,
              )
            }
            if (result.success) {
              onSaved()
            } else {
              error = result.error ?: "Profile update failed"
            }
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

          SectionCard("Identity") {
            LabeledTextField(
              label = "Display Name",
              value = draft.displayName,
              placeholder = "Enter a display name",
              onValueChange = { draft = draft.copy(displayName = it) },
            )
            LabeledTextField(
              label = "Name Hash",
              value = draft.nameHash,
              placeholder = "0x... or plaintext to hash",
              onValueChange = { draft = draft.copy(nameHash = it) },
            )
            LabeledTextField(
              label = "Photo URI",
              value = draft.photoUri,
              placeholder = "ipfs://... or https://...",
              onValueChange = { draft = draft.copy(photoUri = it) },
            )
          }

          SectionCard("Basics") {
            NumericField(
              label = "Age",
              value = draft.age,
              onValueChange = { draft = draft.copy(age = it.coerceAtLeast(0)) },
            )
            NumericField(
              label = "Height (cm)",
              value = draft.heightCm,
              onValueChange = { draft = draft.copy(heightCm = it.coerceAtLeast(0)) },
            )
            LabeledTextField(
              label = "Nationality (ISO alpha-2)",
              value = draft.nationality,
              placeholder = "US",
              onValueChange = { draft = draft.copy(nationality = it.uppercase()) },
            )
            FriendsMaskField(
              mask = draft.friendsOpenToMask,
              onValueChange = { draft = draft.copy(friendsOpenToMask = it and 0x07) },
            )
            LanguageEditor(
              entries = draft.languages,
              onChange = { draft = draft.copy(languages = it) },
            )
          }

          SectionCard("Location & Commitments") {
            LabeledTextField(
              label = "Location City ID",
              value = draft.locationCityId,
              placeholder = "0x... or plaintext city",
              onValueChange = { draft = draft.copy(locationCityId = it) },
            )
            NumericField(
              label = "Latitude E6",
              value = draft.locationLatE6,
              onValueChange = { draft = draft.copy(locationLatE6 = it) },
            )
            NumericField(
              label = "Longitude E6",
              value = draft.locationLngE6,
              onValueChange = { draft = draft.copy(locationLngE6 = it) },
            )
            LabeledTextField(
              label = "School ID",
              value = draft.schoolId,
              placeholder = "0x... or plaintext school",
              onValueChange = { draft = draft.copy(schoolId = it) },
            )
            LabeledTextField(
              label = "Hobbies IDs",
              value = draft.hobbiesCommit,
              placeholder = "Comma-separated tag IDs",
              onValueChange = { draft = draft.copy(hobbiesCommit = it) },
            )
            LabeledTextField(
              label = "Skills IDs",
              value = draft.skillsCommit,
              placeholder = "Comma-separated tag IDs",
              onValueChange = { draft = draft.copy(skillsCommit = it) },
            )
          }

          SectionCard("Profile Preferences") {
            EnumDropdownField("Gender", draft.gender, ProfileContractApi.GENDER_OPTIONS) {
              draft = draft.copy(gender = it)
            }
            EnumDropdownField("Relocate", draft.relocate, ProfileContractApi.RELOCATE_OPTIONS) {
              draft = draft.copy(relocate = it)
            }
            EnumDropdownField("Degree", draft.degree, ProfileContractApi.DEGREE_OPTIONS) {
              draft = draft.copy(degree = it)
            }
            EnumDropdownField("Field", draft.fieldBucket, ProfileContractApi.FIELD_OPTIONS) {
              draft = draft.copy(fieldBucket = it)
            }
            EnumDropdownField("Profession", draft.profession, ProfileContractApi.PROFESSION_OPTIONS) {
              draft = draft.copy(profession = it)
            }
            EnumDropdownField("Industry", draft.industry, ProfileContractApi.INDUSTRY_OPTIONS) {
              draft = draft.copy(industry = it)
            }
            EnumDropdownField("Relationship", draft.relationshipStatus, ProfileContractApi.RELATIONSHIP_OPTIONS) {
              draft = draft.copy(relationshipStatus = it)
            }
            EnumDropdownField("Sexuality", draft.sexuality, ProfileContractApi.SEXUALITY_OPTIONS) {
              draft = draft.copy(sexuality = it)
            }
            EnumDropdownField("Ethnicity", draft.ethnicity, ProfileContractApi.ETHNICITY_OPTIONS) {
              draft = draft.copy(ethnicity = it)
            }
            EnumDropdownField("Dating Style", draft.datingStyle, ProfileContractApi.DATING_STYLE_OPTIONS) {
              draft = draft.copy(datingStyle = it)
            }
            EnumDropdownField("Children", draft.children, ProfileContractApi.CHILDREN_OPTIONS) {
              draft = draft.copy(children = it)
            }
            EnumDropdownField("Wants Children", draft.wantsChildren, ProfileContractApi.WANTS_CHILDREN_OPTIONS) {
              draft = draft.copy(wantsChildren = it)
            }
            EnumDropdownField("Looking For", draft.lookingFor, ProfileContractApi.LOOKING_FOR_OPTIONS) {
              draft = draft.copy(lookingFor = it)
            }
            EnumDropdownField("Drinking", draft.drinking, ProfileContractApi.DRINKING_OPTIONS) {
              draft = draft.copy(drinking = it)
            }
            EnumDropdownField("Smoking", draft.smoking, ProfileContractApi.SMOKING_OPTIONS) {
              draft = draft.copy(smoking = it)
            }
            EnumDropdownField("Drugs", draft.drugs, ProfileContractApi.DRUGS_OPTIONS) {
              draft = draft.copy(drugs = it)
            }
            EnumDropdownField("Religion", draft.religion, ProfileContractApi.RELIGION_OPTIONS) {
              draft = draft.copy(religion = it)
            }
            EnumDropdownField("Pets", draft.pets, ProfileContractApi.PETS_OPTIONS) {
              draft = draft.copy(pets = it)
            }
            EnumDropdownField("Diet", draft.diet, ProfileContractApi.DIET_OPTIONS) {
              draft = draft.copy(diet = it)
            }
          }

          Spacer(Modifier.height(12.dp))
          Button(
            onClick = {
              if (saving || loading) return@Button
              val pubKey = pkpPublicKey
              if (pubKey.isNullOrBlank()) {
                error = "Missing profile auth context"
                return@Button
              }
              saving = true
              error = null
              scope.launch {
                val payload = ProfileContractApi.buildProfileInput(draft)
                val result = withContext(Dispatchers.IO) {
                  OnboardingLitActions.setProfile(
                    appContext = appContext,
                    userAddress = ethAddress,
                    profileInput = payload,
                    pkpPublicKey = pubKey,
                    litNetwork = litNetwork,
                    litRpcUrl = litRpcUrl,
                  )
                }
                if (result.success) {
                  onSaved()
                } else {
                  error = result.error ?: "Profile update failed"
                }
                saving = false
              }
            },
            enabled = !saving && !loading,
            modifier = Modifier.fillMaxWidth(),
          ) {
            if (saving) {
              CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            } else {
              Text("Save Profile")
            }
          }
          Spacer(Modifier.height(24.dp))
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
private fun LabeledTextField(
  label: String,
  value: String,
  placeholder: String,
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
    onValueChange = { next ->
      val parsed = next.trim().toIntOrNull() ?: 0
      onValueChange(parsed)
    },
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
        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
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

@Composable
private fun FriendsMaskField(
  mask: Int,
  onValueChange: (Int) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("Open To", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
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
private fun LanguageEditor(
  entries: List<ProfileLanguageEntry>,
  onChange: (List<ProfileLanguageEntry>) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("Languages", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)

    entries.forEachIndexed { index, entry ->
      Surface(
        color = Color(0xFF262626),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
      ) {
        Row(
          modifier = Modifier.fillMaxWidth().padding(10.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          OutlinedTextField(
            value = entry.code.uppercase(),
            onValueChange = { next ->
              val code = next.lowercase().filter { it.isLetter() }.take(2)
              if (code.length <= 2) {
                val updated = entries.toMutableList()
                updated[index] = entry.copy(code = code)
                onChange(updated)
              }
            },
            label = { Text("Code") },
            singleLine = true,
            modifier = Modifier.width(92.dp),
          )
          Spacer(Modifier.width(8.dp))
          var expanded by remember(index, entry.proficiency) { mutableStateOf(false) }
          ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
            modifier = Modifier.weight(1f),
          ) {
            val selected = proficiencyOptions.firstOrNull { it.value == entry.proficiency } ?: proficiencyOptions.first()
            OutlinedTextField(
              value = selected.label,
              onValueChange = {},
              readOnly = true,
              label = { Text("Level") },
              trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
              modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
              singleLine = true,
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
              proficiencyOptions.forEach { option ->
                DropdownMenuItem(
                  text = { Text(option.label) },
                  onClick = {
                    val updated = entries.toMutableList()
                    updated[index] = entry.copy(proficiency = option.value)
                    onChange(updated)
                    expanded = false
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
