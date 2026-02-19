use gpui::SharedString;

pub(crate) const SAMPLE_BASE_PRICE: &str = "25.00";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ScheduleScreen {
    Upcoming,
    Detail,
    Availability,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BookingStatus {
    Live,
    Upcoming,
    Completed,
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SlotStatus {
    Open,
    Booked,
    Cancelled,
    Settled,
}

#[derive(Clone)]
pub(crate) struct BookingRow {
    pub(crate) id: u64,
    pub(crate) peer_name: SharedString,
    pub(crate) peer_address: SharedString,
    pub(crate) start_label: SharedString,
    pub(crate) duration_mins: u32,
    pub(crate) status: BookingStatus,
    pub(crate) is_host: bool,
    pub(crate) tx_hash: SharedString,
    pub(crate) price_usd: SharedString,
    pub(crate) cancel_cutoff_mins: u32,
    pub(crate) amount_usd: SharedString,
}

#[derive(Clone)]
pub(crate) struct SlotRow {
    pub(crate) id: u64,
    pub(crate) start_time: i64,
    pub(crate) start_label: SharedString,
    pub(crate) duration_mins: u32,
    pub(crate) status: SlotStatus,
    pub(crate) guest_name: Option<SharedString>,
    pub(crate) price_usd: SharedString,
}
