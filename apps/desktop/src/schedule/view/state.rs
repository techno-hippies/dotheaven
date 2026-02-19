use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use gpui::*;
use gpui_component::input::InputState;

use crate::schedule::model::{
    BookingRow, BookingStatus, ScheduleScreen, SlotRow, SlotStatus, SAMPLE_BASE_PRICE,
};

pub(crate) struct ScheduleView {
    screen: ScheduleScreen,
    selected_booking_id: Option<u64>,
    is_in_call: bool,
    is_muted: bool,
    base_price: SharedString,
    editing_base_price: bool,
    accepting_bookings: bool,
    upcoming_bookings: Vec<BookingRow>,
    slot_rows: Vec<SlotRow>,
    base_price_input: Entity<InputState>,
    slot_start_input: Entity<InputState>,
    slot_duration_input: Entity<InputState>,
    week_offset: i32,
    selected_day_idx: usize,
}

impl ScheduleView {
    pub(crate) fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let base_price_input = cx.new(|cx| InputState::new(window, cx).placeholder("25.00"));
        let slot_start_input =
            cx.new(|cx| InputState::new(window, cx).placeholder("2026-02-14 18:00"));
        let slot_duration_input = cx.new(|cx| InputState::new(window, cx).placeholder("60"));

        base_price_input.update(cx, |state, cx| {
            state.set_value(SAMPLE_BASE_PRICE, window, cx);
        });

        Self {
            screen: ScheduleScreen::Upcoming,
            selected_booking_id: None,
            is_in_call: false,
            is_muted: false,
            base_price: SAMPLE_BASE_PRICE.into(),
            editing_base_price: false,
            accepting_bookings: true,
            upcoming_bookings: vec![
                BookingRow {
                    id: 1,
                    peer_name: "Ariya".into(),
                    peer_address: "0xA11C...be77".into(),
                    start_label: "Feb 14, 2026 at 18:00".into(),
                    duration_mins: 30,
                    status: BookingStatus::Upcoming,
                    is_host: true,
                    tx_hash: "0x9d..01".into(),
                    price_usd: "25.00".into(),
                    cancel_cutoff_mins: 30,
                    amount_usd: "25.00".into(),
                },
                BookingRow {
                    id: 2,
                    peer_name: "Tamsin".into(),
                    peer_address: "0xD12A...4f22".into(),
                    start_label: "Feb 15, 2026 at 20:00".into(),
                    duration_mins: 60,
                    status: BookingStatus::Live,
                    is_host: false,
                    tx_hash: "0x9d..02".into(),
                    price_usd: "40.00".into(),
                    cancel_cutoff_mins: 45,
                    amount_usd: "40.00".into(),
                },
            ],
            slot_rows: vec![
                SlotRow {
                    id: 1,
                    start_time: Self::to_unix(2026, 2, 20, 19, 0),
                    start_label: "Feb 20, 2026 at 19:00".into(),
                    duration_mins: 60,
                    status: SlotStatus::Open,
                    guest_name: None,
                    price_usd: "25.00".into(),
                },
                SlotRow {
                    id: 2,
                    start_time: Self::to_unix(2026, 2, 22, 21, 0),
                    start_label: "Feb 22, 2026 at 21:00".into(),
                    duration_mins: 45,
                    status: SlotStatus::Booked,
                    guest_name: Some("Ariya".into()),
                    price_usd: "30.00".into(),
                },
            ],
            base_price_input,
            slot_start_input,
            slot_duration_input,
            week_offset: 0,
            selected_day_idx: Self::today_weekday_idx(),
        }
    }

    pub(crate) fn selected_booking(&self) -> Option<&BookingRow> {
        self.selected_booking_id.and_then(|id| {
            self.upcoming_bookings
                .iter()
                .find(|booking| booking.id == id)
        })
    }

    pub(crate) fn selected_booking_id(&self) -> Option<u64> {
        self.selected_booking_id
    }

    pub(crate) fn view_title(&self) -> &'static str {
        match self.screen {
            ScheduleScreen::Upcoming => "Schedule",
            ScheduleScreen::Detail => "Booking Detail",
            ScheduleScreen::Availability => "Availability",
        }
    }

    pub(crate) fn screen(&self) -> ScheduleScreen {
        self.screen
    }

    pub(crate) fn is_in_call(&self) -> bool {
        self.is_in_call
    }

    pub(crate) fn is_muted(&self) -> bool {
        self.is_muted
    }

    pub(crate) fn accepting_bookings(&self) -> bool {
        self.accepting_bookings
    }

    pub(crate) fn base_price(&self) -> SharedString {
        self.base_price.clone()
    }

    pub(crate) fn editing_base_price(&self) -> bool {
        self.editing_base_price
    }

    pub(crate) fn upcoming_bookings(&self) -> &Vec<BookingRow> {
        &self.upcoming_bookings
    }

    pub(crate) fn slot_rows(&self) -> &Vec<SlotRow> {
        &self.slot_rows
    }

    pub(crate) fn base_price_input(&self) -> &Entity<InputState> {
        &self.base_price_input
    }

    pub(crate) fn slot_start_input(&self) -> &Entity<InputState> {
        &self.slot_start_input
    }

    pub(crate) fn slot_duration_input(&self) -> &Entity<InputState> {
        &self.slot_duration_input
    }

    pub(crate) fn week_offset(&self) -> i32 {
        self.week_offset
    }

    pub(crate) fn selected_day_idx(&self) -> usize {
        self.selected_day_idx
    }

    pub(crate) fn week_dates(&self) -> Vec<NaiveDate> {
        let now = Utc::now().date_naive();
        let monday = now - Duration::days(i64::from(now.weekday().num_days_from_monday()));
        let monday = monday + Duration::weeks(i64::from(self.week_offset));

        (0..7)
            .map(|day_idx| monday + Duration::days(day_idx))
            .collect()
    }

    pub(crate) fn selected_day(&self) -> NaiveDate {
        let idx = self.selected_day_idx.min(6);
        self.week_dates()[idx]
    }

    pub(crate) fn set_week_offset(&mut self, week_offset: i32, cx: &mut Context<Self>) {
        self.week_offset = week_offset;
        cx.notify();
    }

    pub(crate) fn shift_week(&mut self, delta: i32, cx: &mut Context<Self>) {
        self.week_offset = self.week_offset.saturating_add(delta);
        cx.notify();
    }

    pub(crate) fn set_selected_day_idx(&mut self, idx: usize, cx: &mut Context<Self>) {
        self.selected_day_idx = idx.min(6);
        cx.notify();
    }

    pub(crate) fn go_today(&mut self, cx: &mut Context<Self>) {
        self.week_offset = 0;
        self.selected_day_idx = Self::today_weekday_idx();
        cx.notify();
    }

    pub(crate) fn slot_for_start_time(&self, start_time: i64) -> Option<&SlotRow> {
        self.slot_rows
            .iter()
            .find(|slot| slot.start_time == start_time)
    }

    pub(crate) fn slot_day_count(&self, day: NaiveDate) -> usize {
        self.slot_rows
            .iter()
            .filter(|slot| {
                !matches!(slot.status, SlotStatus::Cancelled | SlotStatus::Settled)
                    && Utc
                        .timestamp_opt(slot.start_time, 0)
                        .single()
                        .is_some_and(|dt| dt.date_naive() == day)
            })
            .count()
    }

    pub(crate) fn toggle_slot_time(&mut self, start_time: i64, cx: &mut Context<Self>) {
        if !self.accepting_bookings {
            return;
        }

        if let Some(idx) = self
            .slot_rows
            .iter()
            .position(|slot| slot.start_time == start_time)
        {
            if self.slot_rows[idx].status == SlotStatus::Open {
                self.slot_rows.remove(idx);
            }
            cx.notify();
            return;
        }

        let next_id = self
            .slot_rows
            .last()
            .map_or(1, |slot| slot.id.saturating_add(1));
        self.slot_rows.push(SlotRow {
            id: next_id,
            start_time,
            start_label: Self::format_slot_label(start_time),
            duration_mins: 20,
            status: SlotStatus::Open,
            guest_name: None,
            price_usd: self.base_price.clone(),
        });

        cx.notify();
    }

    pub(crate) fn open_availability(&mut self, cx: &mut Context<Self>) {
        self.screen = ScheduleScreen::Availability;
        self.selected_booking_id = None;
        self.editing_base_price = false;
        cx.notify();
    }

    pub(crate) fn open_upcoming(&mut self, cx: &mut Context<Self>) {
        self.screen = ScheduleScreen::Upcoming;
        self.selected_booking_id = None;
        self.is_in_call = false;
        self.is_muted = false;
        self.editing_base_price = false;
        cx.notify();
    }

    pub(crate) fn open_booking_detail(&mut self, booking_id: u64, cx: &mut Context<Self>) {
        self.screen = ScheduleScreen::Detail;
        self.selected_booking_id = Some(booking_id);
        self.is_in_call = false;
        self.is_muted = false;
        self.editing_base_price = false;
        cx.notify();
    }

    pub(crate) fn toggle_accepting(&mut self, cx: &mut Context<Self>) {
        self.accepting_bookings = !self.accepting_bookings;
        cx.notify();
    }

    pub(crate) fn start_edit_base_price(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.editing_base_price = true;
        let price = self.base_price.clone();
        self.base_price_input.update(cx, move |state, cx| {
            state.set_value(price.clone(), window, cx);
        });
        cx.notify();
    }

    pub(crate) fn cancel_edit_base_price(&mut self, cx: &mut Context<Self>) {
        self.editing_base_price = false;
        cx.notify();
    }

    pub(crate) fn set_base_price(&mut self, cx: &mut Context<Self>) {
        let raw = self.base_price_input.read(cx).value().trim().to_string();
        self.base_price = if raw.is_empty() {
            SAMPLE_BASE_PRICE.into()
        } else {
            raw.into()
        };
        self.editing_base_price = false;
        cx.notify();
    }

    pub(crate) fn create_slot(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.accepting_bookings {
            return;
        }

        let start = self.slot_start_input.read(cx).value().trim().to_string();
        if start.is_empty() {
            return;
        }

        let start_time = match Self::parse_slot_start(&start) {
            Some(start_time) => start_time,
            None => return,
        };

        let duration = self
            .slot_duration_input
            .read(cx)
            .value()
            .trim()
            .parse::<u32>()
            .ok()
            .unwrap_or(30);

        let next_id = self
            .slot_rows
            .last()
            .map_or(1, |slot| slot.id.saturating_add(1));
        self.slot_rows.push(SlotRow {
            id: next_id,
            start_time,
            start_label: start.into(),
            duration_mins: duration,
            status: SlotStatus::Open,
            guest_name: None,
            price_usd: self.base_price.clone(),
        });

        self.slot_start_input
            .update(cx, |state, cx| state.set_value("", window, cx));
        cx.notify();
    }

    pub(crate) fn create_slot_time_for_day(&self, hour: u32, minute: u32) -> i64 {
        let selected = self.selected_day();
        let Some(selected_time) = selected.and_hms_opt(hour, minute, 0) else {
            return Utc::now().timestamp();
        };
        Utc.from_utc_datetime(&selected_time).timestamp()
    }

    fn to_unix(year: i32, month: u32, day: u32, hour: u32, min: u32) -> i64 {
        Utc.with_ymd_and_hms(year, month, day, hour, min, 0)
            .single()
            .map(|dt| dt.timestamp())
            .unwrap_or(0)
    }

    fn parse_slot_start(value: &str) -> Option<i64> {
        NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M")
            .ok()
            .map(|dt| dt.and_utc().timestamp())
    }

    fn format_slot_label(start_time: i64) -> SharedString {
        Utc.timestamp_opt(start_time, 0)
            .single()
            .map(|dt| dt.format("%b %e, %Y at %H:%M").to_string().into())
            .unwrap_or_else(|| start_time.to_string().into())
    }

    fn today_weekday_idx() -> usize {
        Utc::now().weekday().num_days_from_monday() as usize
    }

    pub(crate) fn remove_slot(&mut self, slot_id: u64, cx: &mut Context<Self>) {
        self.slot_rows.retain(|slot| slot.id != slot_id);
        cx.notify();
    }

    pub(crate) fn join_session(&mut self, cx: &mut Context<Self>) {
        self.is_in_call = true;
        self.is_muted = false;
        cx.notify();
    }

    pub(crate) fn leave_session(&mut self, cx: &mut Context<Self>) {
        self.is_in_call = false;
        self.is_muted = false;
        cx.notify();
    }

    pub(crate) fn toggle_mute(&mut self, cx: &mut Context<Self>) {
        self.is_muted = !self.is_muted;
        cx.notify();
    }

    pub(crate) fn cancel_selected_booking(&mut self, cx: &mut Context<Self>) {
        if let Some(id) = self.selected_booking_id {
            self.upcoming_bookings.retain(|booking| booking.id != id);
        }
        self.open_upcoming(cx);
    }
}
