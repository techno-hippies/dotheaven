package com.pirate.app.community

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.onboarding.steps.LANGUAGE_OPTIONS
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

private data class GenderOption(
  val value: Int?,
  val label: String,
)

private val GenderOptions = listOf(
  GenderOption(null, "Gender"),
  GenderOption(1, "Woman"),
  GenderOption(2, "Man"),
  GenderOption(3, "Non-binary"),
  GenderOption(4, "Trans woman"),
  GenderOption(5, "Trans man"),
  GenderOption(6, "Intersex"),
  GenderOption(7, "Other"),
)

private val RadiusOptionsKm = listOf(10, 25, 50, 100)

@Composable
fun CommunityScreen(
  viewerAddress: String?,
  onMemberClick: (String) -> Unit = {},
) {
  var searchText by remember { mutableStateOf("") }
  var filters by remember { mutableStateOf(CommunityFilters(nativeLanguage = "en")) }
  var viewerLatE6 by remember { mutableStateOf<Int?>(null) }
  var viewerLngE6 by remember { mutableStateOf<Int?>(null) }
  var members by remember { mutableStateOf<List<CommunityMemberPreview>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var showFilterSheet by remember { mutableStateOf(false) }
  var defaultsLoadedFor by remember { mutableStateOf<String?>(null) }
  var preferredNativeLanguage by remember { mutableStateOf("en") }
  var reloadKey by remember { mutableStateOf(0) }

  LaunchedEffect(viewerAddress) {
    val normalizedViewer = viewerAddress?.trim()?.lowercase()
    if (defaultsLoadedFor == normalizedViewer) return@LaunchedEffect
    defaultsLoadedFor = normalizedViewer

    if (normalizedViewer.isNullOrBlank()) {
      viewerLatE6 = null
      viewerLngE6 = null
      preferredNativeLanguage = "en"
      filters = filters.copy(
        nativeLanguage = filters.nativeLanguage ?: preferredNativeLanguage,
        radiusKm = null,
      )
      return@LaunchedEffect
    }

    val defaults = runCatching {
      withContext(Dispatchers.IO) { CommunityApi.fetchViewerDefaults(normalizedViewer) }
    }.onFailure { throwable ->
      if (throwable is CancellationException) throw throwable
    }.getOrNull()

    viewerLatE6 = defaults?.locationLatE6
    viewerLngE6 = defaults?.locationLngE6
    val hasViewerCoords = defaults?.locationLatE6 != null && defaults?.locationLngE6 != null
    val defaultNative = defaults?.nativeSpeakerTargetLanguage ?: "en"
    preferredNativeLanguage = defaultNative
    filters = filters.copy(
      nativeLanguage = defaultNative,
      radiusKm = if (hasViewerCoords) filters.radiusKm else null,
    )
  }

  LaunchedEffect(filters, viewerLatE6, viewerLngE6, viewerAddress, reloadKey) {
    loading = true
    error = null
    runCatching {
      withContext(Dispatchers.IO) {
        CommunityApi.fetchCommunityMembers(
          viewerAddress = viewerAddress,
          filters = filters,
          viewerLatE6 = viewerLatE6,
          viewerLngE6 = viewerLngE6,
        )
      }
    }.onSuccess {
      members = it
      loading = false
    }.onFailure { throwable ->
      if (throwable is CancellationException) throw throwable
      error = throwable.message ?: "Failed to load community"
      loading = false
    }
  }

  val activeFilterCount = CommunityApi.activeFilterCount(filters)
  val hasViewerCoords = viewerLatE6 != null && viewerLngE6 != null
  val visibleMembers = remember(members, searchText) {
    val query = searchText.trim().lowercase()
    if (query.isBlank()) {
      members
    } else {
      members.filter { member ->
        val name = member.displayName.lowercase()
        val addr = member.address.lowercase()
        name.contains(query) || addr.contains(query)
      }
    }
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .statusBarsPadding(),
  ) {
    Row(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      OutlinedTextField(
        value = searchText,
        onValueChange = { searchText = it },
        modifier = Modifier.weight(1f),
        placeholder = { Text("Search people") },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(),
      )
      Spacer(Modifier.width(10.dp))
      BadgedBox(
        badge = {
          if (activeFilterCount > 0) {
            Badge {
              Text(activeFilterCount.toString())
            }
          }
        },
      ) {
        IconButton(
          onClick = { showFilterSheet = true },
          modifier = Modifier
            .size(44.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
        ) {
          Icon(Icons.Rounded.FilterList, contentDescription = "More filters")
        }
      }
    }

    when {
      loading -> {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          CircularProgressIndicator()
        }
      }
      !error.isNullOrBlank() -> {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { reloadKey++ }) {
              Text("Retry")
            }
          }
        }
      }
      visibleMembers.isEmpty() -> {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          Text("No users found", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      }
      else -> {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
          items(visibleMembers, key = { it.address }) { member ->
            CommunityPreviewRow(
              member = member,
              onClick = { onMemberClick(member.address) },
            )
            HorizontalDivider(
              modifier = Modifier.padding(horizontal = 16.dp),
              color = MaterialTheme.colorScheme.outlineVariant,
            )
          }
        }
      }
    }
  }

  if (showFilterSheet) {
    CommunityFilterSheet(
      filters = filters,
      defaultNativeLanguage = preferredNativeLanguage,
      hasViewerCoords = hasViewerCoords,
      onDismiss = { showFilterSheet = false },
      onApply = {
        filters = it
        showFilterSheet = false
      },
    )
  }
}

@Composable
private fun CommunityPreviewRow(
  member: CommunityMemberPreview,
  onClick: () -> Unit,
) {
  val rawDisplay = member.displayName.trim()
  val hasHeavenName = rawDisplay.isNotBlank() && !rawDisplay.startsWith("0x", ignoreCase = true)
  val handle = if (hasHeavenName) {
    if (rawDisplay.endsWith(".heaven", ignoreCase = true)) rawDisplay else "$rawDisplay.heaven"
  } else {
    shortAddress(member.address)
  }
  val subtitle = if (hasHeavenName) shortAddress(member.address) else null
  val meta = buildList {
    member.age?.let { add("$it") }
    CommunityApi.genderLabel(member.gender)?.let { add(it) }
    member.distanceKm?.let { add(distanceLabel(it)) }
  }.joinToString(" • ")

  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (!member.photoUrl.isNullOrBlank()) {
      AsyncImage(
        model = member.photoUrl,
        contentDescription = "Profile photo",
        modifier = Modifier.size(52.dp).clip(CircleShape),
        contentScale = ContentScale.Crop,
      )
    } else {
      Box(
        modifier = Modifier
          .size(52.dp)
          .clip(CircleShape)
          .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
      ) {
        Text(
          handle.take(1).ifBlank { "?" }.uppercase(),
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }
    Spacer(Modifier.width(12.dp))
    Column(modifier = Modifier.weight(1f)) {
      Text(
        text = handle,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (!subtitle.isNullOrBlank()) {
        Text(
          text = subtitle,
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      if (meta.isNotBlank()) {
        Text(
          text = meta,
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommunityFilterSheet(
  filters: CommunityFilters,
  defaultNativeLanguage: String,
  hasViewerCoords: Boolean,
  onDismiss: () -> Unit,
  onApply: (CommunityFilters) -> Unit,
) {
  var gender by remember(filters.gender) { mutableStateOf(filters.gender) }
  var minAgeText by remember(filters.minAge) { mutableStateOf(filters.minAge?.toString().orEmpty()) }
  var maxAgeText by remember(filters.maxAge) { mutableStateOf(filters.maxAge?.toString().orEmpty()) }
  var nativeLanguage by remember(filters.nativeLanguage) { mutableStateOf(filters.nativeLanguage) }
  var learningLanguage by remember(filters.learningLanguage) { mutableStateOf(filters.learningLanguage) }
  var radiusKm by remember(filters.radiusKm, hasViewerCoords) {
    mutableStateOf(if (hasViewerCoords) filters.radiusKm else null)
  }

  ModalBottomSheet(onDismissRequest = onDismiss) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Filter Members", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

      GenderDropdown(
        selectedGender = gender,
        onSelected = { gender = it },
      )

      Text("Age range", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
          value = minAgeText,
          onValueChange = { minAgeText = it.filter { ch -> ch.isDigit() }.take(2) },
          modifier = Modifier.weight(1f),
          label = { Text("Min age") },
          placeholder = { Text("Any") },
          singleLine = true,
        )
        OutlinedTextField(
          value = maxAgeText,
          onValueChange = { maxAgeText = it.filter { ch -> ch.isDigit() }.take(2) },
          modifier = Modifier.weight(1f),
          label = { Text("Max age") },
          placeholder = { Text("Any") },
          singleLine = true,
        )
      }

      LanguageDropdown(
        label = "Native Language",
        selectedLanguage = nativeLanguage,
        onSelected = { nativeLanguage = it },
      )
      LanguageDropdown(
        label = "Learning Language",
        selectedLanguage = learningLanguage,
        onSelected = { learningLanguage = it },
      )

      Text("Nearby radius", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
      if (hasViewerCoords) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          item {
            FilterChip(
              selected = radiusKm == null,
              onClick = { radiusKm = null },
              label = { Text("Any distance") },
            )
          }
          items(RadiusOptionsKm, key = { it }) { radius ->
            FilterChip(
              selected = radiusKm == radius,
              onClick = { radiusKm = radius },
              label = { Text("${radius}km") },
            )
          }
        }
      } else {
        Text(
          "Set your location in profile to enable nearby radius filtering.",
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          style = MaterialTheme.typography.bodyMedium,
        )
      }

      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(
          modifier = Modifier.weight(1f),
          onClick = {
            onApply(CommunityFilters(nativeLanguage = defaultNativeLanguage))
          },
        ) {
          Text("Reset")
        }
        Button(
          modifier = Modifier.weight(1f),
          onClick = {
            val parsedMin = minAgeText.toIntOrNull()?.coerceIn(18, 99)
            val parsedMax = maxAgeText.toIntOrNull()?.coerceIn(18, 99)
            val (minAge, maxAge) =
              if (parsedMin != null && parsedMax != null && parsedMin > parsedMax) {
                parsedMax to parsedMin
              } else {
                parsedMin to parsedMax
              }
            onApply(
              CommunityFilters(
                gender = gender,
                minAge = minAge,
                maxAge = maxAge,
                nativeLanguage = nativeLanguage,
                learningLanguage = learningLanguage,
                radiusKm = if (hasViewerCoords) radiusKm else null,
              ),
            )
          },
        ) {
          Text("Apply")
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GenderDropdown(
  selectedGender: Int?,
  onSelected: (Int?) -> Unit,
) {
  var expanded by remember { mutableStateOf(false) }
  val selectedLabel = GenderOptions.firstOrNull { it.value == selectedGender }?.label ?: "Gender"

  ExposedDropdownMenuBox(
    expanded = expanded,
    onExpandedChange = { expanded = it },
  ) {
    OutlinedTextField(
      value = selectedLabel,
      onValueChange = {},
      readOnly = true,
      label = { Text("Gender") },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
      modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
      singleLine = true,
    )
    ExposedDropdownMenu(
      expanded = expanded,
      onDismissRequest = { expanded = false },
    ) {
      GenderOptions.forEach { option ->
        DropdownMenuItem(
          text = { Text(option.label) },
          onClick = {
            onSelected(option.value)
            expanded = false
          },
        )
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguageDropdown(
  label: String,
  selectedLanguage: String?,
  onSelected: (String?) -> Unit,
) {
  var expanded by remember { mutableStateOf(false) }
  val options = remember {
    listOf(null to "Any") + LANGUAGE_OPTIONS.map { it.code.lowercase() to it.label }
  }
  val selectedLabel = options.firstOrNull { it.first == selectedLanguage?.lowercase() }?.second ?: "Any"

  ExposedDropdownMenuBox(
    expanded = expanded,
    onExpandedChange = { expanded = it },
  ) {
    OutlinedTextField(
      value = selectedLabel,
      onValueChange = {},
      readOnly = true,
      label = { Text(label) },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
      modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
      singleLine = true,
    )
    ExposedDropdownMenu(
      expanded = expanded,
      onDismissRequest = { expanded = false },
    ) {
      options.forEach { option ->
        DropdownMenuItem(
          text = { Text(option.second) },
          onClick = {
            onSelected(option.first)
            expanded = false
          },
        )
      }
    }
  }
}

private fun shortAddress(addr: String): String = "${addr.take(6)}...${addr.takeLast(4)}"

private fun distanceLabel(distanceKm: Double): String {
  return if (distanceKm < 1.0) "<1 km away" else "${distanceKm.roundToInt()} km away"
}
