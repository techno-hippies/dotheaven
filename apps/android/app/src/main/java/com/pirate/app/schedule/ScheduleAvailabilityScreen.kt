package com.pirate.app.schedule

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import com.pirate.app.util.shortAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class SlotEditorState(
  val dayIndex: Int,
  val hour: Int,
  val minute: Int,
  val baseStartMillis: Long,
  val targetAvailable: Boolean,
  val priceUsd: String,
  val scope: SlotApplyScope,
  val range: SlotApplyRange,
)

private data class SlotEditorPreview(
  val createStartTimesMillis: List<Long>,
  val cancelSlotIds: List<Long>,
  val alreadyMatchingCount: Int,
  val lockedCount: Int,
) {
  val affectedCount: Int get() = createStartTimesMillis.size + cancelSlotIds.size
}

@Composable
fun ScheduleAvailabilityScreen(
  isAuthenticated: Boolean,
  userAddress: String?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
  onClose: () -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var basePrice by remember { mutableStateOf<String?>(null) }
  var basePriceEdit by remember { mutableStateOf("") }
  var editingPrice by rememberSaveable { mutableStateOf(false) }
  var weekOffset by rememberSaveable { mutableStateOf(0) }
  var selectedDayIndex by rememberSaveable { mutableStateOf(todayWeekdayIndex()) }
  var availabilitySlots by remember { mutableStateOf<List<SlotRow>>(emptyList()) }
  var availabilityLoading by remember { mutableStateOf(false) }
  var availabilityBusy by remember { mutableStateOf(false) }
  var availabilityFilter by rememberSaveable { mutableStateOf(AvailabilityFilter.All.name) }
  var showFilterDrawer by rememberSaveable { mutableStateOf(false) }
  var slotEditor by remember { mutableStateOf<SlotEditorState?>(null) }

  suspend fun refreshAvailability() {
    if (!isAuthenticated || userAddress.isNullOrBlank()) {
      availabilitySlots = emptyList()
      availabilityLoading = false
      basePrice = DEFAULT_BASE_PRICE
      if (!editingPrice) basePriceEdit = DEFAULT_BASE_PRICE
      return
    }

    availabilityLoading = true
    runCatching {
      val slots = withContext(Dispatchers.IO) {
        TempoSessionEscrowApi.fetchHostAvailabilitySlots(hostAddress = userAddress, maxResults = 300)
      }
      val chainBasePrice = withContext(Dispatchers.IO) {
        TempoSessionEscrowApi.fetchHostBasePriceUsd(userAddress)
      }
      slots to chainBasePrice
    }.onSuccess { (slots, chainBasePrice) ->
      availabilitySlots = slots.mapIndexed { index, slot ->
        SlotRow(
          id = index + 1,
          slotId = slot.slotId,
          startTimeMillis = slot.startTimeSec * 1_000L,
          durationMinutes = slot.durationMins,
          status = hostSlotStatusToUi(slot.status),
          priceUsd = slot.priceUsd,
        )
      }
      val resolvedBase = chainBasePrice?.takeIf { it.isNotBlank() } ?: basePrice ?: DEFAULT_BASE_PRICE
      basePrice = resolvedBase
      if (!editingPrice) basePriceEdit = resolvedBase
    }.onFailure { err ->
      onShowMessage("Failed to load availability: ${err.message ?: "unknown error"}")
      availabilitySlots = emptyList()
    }
    availabilityLoading = false
  }

  LaunchedEffect(isAuthenticated, userAddress) {
    refreshAvailability()
  }

  val halfHourSlots = remember {
    val list = mutableListOf<Pair<Int, Int>>()
    repeat(48) { index ->
      val hour = index / 2
      val minute = if (index % 2 == 0) 0 else 30
      list.add(Pair(hour, minute))
    }
    list.toList()
  }

  val weekDates = remember(weekOffset) { buildWeekDates(weekOffset) }
  val selectedDayIndexClamped = selectedDayIndex.coerceIn(0, 6)
  if (selectedDayIndexClamped != selectedDayIndex) selectedDayIndex = selectedDayIndexClamped
  val selectedDay = weekDates[selectedDayIndex]
  val minEditableStartMillis = System.currentTimeMillis() + (5 * 60 * 1_000L)

  val slotByTime = availabilitySlots
    .filter { isSameDay(it.startTimeMillis, selectedDay) }
    .associateBy { it.startTimeMillis }
  val allSlotsByStart = availabilitySlots.associateBy { it.startTimeMillis }

  val filterMode = AvailabilityFilter.valueOf(availabilityFilter)
  val visibleHalfHourSlots = halfHourSlots.filter { (hour, minute) ->
    val startMillis = slotStartMillis(selectedDay, hour, minute)
    if (startMillis <= minEditableStartMillis) return@filter false
    val status = slotByTime[startMillis]?.status
    when (filterMode) {
      AvailabilityFilter.All -> true
      AvailabilityFilter.Available -> status == SlotStatus.Open
      AvailabilityFilter.Booked -> status == SlotStatus.Booked
    }
  }

  fun buildTargetStartTimes(editor: SlotEditorState): List<Long> {
    if (editor.scope == SlotApplyScope.ThisSlot) {
      return if (editor.baseStartMillis > minEditableStartMillis) listOf(editor.baseStartMillis) else emptyList()
    }

    val weekStart = weekDates.firstOrNull() ?: return emptyList()
    val dayIndexes = when (editor.scope) {
      SlotApplyScope.ThisSlot -> listOf(editor.dayIndex)
      SlotApplyScope.SameWeekday -> listOf(editor.dayIndex)
      SlotApplyScope.Weekdays -> listOf(1, 2, 3, 4, 5)
      SlotApplyScope.AllDays -> listOf(0, 1, 2, 3, 4, 5, 6)
    }

    val starts = mutableListOf<Long>()
    repeat(editor.range.weeks) { weekDelta ->
      dayIndexes.forEach { dayIndex ->
        val dayMillis = addDaysKeepingLocalMidnight(weekStart, (weekDelta * 7) + dayIndex)
        val startMillis = slotStartMillis(dayMillis, editor.hour, editor.minute)
        if (startMillis > minEditableStartMillis) {
          starts += startMillis
        }
      }
    }
    return starts.distinct().sorted()
  }

  fun buildEditorPreview(editor: SlotEditorState): SlotEditorPreview {
    val starts = buildTargetStartTimes(editor)
    val createStarts = mutableListOf<Long>()
    val cancelSlotIds = mutableListOf<Long>()
    var already = 0
    var locked = 0

    starts.forEach { startMillis ->
      val existing = allSlotsByStart[startMillis]
      if (editor.targetAvailable) {
        when {
          existing == null -> createStarts += startMillis
          existing.status == SlotStatus.Open -> already += 1
          existing.status == SlotStatus.Booked -> locked += 1
          else -> createStarts += startMillis
        }
      } else {
        when {
          existing?.status == SlotStatus.Open && existing.slotId != null -> cancelSlotIds += existing.slotId
          existing?.status == SlotStatus.Booked -> locked += 1
          else -> already += 1
        }
      }
    }

    return SlotEditorPreview(
      createStartTimesMillis = createStarts,
      cancelSlotIds = cancelSlotIds,
      alreadyMatchingCount = already,
      lockedCount = locked,
    )
  }

  fun previewSummary(editor: SlotEditorState, preview: SlotEditorPreview): String {
    return if (editor.targetAvailable) {
      "Will create ${preview.createStartTimesMillis.size} slots · ${preview.alreadyMatchingCount} already open · ${preview.lockedCount} locked"
    } else {
      "Will cancel ${preview.cancelSlotIds.size} slots · ${preview.alreadyMatchingCount} already unavailable · ${preview.lockedCount} locked"
    }
  }

  suspend fun executeCreatePlanLegacyV1(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    editor: SlotEditorState,
    preview: SlotEditorPreview,
  ): EscrowTxResult {
    val setBase = TempoSessionEscrowApi.setHostBasePrice(
      userAddress = account.address,
      sessionKey = sessionKey,
      priceUsd = editor.priceUsd,
    )
    if (!setBase.success) return setBase

    var usedSelfPayFallback = setBase.usedSelfPayFallback
    var lastHash = setBase.txHash

    for (startMillis in preview.createStartTimesMillis) {
      val result = TempoSessionEscrowApi.createSlot(
        userAddress = account.address,
        sessionKey = sessionKey,
        startTimeSec = startMillis / 1_000L,
        durationMins = SLOT_DURATION_MINS,
        graceMins = 5,
        minOverlapMins = 10,
        cancelCutoffMins = 60,
      )
      if (!result.success) return result
      usedSelfPayFallback = usedSelfPayFallback || result.usedSelfPayFallback
      if (!result.txHash.isNullOrBlank()) lastHash = result.txHash
    }

    return EscrowTxResult(success = true, txHash = lastHash, usedSelfPayFallback = usedSelfPayFallback)
  }

  suspend fun executeCreatePlanSequentialFallback(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    editor: SlotEditorState,
    preview: SlotEditorPreview,
  ): EscrowTxResult {
    if (preview.createStartTimesMillis.isEmpty()) {
      return EscrowTxResult(success = true)
    }

    val firstStart = preview.createStartTimesMillis.first()
    val firstAttempt = TempoSessionEscrowApi.createSlotWithPrice(
      userAddress = account.address,
      sessionKey = sessionKey,
      startTimeSec = firstStart / 1_000L,
      durationMins = SLOT_DURATION_MINS,
      graceMins = 5,
      minOverlapMins = 10,
      cancelCutoffMins = 60,
      priceUsd = editor.priceUsd,
    )

    if (!firstAttempt.success) {
      return executeCreatePlanLegacyV1(
        account = account,
        sessionKey = sessionKey,
        editor = editor,
        preview = preview,
      )
    }

    var usedSelfPayFallback = firstAttempt.usedSelfPayFallback
    var lastHash = firstAttempt.txHash
    for (startMillis in preview.createStartTimesMillis.drop(1)) {
      val result = TempoSessionEscrowApi.createSlotWithPrice(
        userAddress = account.address,
        sessionKey = sessionKey,
        startTimeSec = startMillis / 1_000L,
        durationMins = SLOT_DURATION_MINS,
        graceMins = 5,
        minOverlapMins = 10,
        cancelCutoffMins = 60,
        priceUsd = editor.priceUsd,
      )
      if (!result.success) return result
      usedSelfPayFallback = usedSelfPayFallback || result.usedSelfPayFallback
      if (!result.txHash.isNullOrBlank()) lastHash = result.txHash
    }

    return EscrowTxResult(success = true, txHash = lastHash, usedSelfPayFallback = usedSelfPayFallback)
  }

  suspend fun executeCancelPlanV1Fallback(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    preview: SlotEditorPreview,
  ): EscrowTxResult {
    var usedSelfPayFallback = false
    var lastHash: String? = null

    for (slotId in preview.cancelSlotIds) {
      val result = TempoSessionEscrowApi.cancelSlot(
        userAddress = account.address,
        sessionKey = sessionKey,
        slotId = slotId,
      )
      if (!result.success) return result
      usedSelfPayFallback = usedSelfPayFallback || result.usedSelfPayFallback
      if (!result.txHash.isNullOrBlank()) lastHash = result.txHash
    }

    return EscrowTxResult(success = true, txHash = lastHash, usedSelfPayFallback = usedSelfPayFallback)
  }

  Box(
    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
  ) {
    androidx.compose.foundation.layout.Column(modifier = Modifier.fillMaxSize()) {
      PirateMobileHeader(
        title = "",
        onClosePress = onClose,
      )

      LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 12.dp),
      ) {
        item {
          DayStrip(
            weekDates = weekDates,
            selectedDayIndex = selectedDayIndex,
            onDaySelected = { selectedDayIndex = it },
            onWeekSwipe = { delta ->
              weekOffset += delta
            },
          )
        }

        item { Spacer(modifier = Modifier.height(8.dp)) }

        item {
          AvailabilityHeaderCard(
            isAuthenticated = isAuthenticated,
            basePrice = basePrice,
            editingPrice = editingPrice,
            editValue = basePriceEdit,
            loading = availabilityLoading && basePrice == null && !editingPrice,
            busy = availabilityBusy,
            onEditStart = { editingPrice = true; basePriceEdit = basePrice ?: DEFAULT_BASE_PRICE },
            onPriceChange = { basePriceEdit = it },
            onCancelEdit = { editingPrice = false; basePriceEdit = basePrice ?: DEFAULT_BASE_PRICE },
            onSavePrice = {
              if (!isAuthenticated || userAddress.isNullOrBlank() || tempoAccount == null) {
                onShowMessage("Sign in with Tempo to set a base price.")
                return@AvailabilityHeaderCard
              }
              val normalizedPrice = normalizePriceInput(basePriceEdit) ?: run {
                onShowMessage("Enter a valid base price.")
                return@AvailabilityHeaderCard
              }

              availabilityBusy = true
              scope.launch {
                val sessionKey = ensureScheduleSessionKey(
                  context = context,
                  account = tempoAccount,
                  onShowMessage = onShowMessage,
                )
                if (sessionKey == null) {
                  availabilityBusy = false
                  return@launch
                }

                val result = TempoSessionEscrowApi.setHostBasePrice(
                  userAddress = tempoAccount.address,
                  sessionKey = sessionKey,
                  priceUsd = normalizedPrice,
                )
                if (result.success) {
                  basePrice = normalizedPrice
                  basePriceEdit = normalizedPrice
                  editingPrice = false
                  val fundingPath = if (result.usedSelfPayFallback) "self-pay fallback" else "sponsored"
                  onShowMessage("Base price updated ($fundingPath): ${shortAddress(result.txHash ?: "", minLengthToShorten = 10)}")
                  refreshAvailability()
                } else {
                  onShowMessage("Base price update failed: ${result.error ?: "unknown error"}")
                }
                availabilityBusy = false
              }
            },
          )
        }

        item {
          AvailabilityFilterBar(
            filterLabel = filterMode.label,
            onOpenFilter = { showFilterDrawer = true },
          )
        }

        item { Spacer(modifier = Modifier.height(4.dp)) }

        if (visibleHalfHourSlots.isEmpty()) {
          item {
            Text(
              text = if (filterMode == AvailabilityFilter.All) "No upcoming slots for this day." else "No slots match this filter.",
              modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
              style = MaterialTheme.typography.bodyMedium,
              color = PiratePalette.TextMuted,
              textAlign = TextAlign.Center,
            )
          }
        }

        items(visibleHalfHourSlots) { (hour, minute) ->
          val startTime = slotStartMillis(selectedDay, hour, minute)
          val existingSlot = slotByTime[startTime]
          val status = existingSlot?.status
          val isLocked = status == SlotStatus.Booked || status == SlotStatus.Settled
          val disabled = availabilityLoading || availabilityBusy || isLocked || !isAuthenticated

          AvailabilitySwitchRow(
            timeLabel = formatTime(hour, minute),
            status = status,
            checked = status == SlotStatus.Open || status == SlotStatus.Booked,
            enabled = !disabled,
            onRowClick = {
              if (disabled) return@AvailabilitySwitchRow
              if (userAddress.isNullOrBlank() || tempoAccount == null) {
                onShowMessage("Sign in with Tempo to edit availability.")
                return@AvailabilitySwitchRow
              }

              val initialPrice = existingSlot?.priceUsd?.takeIf { it.isNotBlank() } ?: basePrice ?: DEFAULT_BASE_PRICE
              val currentlyOpen = status == SlotStatus.Open
              slotEditor = SlotEditorState(
                dayIndex = selectedDayIndex,
                hour = hour,
                minute = minute,
                baseStartMillis = startTime,
                targetAvailable = !currentlyOpen,
                priceUsd = initialPrice,
                scope = SlotApplyScope.ThisSlot,
                range = SlotApplyRange.FourWeeks,
              )
            },
          )
        }
      }
    }

    AvailabilityFilterDrawer(
      visible = showFilterDrawer,
      selectedFilter = filterMode,
      onSelectFilter = {
        availabilityFilter = it.name
        showFilterDrawer = false
      },
      onDismiss = { showFilterDrawer = false },
    )

    val editor = slotEditor
    val editorPreview = editor?.let { buildEditorPreview(it) }
    val demandHint = editor?.let { buildChinaDemandHint(it.baseStartMillis, basePrice ?: DEFAULT_BASE_PRICE) }

    SlotEditorSheet(
      visible = editor != null,
      timeLabel = editor?.let { formatTime(it.hour, it.minute) } ?: "",
      targetAvailable = editor?.targetAvailable ?: false,
      onTargetAvailableChange = { next -> slotEditor = slotEditor?.copy(targetAvailable = next) },
      priceUsd = editor?.priceUsd ?: "",
      onPriceUsdChange = { value -> slotEditor = slotEditor?.copy(priceUsd = value) },
      demandHint = demandHint?.label ?: "",
      recommendedPriceUsd = demandHint?.recommendedPriceUsd,
      selectedScope = editor?.scope ?: SlotApplyScope.ThisSlot,
      onScopeChange = { scopeOption -> slotEditor = slotEditor?.copy(scope = scopeOption) },
      selectedRange = editor?.range ?: SlotApplyRange.FourWeeks,
      onRangeChange = { rangeOption -> slotEditor = slotEditor?.copy(range = rangeOption) },
      previewSummary =
        if (editor != null && editorPreview != null) {
          previewSummary(editor, editorPreview)
        } else {
          ""
        },
      busy = availabilityBusy,
      onApply = {
        val currentEditor = slotEditor ?: return@SlotEditorSheet
        if (!isAuthenticated || userAddress.isNullOrBlank() || tempoAccount == null) {
          onShowMessage("Sign in with Tempo to edit availability.")
          return@SlotEditorSheet
        }

        val normalizedPrice =
          if (currentEditor.targetAvailable) {
            normalizePriceInput(currentEditor.priceUsd) ?: run {
              onShowMessage("Enter a valid slot price.")
              return@SlotEditorSheet
            }
          } else {
            currentEditor.priceUsd
          }

        val editorForApply = currentEditor.copy(priceUsd = normalizedPrice)
        val preview = buildEditorPreview(editorForApply)
        if (preview.affectedCount == 0) {
          onShowMessage("No slot changes to apply.")
          slotEditor = null
          return@SlotEditorSheet
        }

        availabilityBusy = true
        scope.launch {
          val sessionKey = ensureScheduleSessionKey(
            context = context,
            account = tempoAccount,
            onShowMessage = onShowMessage,
          )
          if (sessionKey == null) {
            availabilityBusy = false
            return@launch
          }

          val (result, usedSequentialFallback) =
            if (editorForApply.targetAvailable) {
              if (!TempoSessionEscrowApi.SUPPORTS_BATCH_SLOT_CREATE || preview.createStartTimesMillis.isEmpty()) {
                executeCreatePlanSequentialFallback(
                  account = tempoAccount,
                  sessionKey = sessionKey,
                  editor = editorForApply,
                  preview = preview,
                ) to true
              } else {
                val batchEntries =
                  preview.createStartTimesMillis.map { startMillis ->
                    SlotPlanEntry(
                      startTimeSec = startMillis / 1_000L,
                      priceUsd = editorForApply.priceUsd,
                    )
                  }

                val batchResult =
                  TempoSessionEscrowApi.createSlotsWithPrices(
                    userAddress = tempoAccount.address,
                    sessionKey = sessionKey,
                    entries = batchEntries,
                    durationMins = SLOT_DURATION_MINS,
                    graceMins = 5,
                    minOverlapMins = 10,
                    cancelCutoffMins = 60,
                  )

                if (batchResult.success) {
                  batchResult to false
                } else {
                  executeCreatePlanSequentialFallback(
                    account = tempoAccount,
                    sessionKey = sessionKey,
                    editor = editorForApply,
                    preview = preview,
                  ) to true
                }
              }
            } else {
              if (!TempoSessionEscrowApi.SUPPORTS_BATCH_SLOT_CANCEL || preview.cancelSlotIds.isEmpty()) {
                executeCancelPlanV1Fallback(
                  account = tempoAccount,
                  sessionKey = sessionKey,
                  preview = preview,
                ) to true
              } else {
                val batchResult =
                  TempoSessionEscrowApi.cancelSlotsBestEffort(
                    userAddress = tempoAccount.address,
                    sessionKey = sessionKey,
                    slotIds = preview.cancelSlotIds,
                  )

                if (batchResult.success) {
                  batchResult to false
                } else {
                  executeCancelPlanV1Fallback(
                    account = tempoAccount,
                    sessionKey = sessionKey,
                    preview = preview,
                  ) to true
                }
              }
            }

          if (result.success) {
            val fundingPath = if (result.usedSelfPayFallback) "self-pay fallback" else "sponsored"
            val fallbackLabel =
              when {
                editorForApply.targetAvailable && !TempoSessionEscrowApi.SUPPORTS_BATCH_SLOT_CREATE -> "sequential"
                !editorForApply.targetAvailable && !TempoSessionEscrowApi.SUPPORTS_BATCH_SLOT_CANCEL -> "sequential"
                usedSequentialFallback -> "sequential fallback"
                else -> "batch"
              }
            onShowMessage(
              "Availability updated ($fundingPath, $fallbackLabel): ${shortAddress(result.txHash ?: "", minLengthToShorten = 10)}",
            )
            slotEditor = null
            refreshAvailability()
          } else {
            onShowMessage("Availability update failed: ${result.error ?: "unknown error"}")
          }

          availabilityBusy = false
        }
      },
      onDismiss = {
        if (!availabilityBusy) {
          slotEditor = null
        }
      },
    )
  }
}
