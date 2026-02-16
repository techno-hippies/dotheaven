package com.pirate.app.onboarding.steps

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pirate.app.onboarding.OnboardingArtist
import com.pirate.app.onboarding.POPULAR_ARTISTS

private const val MIN_ARTISTS = 3

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MusicStep(
  submitting: Boolean,
  onContinue: (List<OnboardingArtist>) -> Unit,
) {
  val selectedMbids = remember { mutableStateListOf<String>() }
  val canContinue = selectedMbids.size >= MIN_ARTISTS && !submitting
  val remaining = (MIN_ARTISTS - selectedMbids.size).coerceAtLeast(0)

  Column(
    modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.Start,
  ) {
    Text("Pick artists you like", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Spacer(Modifier.height(8.dp))
    Text(
      if (remaining > 0) "Pick at least $remaining more" else "${selectedMbids.size} selected",
      fontSize = 16.sp,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(24.dp))

    FlowRow(
      modifier = Modifier
        .fillMaxWidth()
        .weight(1f)
        .verticalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.Start),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      POPULAR_ARTISTS.forEach { artist ->
        val isSelected = artist.mbid in selectedMbids
        FilterChip(
          selected = isSelected,
          onClick = {
            if (isSelected) selectedMbids.remove(artist.mbid)
            else selectedMbids.add(artist.mbid)
          },
          label = { Text(artist.name, fontSize = 16.sp) },
          shape = RoundedCornerShape(50),
          border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = isSelected,
            borderColor = MaterialTheme.colorScheme.outline,
            selectedBorderColor = MaterialTheme.colorScheme.primary,
          ),
        )
      }
    }

    Spacer(Modifier.height(16.dp))

    Button(
      onClick = {
        val selected = POPULAR_ARTISTS.filter { it.mbid in selectedMbids }
        onContinue(selected)
      },
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
