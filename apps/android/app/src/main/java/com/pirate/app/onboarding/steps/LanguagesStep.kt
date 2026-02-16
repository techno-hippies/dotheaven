package com.pirate.app.onboarding.steps

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.math.BigInteger

data class LanguageEntry(val code: String, val proficiency: Int)

data class LanguageOption(val code: String, val label: String)

val LANGUAGE_OPTIONS = listOf(
  LanguageOption("en", "English"),
  LanguageOption("es", "Spanish"),
  LanguageOption("fr", "French"),
  LanguageOption("de", "German"),
  LanguageOption("pt", "Portuguese"),
  LanguageOption("it", "Italian"),
  LanguageOption("ja", "Japanese"),
  LanguageOption("ko", "Korean"),
  LanguageOption("zh", "Chinese"),
  LanguageOption("ar", "Arabic"),
  LanguageOption("hi", "Hindi"),
  LanguageOption("ru", "Russian"),
  LanguageOption("tr", "Turkish"),
  LanguageOption("nl", "Dutch"),
  LanguageOption("pl", "Polish"),
  LanguageOption("sv", "Swedish"),
  LanguageOption("th", "Thai"),
  LanguageOption("vi", "Vietnamese"),
  LanguageOption("uk", "Ukrainian"),
  LanguageOption("id", "Indonesian"),
  LanguageOption("ro", "Romanian"),
  LanguageOption("hu", "Hungarian"),
  LanguageOption("el", "Greek"),
  LanguageOption("cs", "Czech"),
  LanguageOption("da", "Danish"),
  LanguageOption("fi", "Finnish"),
  LanguageOption("no", "Norwegian"),
  LanguageOption("he", "Hebrew"),
  LanguageOption("ms", "Malay"),
  LanguageOption("tl", "Tagalog"),
  LanguageOption("sw", "Swahili"),
  LanguageOption("ca", "Catalan"),
)

data class ProficiencyOption(val value: Int, val label: String)

val PROFICIENCY_OPTIONS = listOf(
  ProficiencyOption(7, "Native"),
  ProficiencyOption(6, "C2 — Proficient"),
  ProficiencyOption(5, "C1 — Advanced"),
  ProficiencyOption(4, "B2 — Upper Intermediate"),
  ProficiencyOption(3, "B1 — Intermediate"),
  ProficiencyOption(2, "A2 — Elementary"),
  ProficiencyOption(1, "A1 — Beginner"),
)

/**
 * Pack up to 8 LanguageEntry into a uint256 decimal string.
 * Layout: 8 x 32-bit slots from MSB.
 * Each slot: [langCode:16][proficiency:8][reserved:8]
 */
fun packLanguages(entries: List<LanguageEntry>): String {
  var packed = BigInteger.ZERO
  val slots = entries.take(8)
  for ((i, entry) in slots.withIndex()) {
    val upper = entry.code.take(2).uppercase()
    if (upper.length < 2) continue
    val langVal = (upper[0].code shl 8) or upper[1].code
    val slotVal = ((langVal and 0xFFFF) shl 16) or ((entry.proficiency and 0xFF) shl 8)
    val shift = (7 - i) * 32
    packed = packed.or(BigInteger.valueOf(slotVal.toLong()).shiftLeft(shift))
  }
  return packed.toString()
}

private const val MAX_LANGUAGES = 8

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanguagesStep(
  submitting: Boolean,
  onContinue: (languages: List<LanguageEntry>) -> Unit,
) {
  val languages = remember { mutableStateListOf<LanguageEntry>() }
  val canContinue = languages.isNotEmpty() && !submitting

  Column(
    modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.Start,
  ) {
    Text("What languages do you speak?", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Spacer(Modifier.height(8.dp))
    Text(
      if (languages.isEmpty()) "Add at least one language" else "${languages.size} ${if (languages.size == 1) "language" else "languages"} added",
      fontSize = 16.sp,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(24.dp))

    // Existing language entries
    languages.forEachIndexed { index, entry ->
      val langLabel = LANGUAGE_OPTIONS.find { it.code == entry.code }?.label ?: entry.code
      val profLabel = PROFICIENCY_OPTIONS.find { it.value == entry.proficiency }?.label ?: "?"

      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(vertical = 4.dp)
          .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
          .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Column(modifier = Modifier.weight(1f)) {
          Text(langLabel, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onBackground)
          Text(profLabel, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = { languages.removeAt(index) }) {
          Icon(Icons.Rounded.Close, contentDescription = "Remove", modifier = Modifier.size(20.dp))
        }
      }
    }

    // Add language row
    if (languages.size < MAX_LANGUAGES) {
      Spacer(Modifier.height(12.dp))
      AddLanguageRow(
        usedCodes = languages.map { it.code }.toSet(),
        onAdd = { entry -> languages.add(entry) },
      )
    }

    Spacer(Modifier.weight(1f))

    Button(
      onClick = { onContinue(languages.toList()) },
      enabled = canContinue,
      modifier = Modifier.fillMaxWidth().height(48.dp),
      shape = RoundedCornerShape(50),
    ) {
      if (submitting) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
      } else {
        Text("Continue", fontSize = 16.sp)
      }
    }

    Spacer(Modifier.height(32.dp))
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddLanguageRow(
  usedCodes: Set<String>,
  onAdd: (LanguageEntry) -> Unit,
) {
  var selectedLang by remember { mutableStateOf<LanguageOption?>(null) }
  var selectedProf by remember { mutableStateOf<ProficiencyOption?>(null) }
  var langExpanded by remember { mutableStateOf(false) }
  var profExpanded by remember { mutableStateOf(false) }

  val availableLanguages = LANGUAGE_OPTIONS.filter { it.code !in usedCodes }

  // Auto-add when both are selected
  LaunchedEffect(selectedLang, selectedProf) {
    val lang = selectedLang ?: return@LaunchedEffect
    val prof = selectedProf ?: return@LaunchedEffect
    onAdd(LanguageEntry(lang.code, prof.value))
    selectedLang = null
    selectedProf = null
  }

  Column(modifier = Modifier.fillMaxWidth()) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.Top,
    ) {
      // Language dropdown
      ExposedDropdownMenuBox(
        expanded = langExpanded,
        onExpandedChange = { langExpanded = it },
        modifier = Modifier.weight(1f),
      ) {
        OutlinedTextField(
          value = selectedLang?.label ?: "",
          onValueChange = {},
          readOnly = true,
          label = { Text("Language") },
          trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = langExpanded) },
          modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
          shape = RoundedCornerShape(16.dp),
          singleLine = true,
        )
        ExposedDropdownMenu(
          expanded = langExpanded,
          onDismissRequest = { langExpanded = false },
        ) {
          availableLanguages.forEach { option ->
            DropdownMenuItem(
              text = { Text(option.label) },
              onClick = {
                selectedLang = option
                langExpanded = false
              },
            )
          }
        }
      }

      // Proficiency dropdown
      ExposedDropdownMenuBox(
        expanded = profExpanded,
        onExpandedChange = { profExpanded = it },
        modifier = Modifier.weight(1f),
      ) {
        OutlinedTextField(
          value = selectedProf?.label ?: "",
          onValueChange = {},
          readOnly = true,
          label = { Text("Level") },
          trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = profExpanded) },
          modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
          shape = RoundedCornerShape(16.dp),
          singleLine = true,
        )
        ExposedDropdownMenu(
          expanded = profExpanded,
          onDismissRequest = { profExpanded = false },
        ) {
          PROFICIENCY_OPTIONS.forEach { option ->
            DropdownMenuItem(
              text = { Text(option.label) },
              onClick = {
                selectedProf = option
                profExpanded = false
              },
            )
          }
        }
      }
    }

  }
}
