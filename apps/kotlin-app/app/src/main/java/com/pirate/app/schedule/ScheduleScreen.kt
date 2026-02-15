package com.pirate.app.schedule

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.EditCalendar
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private const val DEFAULT_BASE_PRICE = "0.025"
private const val SLOT_DURATION_MINS = 20

private enum class BookingStatus {
  Live,
  Upcoming,
  Completed,
  Cancelled,
}

private enum class SlotStatus {
  Open,
  Booked,
  Cancelled,
  Settled,
}

private data class BookingRow(
  val id: Int,
  val peerName: String,
  val peerAddress: String,
  val startTimeMillis: Long,
  val durationMinutes: Int,
  val status: BookingStatus,
  val isHost: Boolean,
  val amountEth: String,
)

private data class SlotRow(
  val id: Int,
  val startTimeMillis: Long,
  val durationMinutes: Int,
  val status: SlotStatus,
  val guestName: String? = null,
  val priceEth: String = DEFAULT_BASE_PRICE,
)

@Composable
fun ScheduleScreen(
  isAuthenticated: Boolean,
  onOpenDrawer: () -> Unit,
) {
  var showAvailability by remember { mutableStateOf(false) }
  var basePrice by remember { mutableStateOf(DEFAULT_BASE_PRICE) }
  var basePriceEdit by remember { mutableStateOf(DEFAULT_BASE_PRICE) }
  var editingPrice by remember { mutableStateOf(false) }
  var acceptingBookings by remember { mutableStateOf(true) }
  var upcomingBookings by remember { mutableStateOf(initialUpcomingBookings()) }
  var weekOffset by remember { mutableIntStateOf(0) }
  var selectedDayIndex by remember { mutableIntStateOf(todayWeekdayIndex()) }

  val availabilitySlots = remember { initialAvailabilitySlots().toMutableStateList() }
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
  val weekLabel = formatWeekLabel(weekDates)
  val selectedDayLabel = formatSelectedDay(selectedDay)

  val slotByTime = availabilitySlots
    .filter { isSameDay(it.startTimeMillis, selectedDay) }
    .associateBy { it.startTimeMillis }

  Column(
    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
  ) {
    PirateMobileHeader(
      title = "Schedule",
      isAuthenticated = isAuthenticated,
      onAvatarPress = onOpenDrawer,
      rightSlot = {
        IconButton(onClick = { showAvailability = !showAvailability }) {
          Icon(
            Icons.Rounded.EditCalendar,
            contentDescription = "Availability",
            tint = if (showAvailability) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
          )
        }
      },
    )

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      if (!showAvailability) {
        // ── Upcoming Sessions ──
        item {
          UpcomingSessionsSection(
            bookings = upcomingBookings,
            isAuthenticated = isAuthenticated,
            onJoin = { bookingId ->
              upcomingBookings = upcomingBookings.map { booking ->
                if (booking.id != bookingId) booking
                else if (booking.status == BookingStatus.Upcoming) booking.copy(status = BookingStatus.Live)
                else booking
              }
            },
            onCancel = { bookingId ->
              upcomingBookings = upcomingBookings.filterNot { it.id == bookingId }
            },
          )
        }
      } else {
        // ── Availability Editor ──
        item {
          AvailabilityHeaderCard(
            isAuthenticated = isAuthenticated,
            basePrice = basePrice,
            editingPrice = editingPrice,
            editValue = basePriceEdit,
            onEditStart = { editingPrice = true; basePriceEdit = basePrice },
            onPriceChange = { basePriceEdit = it },
            onCancelEdit = { editingPrice = false; basePriceEdit = basePrice },
            onSavePrice = { basePrice = basePriceEdit.ifBlank { DEFAULT_BASE_PRICE }; editingPrice = false },
          )
        }

        item {
          AvailabilityControls(acceptingBookings = acceptingBookings, onAcceptingChange = { acceptingBookings = it })
        }

        item {
          if (!acceptingBookings) {
            Surface(
              modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
              shape = RoundedCornerShape(10.dp),
              color = MaterialTheme.colorScheme.error.copy(alpha = 0.10f),
              border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.22f)),
            ) {
              Text("Bookings are paused", modifier = Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.error)
            }
            Spacer(modifier = Modifier.height(10.dp))
          }
        }

        item {
          WeekHeader(
            weekLabel = weekLabel,
            onPreviousWeek = { weekOffset -= 1 },
            onNextWeek = { weekOffset += 1 },
            onToday = { weekOffset = 0; selectedDayIndex = todayWeekdayIndex() },
          )
        }

        item {
          DayStrip(
            weekDates = weekDates,
            selectedDayIndex = selectedDayIndex,
            onDaySelected = { selectedDayIndex = it },
            hasSlotsOnDate = { date ->
              availabilitySlots.any { it.status != SlotStatus.Cancelled && it.status != SlotStatus.Settled && isSameDay(it.startTimeMillis, date) }
            },
          )
        }

        item {
          Text(
            text = selectedDayLabel,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
          )
        }

        item { Spacer(modifier = Modifier.height(4.dp)) }

        items(halfHourSlots.chunked(2)) { pair ->
          Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
          ) {
            pair.forEach { (hour, minute) ->
              val startTime = slotStartMillis(selectedDay, hour, minute)
              val existingSlot = slotByTime[startTime]
              val isBooked = existingSlot?.status == SlotStatus.Booked
              val disabled = isBooked || existingSlot?.status == SlotStatus.Settled || !acceptingBookings || !isAuthenticated

              AvailabilitySlotCard(
                timeLabel = formatTime(hour, minute),
                status = existingSlot?.status,
                onClick = {
                  val idx = availabilitySlots.indexOfFirst { it.id == existingSlot?.id }
                  if (disabled || existingSlot == null) {
                    if (!disabled && idx < 0) {
                      val nextId = (availabilitySlots.maxByOrNull { it.id }?.id ?: 0) + 1
                      availabilitySlots.add(
                        SlotRow(id = nextId, startTimeMillis = startTime, durationMinutes = SLOT_DURATION_MINS, status = SlotStatus.Open, priceEth = basePrice),
                      )
                    }
                    return@AvailabilitySlotCard
                  }
                  when (existingSlot.status) {
                    SlotStatus.Open -> availabilitySlots.removeAt(idx)
                    SlotStatus.Cancelled -> availabilitySlots[idx] = existingSlot.copy(status = SlotStatus.Open, guestName = null)
                    SlotStatus.Booked, SlotStatus.Settled -> {}
                  }
                },
                enabled = !disabled,
              )
            }
            if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
          }
        }
      }
    }
  }
}

// ── Upcoming Sessions ──

@Composable
private fun UpcomingSessionsSection(
  bookings: List<BookingRow>,
  isAuthenticated: Boolean,
  onJoin: (Int) -> Unit,
  onCancel: (Int) -> Unit,
) {
  if (bookings.isEmpty()) {
    Text(
      "No scheduled sessions right now.",
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
      color = PiratePalette.TextMuted,
      style = MaterialTheme.typography.bodyLarge,
      textAlign = TextAlign.Center,
    )
    return
  }

  bookings.forEach { booking ->
    val canJoin = isAuthenticated && (booking.status == BookingStatus.Upcoming || booking.status == BookingStatus.Live)
    val canCancel = isAuthenticated && (booking.status == BookingStatus.Upcoming || booking.status == BookingStatus.Live)
    Card(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
      shape = RoundedCornerShape(12.dp),
      colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1C1C)),
      border = BorderStroke(1.dp, Color(0xFF363636)),
    ) {
      Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
          Text(booking.peerName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Color(0xFFFAFAFA))
          Surface(
            color = statusBgColor(booking.status),
            shape = RoundedCornerShape(999.dp),
          ) {
            Text(
              bookingStatusLabel(booking.status),
              modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
              style = MaterialTheme.typography.bodyMedium,
              fontWeight = FontWeight.Medium,
              color = statusFgColor(booking.status),
            )
          }
        }

        Text(
          text = formatDateTime(booking.startTimeMillis),
          style = MaterialTheme.typography.bodyLarge,
          color = Color(0xFFD4D4D4),
        )
        Text(
          text = "${booking.durationMinutes} min · ${booking.amountEth} ETH",
          style = MaterialTheme.typography.bodyLarge,
          color = Color(0xFFA3A3A3),
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedButton(onClick = { onCancel(booking.id) }, enabled = canCancel, modifier = Modifier.weight(1f)) {
            Text("Cancel")
          }
          Button(onClick = { onJoin(booking.id) }, enabled = canJoin, modifier = Modifier.weight(1f)) {
            Text(if (booking.status == BookingStatus.Live) "In call" else "Join")
          }
        }
      }
    }
  }
}

// ── Availability ──

@Composable
private fun AvailabilityHeaderCard(
  isAuthenticated: Boolean,
  basePrice: String,
  editingPrice: Boolean,
  editValue: String,
  onEditStart: () -> Unit,
  onPriceChange: (String) -> Unit,
  onCancelEdit: () -> Unit,
  onSavePrice: () -> Unit,
) {
  Card(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    shape = RoundedCornerShape(12.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
  ) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text("Base Price", style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
      if (editingPrice) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedTextField(value = editValue, onValueChange = onPriceChange, singleLine = true, label = { Text("ETH") }, enabled = isAuthenticated, modifier = Modifier.weight(1f))
          OutlinedButton(onClick = onCancelEdit, enabled = isAuthenticated) { Text("Cancel") }
          Button(onClick = onSavePrice, enabled = isAuthenticated) { Text("Save") }
        }
      } else {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
          Text("$basePrice ETH", style = MaterialTheme.typography.headlineSmall)
          OutlinedButton(onClick = onEditStart, enabled = isAuthenticated) { Text("Edit") }
        }
      }
    }
  }
}

@Composable
private fun AvailabilityControls(acceptingBookings: Boolean, onAcceptingChange: (Boolean) -> Unit) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text("Accepting bookings", style = MaterialTheme.typography.bodyLarge)
    Switch(checked = acceptingBookings, onCheckedChange = onAcceptingChange)
  }
}

@Composable
private fun WeekHeader(weekLabel: String, onPreviousWeek: () -> Unit, onNextWeek: () -> Unit, onToday: () -> Unit) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Row(
      modifier = Modifier.background(MaterialTheme.colorScheme.surface, RoundedCornerShape(10.dp)).padding(8.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Surface(modifier = Modifier.size(28.dp).clickable(onClick = onPreviousWeek), shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(contentAlignment = Alignment.Center) { Text("◀", color = MaterialTheme.colorScheme.onSurfaceVariant) }
      }
      Text(weekLabel, fontWeight = FontWeight.SemiBold)
      Surface(modifier = Modifier.size(28.dp).clickable(onClick = onNextWeek), shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(contentAlignment = Alignment.Center) { Text("▶", color = MaterialTheme.colorScheme.onSurfaceVariant) }
      }
    }
    OutlinedButton(onClick = onToday) { Text("Today") }
  }
}

@Composable
private fun DayStrip(weekDates: List<Long>, selectedDayIndex: Int, onDaySelected: (Int) -> Unit, hasSlotsOnDate: (Long) -> Boolean) {
  Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    weekDates.forEachIndexed { index, day ->
      val dayFormatter = SimpleDateFormat("EEE", Locale.getDefault())
      val dateFormatter = SimpleDateFormat("d", Locale.getDefault())
      val isSelected = index == selectedDayIndex
      val isToday = isSameDay(day, System.currentTimeMillis())
      val hasSlots = hasSlotsOnDate(day)

      Surface(
        modifier = Modifier.weight(1f).height(72.dp).clickable { onDaySelected(index) },
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
      ) {
        Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceBetween) {
          Text(dayFormatter.format(Date(day)), style = MaterialTheme.typography.bodyMedium, color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
          Text(dateFormatter.format(Date(day)), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = if (isSelected) MaterialTheme.colorScheme.onPrimary else if (isToday) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface)
          Text(if (hasSlots) "•" else "", color = if (isSelected) MaterialTheme.colorScheme.onPrimary else PiratePalette.TextMuted)
        }
      }
    }
  }
}

@Composable
private fun RowScope.AvailabilitySlotCard(timeLabel: String, status: SlotStatus?, onClick: () -> Unit, enabled: Boolean) {
  val isOpen = status == SlotStatus.Open
  val isBooked = status == SlotStatus.Booked
  val bg = when { isOpen -> MaterialTheme.colorScheme.primary.copy(alpha = 0.20f); isBooked -> MaterialTheme.colorScheme.surfaceVariant; else -> MaterialTheme.colorScheme.surface }
  val fg = when { isOpen -> MaterialTheme.colorScheme.primary; isBooked -> MaterialTheme.colorScheme.outline; else -> MaterialTheme.colorScheme.onSurfaceVariant }
  val border = when { isOpen -> MaterialTheme.colorScheme.primary; isBooked -> MaterialTheme.colorScheme.outline; else -> MaterialTheme.colorScheme.outlineVariant }
  val rightText = when (status) { SlotStatus.Booked -> "Booked"; SlotStatus.Open -> "Open"; SlotStatus.Cancelled, SlotStatus.Settled -> "N/A"; null -> "" }

  Surface(
    modifier = Modifier.weight(1f).height(54.dp).clickable(enabled = enabled, onClick = onClick),
    shape = RoundedCornerShape(12.dp),
    color = bg,
    border = BorderStroke(1.dp, border),
  ) {
    Row(modifier = Modifier.fillMaxSize().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
      Text(timeLabel, style = MaterialTheme.typography.bodyMedium, color = fg)
      Text(rightText, style = MaterialTheme.typography.bodyMedium, color = fg)
    }
  }
}

// ── Helpers ──

private fun bookingStatusLabel(status: BookingStatus): String = when (status) {
  BookingStatus.Live -> "Live"
  BookingStatus.Upcoming -> "Upcoming"
  BookingStatus.Completed -> "Completed"
  BookingStatus.Cancelled -> "Cancelled"
}

private fun statusBgColor(status: BookingStatus): Color = when (status) {
  BookingStatus.Live -> Color(0xFF89B4FA).copy(alpha = 0.15f)       // blue tint
  BookingStatus.Upcoming -> Color(0xFFA3A3A3).copy(alpha = 0.15f)   // muted tint
  BookingStatus.Completed -> Color(0xFF404040)
  BookingStatus.Cancelled -> Color(0xFF404040)
}

private fun statusFgColor(status: BookingStatus): Color = when (status) {
  BookingStatus.Live -> Color(0xFF89B4FA)         // accent blue
  BookingStatus.Upcoming -> Color(0xFFD4D4D4)     // secondary text
  BookingStatus.Completed -> Color(0xFFA3A3A3)    // muted
  BookingStatus.Cancelled -> Color(0xFFA3A3A3)    // muted
}

private fun formatDateTime(millis: Long): String = SimpleDateFormat("EEE, MMM d • h:mm a", Locale.getDefault()).format(Date(millis))
private fun formatTime(hour: Int, minute: Int): String { val suffix = if (hour >= 12) "PM" else "AM"; val dh = ((hour + 11) % 12) + 1; return String.format(Locale.getDefault(), "%d:%02d %s", dh, minute, suffix) }
private fun abbreviateAddress(address: String): String { if (address.length <= 10) return address; return "${address.take(6)}...${address.takeLast(4)}" }

private fun slotStartMillis(selectedDay: Long, hour: Int, minute: Int): Long {
  val cal = Calendar.getInstance(); cal.timeInMillis = selectedDay; cal.set(Calendar.HOUR_OF_DAY, hour); cal.set(Calendar.MINUTE, minute); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0); return cal.timeInMillis
}

private fun todayWeekdayIndex(): Int { val cal = Calendar.getInstance(); return (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7 }

private fun buildWeekDates(weekOffset: Int): List<Long> {
  val now = Calendar.getInstance(); val ci = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7; now.add(Calendar.DAY_OF_MONTH, -ci); now.add(Calendar.WEEK_OF_YEAR, weekOffset)
  val out = ArrayList<Long>(7); repeat(7) { out.add(now.timeInMillis); now.add(Calendar.DAY_OF_MONTH, 1) }; return out
}

private fun formatWeekLabel(weekDates: List<Long>): String {
  if (weekDates.size != 7) return ""; val s = weekDates.first(); val e = weekDates.last()
  val sm = SimpleDateFormat("MMM", Locale.getDefault()).format(Date(s)); val em = SimpleDateFormat("MMM", Locale.getDefault()).format(Date(e))
  val sd = SimpleDateFormat("d", Locale.getDefault()).format(Date(s)); val ed = SimpleDateFormat("d", Locale.getDefault()).format(Date(e))
  val y = SimpleDateFormat("yyyy", Locale.getDefault()).format(Date(s)); return if (sm == em) "$sm $sd - $ed, $y" else "$sm $sd - $em $ed, $y"
}

private fun formatSelectedDay(selectedDay: Long): String = SimpleDateFormat("EEEE, MMM d", Locale.getDefault()).format(Date(selectedDay))

private fun isSameDay(first: Long, second: Long): Boolean {
  val a = Calendar.getInstance().apply { timeInMillis = first }; val b = Calendar.getInstance().apply { timeInMillis = second }
  return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.MONTH) == b.get(Calendar.MONTH) && a.get(Calendar.DAY_OF_MONTH) == b.get(Calendar.DAY_OF_MONTH)
}

private fun initialUpcomingBookings(): List<BookingRow> {
  val now = System.currentTimeMillis()
  return listOf(
    BookingRow(id = 1, peerName = "Ariya", peerAddress = "0xA11C...be77", startTimeMillis = now + 90 * 60 * 1000, durationMinutes = 30, status = BookingStatus.Upcoming, isHost = true, amountEth = "0.025"),
    BookingRow(id = 2, peerName = "Tamsin", peerAddress = "0xD12A...4f22", startTimeMillis = now + 7 * 60 * 60 * 1000, durationMinutes = 60, status = BookingStatus.Live, isHost = false, amountEth = "0.040"),
  )
}

private fun initialAvailabilitySlots(): List<SlotRow> {
  val now = System.currentTimeMillis(); val today = Calendar.getInstance().apply { timeInMillis = now }
  return listOf(
    SlotRow(id = 1, startTimeMillis = slotStartAt(today.clone() as Calendar, 19, 0), durationMinutes = 20, status = SlotStatus.Open, priceEth = "0.025"),
    SlotRow(id = 2, startTimeMillis = slotStartAt(today.clone() as Calendar, 21, 0), durationMinutes = 45, status = SlotStatus.Open, priceEth = "0.030"),
    SlotRow(id = 3, startTimeMillis = slotStartAt((today.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 2) }, 19, 30), durationMinutes = 20, status = SlotStatus.Booked, guestName = "Ariya", priceEth = "0.025"),
  )
}

private fun slotStartAt(base: Calendar, hour: Int, minute: Int): Long {
  base.set(Calendar.HOUR_OF_DAY, hour); base.set(Calendar.MINUTE, minute); base.set(Calendar.SECOND, 0); base.set(Calendar.MILLISECOND, 0); return base.timeInMillis
}
