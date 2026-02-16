package com.pirate.app.onboarding.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun NameStep(
  submitting: Boolean,
  error: String?,
  onContinue: (String) -> Unit,
) {
  var name by remember { mutableStateOf("") }
  var checking by remember { mutableStateOf(false) }
  var available by remember { mutableStateOf<Boolean?>(null) }
  var checkError by remember { mutableStateOf<String?>(null) }

  // Debounced availability check
  LaunchedEffect(name) {
    available = null
    checkError = null
    val sanitized = name.lowercase().filter { it.isLetterOrDigit() || it == '-' }
    if (sanitized.length < 2) {
      if (sanitized.isNotEmpty()) checkError = "Name must be at least 2 characters"
      return@LaunchedEffect
    }
    if (sanitized.length > 32) {
      checkError = "Name must be 32 characters or less"
      return@LaunchedEffect
    }
    checking = true
    delay(400)
    try {
      val isAvailable = com.pirate.app.onboarding.OnboardingRpcHelpers.checkNameAvailable(sanitized)
      available = isAvailable
      if (!isAvailable) checkError = "Name is taken"
    } catch (e: Exception) {
      checkError = "Could not check availability"
    } finally {
      checking = false
    }
  }

  val sanitized = name.lowercase().filter { it.isLetterOrDigit() || it == '-' }
  val canContinue = available == true && !submitting && sanitized.length >= 2

  Column(
    modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.Start,
  ) {
    Text(
      "Claim your name",
      fontSize = 24.sp,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onBackground,
    )
    Spacer(Modifier.height(8.dp))
    Text(
      "This will be your identity on Heaven",
      fontSize = 16.sp,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(32.dp))

    OutlinedTextField(
      value = name,
      onValueChange = { name = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' } },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Username") },
      suffix = { Text(".heaven", color = MaterialTheme.colorScheme.onSurfaceVariant) },
      singleLine = true,
      shape = RoundedCornerShape(50),
    )
    Spacer(Modifier.height(8.dp))

    // Status indicator
    Row(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
      horizontalArrangement = Arrangement.Start,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      when {
        checking -> {
          CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
          Text("  Checking...", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        available == true -> {
          Text("✓ Available", fontSize = 14.sp, color = Color(0xFFA6E3A1))
        }
        checkError != null -> {
          Text(checkError!!, fontSize = 14.sp, color = MaterialTheme.colorScheme.error)
        }
      }
    }

    if (error != null) {
      Spacer(Modifier.height(8.dp))
      Text(error, fontSize = 14.sp, color = MaterialTheme.colorScheme.error)
    }

    Spacer(Modifier.weight(1f))

    Button(
      onClick = { onContinue(sanitized) },
      enabled = canContinue,
      modifier = Modifier.fillMaxWidth().height(48.dp),
      shape = RoundedCornerShape(50),
    ) {
      if (submitting) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
      } else {
        Text("Claim Name", fontSize = 16.sp)
      }
    }

    Spacer(Modifier.height(32.dp))
  }
}
