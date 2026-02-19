package com.pirate.app.store

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.ui.PirateMobileHeader
import java.math.BigInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val TIER1_LABELS = listOf("king", "queen", "god", "devil", "pirate", "heaven", "love", "moon", "star", "angel")
private val TIER3_LABELS = listOf("ace", "zen", "nova", "wolf", "punk", "dope", "fire", "gold", "jade", "ruby")

private const val TIER1_PRICE = "100.00"
private const val TIER3_PRICE = "25.00"

/** Represents a selectable name in the store. */
private data class SelectableName(
  val label: String,
  val price: String,
  val tier: String, // "premium", "standard", or "policy"
  val isPremiumListing: Boolean = true,
  val premiumQuote: PremiumStoreQuote? = null,
)

private fun formatAUsd(rawAmount: BigInteger): String {
  return TempoClient.formatUnits(rawAmount = rawAmount, decimals = 6, maxFractionDigits = 2)
}

@Composable
fun NameStoreScreen(
  activity: FragmentActivity,
  isAuthenticated: Boolean,
  account: TempoPasskeyManager.PasskeyAccount?,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val scope = rememberCoroutineScope()

  var selectedTld by remember { mutableStateOf("heaven") }
  var selectedName by remember { mutableStateOf<SelectableName?>(null) }

  // Custom search state
  var customInput by remember { mutableStateOf("") }
  var checkingCustom by remember { mutableStateOf(false) }
  var customResult by remember { mutableStateOf<SelectableName?>(null) }
  var customError by remember { mutableStateOf<String?>(null) }

  // Pre-checked premium list state
  var availableNames by remember(selectedTld) { mutableStateOf<List<SelectableName>>(emptyList()) }
  var loadingNames by remember(selectedTld) { mutableStateOf(false) }

  var buying by remember { mutableStateOf(false) }

  var refreshNonce by remember { mutableIntStateOf(0) }

  val customNormalized = PremiumNameStoreApi.normalizeLabel(customInput)
  val customValid = PremiumNameStoreApi.isValidLabel(customNormalized)
  val canBuy = isAuthenticated && account != null && selectedName != null && !buying

  // Debounced custom name check — listing if available, otherwise policy-gated path
  LaunchedEffect(customNormalized, selectedTld) {
    customResult = null
    customError = null
    if (!customValid || customNormalized.isBlank()) {
      checkingCustom = false
      return@LaunchedEffect
    }
    checkingCustom = true
    delay(400)

    // 1) Check premium listing
    val premiumQuote = runCatching {
      withContext(Dispatchers.IO) {
        PremiumNameStoreApi.quote(label = customNormalized, tld = selectedTld)
      }
    }.getOrNull()

    if (premiumQuote != null) {
      val listing = premiumQuote.listing
      val isListed = listing.enabled && listing.durationSeconds > 0L
      val priceDisplay = if (isListed) "${formatAUsd(listing.price)} αUSD" else "Policy quote on buy"
      val tier = if (isListed) "premium" else "policy"
      val name = SelectableName(
        label = customNormalized,
        price = priceDisplay,
        tier = tier,
        premiumQuote = premiumQuote,
      )
      customResult = name
      selectedName = name
    } else {
      customError = "Unable to check this name right now."
    }

    checkingCustom = false
  }

  // Batch-fetch availability for premium names on load
  LaunchedEffect(isAuthenticated, account?.address, selectedTld, refreshNonce) {
    if (!isAuthenticated || account == null) {
      availableNames = emptyList()
      loadingNames = false
      return@LaunchedEffect
    }

    loadingNames = true
    selectedName = null

    val allLabels = TIER1_LABELS.map { it to TIER1_PRICE } + TIER3_LABELS.map { it to TIER3_PRICE }
    val results = mutableListOf<SelectableName>()

    withContext(Dispatchers.IO) {
      for ((label, price) in allLabels) {
        runCatching {
          val q = PremiumNameStoreApi.quote(label = label, tld = selectedTld)
          if (q.listing.enabled && q.listing.durationSeconds > 0L) {
            val tier = if (price == TIER1_PRICE) "premium" else "standard"
            results.add(
              SelectableName(
                label = label,
                price = "${formatAUsd(q.listing.price)} αUSD",
                tier = tier,
                isPremiumListing = true,
                premiumQuote = q,
              ),
            )
          }
        }
      }
    }

    availableNames = results
    loadingNames = false
  }

  Column(
    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
  ) {
    PirateMobileHeader(
      title = "Store",
      onClosePress = onClose,
    )

    if (!isAuthenticated || account == null) {
      Box(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        contentAlignment = Alignment.Center,
      ) {
        Text(
          "Sign in to buy premium names.",
          style = MaterialTheme.typography.bodyLarge,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      return@Column
    }

    // Scrollable content
    Column(
      modifier = Modifier
        .weight(1f)
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 24.dp),
    ) {
      Spacer(Modifier.height(8.dp))

      Text(
        "Get a name",
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onBackground,
      )
      Spacer(Modifier.height(8.dp))
      Text(
        "Choose a domain for your identity on Heaven",
        fontSize = 16.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Spacer(Modifier.height(24.dp))

      // TLD selector
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        FilterChip(
          selected = selectedTld == "heaven",
          onClick = { selectedTld = "heaven"; customInput = ""; selectedName = null; customResult = null; customError = null },
          label = { Text(".heaven") },
        )
        FilterChip(
          selected = selectedTld == "pirate",
          onClick = { selectedTld = "pirate"; customInput = ""; selectedName = null; customResult = null; customError = null },
          label = { Text(".pirate") },
        )
      }
      Spacer(Modifier.height(20.dp))

      // Custom domain search
      OutlinedTextField(
        value = customInput,
        onValueChange = {
          customInput = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' }
          selectedName = null
          customResult = null
          customError = null
        },
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Search custom name") },
        suffix = { Text(".${selectedTld.lowercase()}", color = MaterialTheme.colorScheme.onSurfaceVariant) },
        singleLine = true,
        shape = RoundedCornerShape(50),
      )
      Spacer(Modifier.height(8.dp))

      // Custom search status
      if (customInput.isNotBlank()) {
        Row(
          modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          when {
            checkingCustom -> {
              CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
              Text("  Checking...", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            customResult != null -> {
              Text(
                "✓ Ready — ${customResult!!.price}",
                fontSize = 16.sp,
                color = Color(0xFFA6E3A1),
              )
            }
            customError != null -> {
              Text(customError!!, fontSize = 16.sp, color = MaterialTheme.colorScheme.error)
            }
            !customValid && customNormalized.isNotBlank() -> {
              Text("Use lowercase letters, numbers, or hyphens", fontSize = 16.sp, color = MaterialTheme.colorScheme.error)
            }
          }
        }
      }

      Spacer(Modifier.height(28.dp))

      // Pre-checked premium names
      if (loadingNames) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.Center,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
          Text("  Loading available names...", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      } else if (availableNames.isNotEmpty()) {
        val premiumNames = availableNames.filter { it.tier == "premium" }
        val standardNames = availableNames.filter { it.tier == "standard" }

        if (premiumNames.isNotEmpty()) {
          Text(
            "Premium",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
          )
          Spacer(Modifier.height(8.dp))

          premiumNames.forEach { name ->
            NameListRow(
              label = name.label,
              tld = selectedTld,
              price = name.price,
              isSelected = selectedName?.label == name.label && selectedName?.isPremiumListing == true,
              onClick = {
                selectedName = name
                customInput = ""
                customResult = null
                customError = null
              },
            )
          }
          Spacer(Modifier.height(20.dp))
        }

        if (standardNames.isNotEmpty()) {
          Text(
            "Standard",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
          )
          Spacer(Modifier.height(8.dp))

          standardNames.forEach { name ->
            NameListRow(
              label = name.label,
              tld = selectedTld,
              price = name.price,
              isSelected = selectedName?.label == name.label && selectedName?.tier == "standard",
              onClick = {
                selectedName = name
                customInput = ""
                customResult = null
                customError = null
              },
            )
          }
        }
      }

      Spacer(Modifier.height(24.dp))
    }

    // Sticky footer
    Surface(
      modifier = Modifier.fillMaxWidth(),
      tonalElevation = 3.dp,
      shadowElevation = 8.dp,
    ) {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 24.dp, vertical = 16.dp),
      ) {
        if (selectedName != null) {
          Text(
            "${selectedName!!.label}.$selectedTld — ${selectedName!!.price}",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 8.dp),
          )
        }
        Button(
          onClick = {
            val name = selectedName ?: return@Button
            if (!canBuy) return@Button
            scope.launch {
              buying = true
              val buyResult = PremiumNameStoreApi.buy(
                activity = activity,
                account = account,
                label = name.label,
                tld = selectedTld,
                maxPrice = name.premiumQuote?.listing
                  ?.takeIf { it.enabled && it.durationSeconds > 0L }
                  ?.price,
              )
              buying = false
              if (!buyResult.success) {
                onShowMessage(buyResult.error ?: "Purchase failed.")
                return@launch
              }
              onShowMessage("Purchased ${name.label}.$selectedTld")
              selectedName = null
              customInput = ""
              customResult = null
              refreshNonce += 1
            }
          },
          enabled = canBuy,
          modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
          shape = RoundedCornerShape(50),
        ) {
          if (buying) {
            CircularProgressIndicator(
              modifier = Modifier.size(20.dp),
              strokeWidth = 2.dp,
              color = MaterialTheme.colorScheme.onPrimary,
            )
          } else {
            Text("Buy", fontSize = 16.sp)
          }
        }
      }
    }
  }
}

@Composable
private fun NameListRow(
  label: String,
  tld: String,
  price: String,
  isSelected: Boolean,
  onClick: () -> Unit,
) {
  Surface(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 2.dp)
      .clickable(onClick = onClick),
    shape = MaterialTheme.shapes.medium,
    color = if (isSelected) {
      MaterialTheme.colorScheme.primaryContainer
    } else {
      Color.Transparent
    },
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 14.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        "$label.$tld",
        style = MaterialTheme.typography.bodyLarge,
        color = if (isSelected) {
          MaterialTheme.colorScheme.onPrimaryContainer
        } else {
          MaterialTheme.colorScheme.onBackground
        },
      )
      Text(
        price,
        style = MaterialTheme.typography.bodyMedium,
        color = if (isSelected) {
          MaterialTheme.colorScheme.onPrimaryContainer
        } else {
          MaterialTheme.colorScheme.onSurfaceVariant
        },
      )
    }
  }
}
