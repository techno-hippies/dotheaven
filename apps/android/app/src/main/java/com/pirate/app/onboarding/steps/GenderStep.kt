package com.pirate.app.onboarding.steps

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Matches ProfileV2.sol enum Gender { Unset, Woman, Man, NonBinary, TransWoman, TransMan, Intersex, Other }
private val GENDER_OPTIONS = listOf(
  "woman" to "Woman",
  "man" to "Man",
  "nonbinary" to "Non-binary",
  "transwoman" to "Trans Woman",
  "transman" to "Trans Man",
  "intersex" to "Intersex",
  "other" to "Other",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GenderStep(
  submitting: Boolean,
  onContinue: (String) -> Unit,
) {
  var selected by remember { mutableStateOf<String?>(null) }
  val canContinue = selected != null && !submitting

  Column(
    modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.Start,
  ) {
    Text("What's your gender?", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Spacer(Modifier.height(32.dp))

    FlowRow(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.Start),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      GENDER_OPTIONS.forEach { (value, label) ->
        FilterChip(
          selected = selected == value,
          onClick = { selected = if (selected == value) null else value },
          label = { Text(label, fontSize = 16.sp) },
          shape = RoundedCornerShape(50),
          border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected == value,
            borderColor = MaterialTheme.colorScheme.outline,
            selectedBorderColor = MaterialTheme.colorScheme.primary,
          ),
        )
      }
    }

    Spacer(Modifier.weight(1f))

    Button(
      onClick = { selected?.let { onContinue(it) } },
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
