use std::process::Child;
use std::time::Instant;

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{
    input::{Input, InputState},
    scroll::ScrollableElement,
    theme::Theme,
    ActiveTheme, StyledExt,
};

use crate::voice::desktop_handoff::launch_jacktrip_desktop;
use crate::{
    auth,
    voice::{
        create_duet_room_from_disk, discover_duet_rooms,
        duet_bridge::{
            current_linux_default_source, duet_bridge_pulse_source, duet_bridge_refresh_seconds,
            duet_worker_base_url, launch_native_bridge_process, native_bridge_disabled_reason,
            native_bridge_supported, restore_linux_default_input_source,
            setup_linux_duet_audio_source, NativeBridgeLaunchConfig,
        },
        end_duet_room_from_disk, get_duet_public_info, search_songs, start_duet_room_from_disk,
        start_duet_segment_from_disk, CreateDuetRoomRequest, DiscoverDuetRoomItem, SongSearchItem,
        VoiceEndpoints,
    },
};

mod actions;
mod helpers;
mod model;
mod status_events;
mod view;
use model::*;

pub(super) use helpers::{
    duet_broadcast_url, duet_watch_url, format_usdc_label, is_hex_address, normalize_usdc_decimal,
    short_address, short_room_id, truncate_text,
};

const DEFAULT_ACCESS_WINDOW_MINUTES: u32 = 24 * 60;

pub struct RoomsView {
    active_tab: RoomsTab,
    active_host_room: Option<ActiveHostRoom>,
    native_bridge_child: Option<Child>,
    segment_modal_open: bool,
    segment_modal_error: Option<String>,
    segment_search_pending: bool,
    segment_start_pending: bool,
    segment_song_query_input_state: Entity<InputState>,
    segment_pay_to_input_state: Entity<InputState>,
    segment_song_results: Vec<SongSearchItem>,
    segment_selected_song: Option<SongSearchItem>,
    create_modal_open: bool,
    create_step: CreateStep,
    create_submitting: bool,
    selected_type: RoomType,
    partner_mode: PartnerMode,
    visibility_mode: VisibilityMode,
    audience_mode: AudienceMode,
    modal_error: Option<String>,
    guest_wallet_input_state: Entity<InputState>,
    live_price_input_state: Entity<InputState>,
    replay_price_input_state: Entity<InputState>,
    rooms: Vec<RoomCard>,
    rooms_loading: bool,
    rooms_refresh_in_flight: bool,
    rooms_error: Option<String>,
    rooms_poll_generation: u64,
    activity: Vec<ActivityItem>,
    broadcast_health_poll_in_flight: bool,
    last_broadcast_health_poll_at: Option<Instant>,
}

impl RoomsView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let guest_wallet_input_state = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Search by heaven name or paste guest wallet...")
        });
        let live_price_input_state = cx.new(|cx| InputState::new(window, cx).placeholder("0.10"));
        let replay_price_input_state = cx.new(|cx| InputState::new(window, cx).placeholder("0.10"));
        let segment_song_query_input_state = cx
            .new(|cx| InputState::new(window, cx).placeholder("Search published songs (Story)..."));
        let segment_pay_to_input_state =
            cx.new(|cx| InputState::new(window, cx).placeholder("0x... receiver address"));

        live_price_input_state.update(cx, |state, cx| state.set_value("0.10", window, cx));
        replay_price_input_state.update(cx, |state, cx| state.set_value("0.10", window, cx));

        let mut this = Self {
            active_tab: RoomsTab::Following,
            active_host_room: None,
            native_bridge_child: None,
            segment_modal_open: false,
            segment_modal_error: None,
            segment_search_pending: false,
            segment_start_pending: false,
            segment_song_query_input_state,
            segment_pay_to_input_state,
            segment_song_results: Vec::new(),
            segment_selected_song: None,
            create_modal_open: false,
            create_step: CreateStep::ChooseType,
            create_submitting: false,
            selected_type: RoomType::DjSet,
            partner_mode: PartnerMode::OpenToAnyone,
            visibility_mode: VisibilityMode::Unlisted,
            audience_mode: AudienceMode::Ticketed,
            modal_error: None,
            guest_wallet_input_state,
            live_price_input_state,
            replay_price_input_state,
            rooms: Vec::new(),
            rooms_loading: true,
            rooms_refresh_in_flight: false,
            rooms_error: None,
            rooms_poll_generation: 0,
            activity: Vec::new(),
            broadcast_health_poll_in_flight: false,
            last_broadcast_health_poll_at: None,
        };
        this.start_rooms_discovery_polling(cx);
        this
    }

    fn filtered_rooms(&self) -> Vec<RoomCard> {
        self.rooms
            .iter()
            .filter(|room| match self.active_tab {
                RoomsTab::Following => room.mine || room.status == RoomStatus::Live,
                RoomsTab::Discover => true,
            })
            .cloned()
            .collect()
    }

    fn open_create_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.create_modal_open = true;
        self.reset_create_form(window, cx);
        cx.notify();
    }

    fn close_create_modal(&mut self, cx: &mut Context<Self>) {
        self.create_modal_open = false;
        self.create_submitting = false;
        self.modal_error = None;
        cx.notify();
    }

    pub(crate) fn dismiss_transient_ui(&mut self, cx: &mut Context<Self>) {
        let mut changed = false;

        if self.create_modal_open || self.create_submitting || self.modal_error.is_some() {
            self.create_modal_open = false;
            self.create_submitting = false;
            self.modal_error = None;
            changed = true;
        }

        if self.segment_modal_open
            || self.segment_modal_error.is_some()
            || self.segment_search_pending
            || self.segment_start_pending
            || !self.segment_song_results.is_empty()
            || self.segment_selected_song.is_some()
        {
            self.segment_modal_open = false;
            self.segment_modal_error = None;
            self.segment_search_pending = false;
            self.segment_start_pending = false;
            self.segment_song_results.clear();
            self.segment_selected_song = None;
            changed = true;
        }

        if changed {
            cx.notify();
        }
    }

    fn reset_create_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.create_step = CreateStep::ChooseType;
        self.selected_type = RoomType::DjSet;
        self.partner_mode = PartnerMode::OpenToAnyone;
        self.visibility_mode = VisibilityMode::Unlisted;
        self.audience_mode = AudienceMode::Ticketed;
        self.modal_error = None;

        self.guest_wallet_input_state
            .update(cx, |state, cx| state.set_value("", window, cx));
        self.live_price_input_state
            .update(cx, |state, cx| state.set_value("0.10", window, cx));
        self.replay_price_input_state
            .update(cx, |state, cx| state.set_value("0.10", window, cx));
    }
}
