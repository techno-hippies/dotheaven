use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{
    input::{Input, InputState},
    scroll::ScrollableElement,
    theme::Theme,
    ActiveTheme, StyledExt,
};

use crate::{
    auth,
    voice::{create_duet_room_from_disk, start_duet_room_from_disk, CreateDuetRoomRequest, VoiceEndpoints},
};
use crate::voice::desktop_handoff::launch_jacktrip_desktop;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RoomsTab {
    All,
    LiveNow,
    Scheduled,
    MyRooms,
}

impl RoomsTab {
    fn label(self) -> &'static str {
        match self {
            RoomsTab::All => "All",
            RoomsTab::LiveNow => "Live Now",
            RoomsTab::Scheduled => "Scheduled",
            RoomsTab::MyRooms => "My Rooms",
        }
    }

    fn all() -> [RoomsTab; 4] {
        [
            RoomsTab::All,
            RoomsTab::LiveNow,
            RoomsTab::Scheduled,
            RoomsTab::MyRooms,
        ]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RoomStatus {
    Created,
    Live,
    Scheduled,
    Ended,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RoomKind {
    Duet,
    OpenJam,
}

#[derive(Clone, Debug)]
struct RoomCard {
    title: String,
    status: RoomStatus,
    kind: RoomKind,
    host_a: String,
    host_b: String,
    meta_line: String,
    price_label: String,
    mine: bool,
}

#[derive(Clone, Debug)]
struct ActivityItem {
    color: Hsla,
    text: String,
}

#[derive(Clone, Debug)]
struct CreateDuetFlowResult {
    room_id: String,
    started_live: bool,
    start_error: Option<String>,
    jacktrip_launch_error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CreateStep {
    ChooseType,
    DuetSetup,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RoomType {
    Duet,
    Class,
    OpenJam,
    BandRoom,
}

impl RoomType {
    fn label(self) -> &'static str {
        match self {
            RoomType::Duet => "Duet",
            RoomType::Class => "Class",
            RoomType::OpenJam => "Open Jam",
            RoomType::BandRoom => "Band Room",
        }
    }

    fn subtitle(self) -> &'static str {
        match self {
            RoomType::Duet => "Two performers, paid",
            RoomType::Class => "1-on-1 lessons",
            RoomType::OpenJam => "Open stage sessions",
            RoomType::BandRoom => "Closed rehearsal",
        }
    }

    fn icon_path(self) -> &'static str {
        match self {
            RoomType::Duet => "icons/user.svg",
            RoomType::Class => "icons/calendar-blank.svg",
            RoomType::OpenJam => "icons/music-note.svg",
            RoomType::BandRoom => "icons/music-notes.svg",
        }
    }

    fn is_available(self) -> bool {
        matches!(self, RoomType::Duet)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PartnerMode {
    InviteSpecific,
    OpenToAnyone,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum VisibilityMode {
    Unlisted,
    Public,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AudienceMode {
    Ticketed,
    Free,
}

const DEFAULT_ACCESS_WINDOW_MINUTES: u32 = 24 * 60;

pub struct RoomsView {
    active_tab: RoomsTab,
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
    activity: Vec<ActivityItem>,
}

impl RoomsView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let guest_wallet_input_state = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Search by heaven name or paste guest wallet...")
        });
        let live_price_input_state = cx.new(|cx| InputState::new(window, cx).placeholder("0.10"));
        let replay_price_input_state = cx.new(|cx| InputState::new(window, cx).placeholder("0.10"));

        live_price_input_state.update(cx, |state, cx| state.set_value("0.10", window, cx));
        replay_price_input_state.update(cx, |state, cx| state.set_value("0.10", window, cx));

        Self {
            active_tab: RoomsTab::All,
            create_modal_open: false,
            create_step: CreateStep::ChooseType,
            create_submitting: false,
            selected_type: RoomType::Duet,
            partner_mode: PartnerMode::OpenToAnyone,
            visibility_mode: VisibilityMode::Unlisted,
            audience_mode: AudienceMode::Ticketed,
            modal_error: None,
            guest_wallet_input_state,
            live_price_input_state,
            replay_price_input_state,
            rooms: vec![
                RoomCard {
                    title: "Jazz Standards Night".to_string(),
                    status: RoomStatus::Live,
                    kind: RoomKind::Duet,
                    host_a: "alice.heaven".to_string(),
                    host_b: "bob.heaven".to_string(),
                    meta_line: "12 watching".to_string(),
                    price_label: "$0.10 USDC".to_string(),
                    mine: false,
                },
                RoomCard {
                    title: "Guitar Duet Improv".to_string(),
                    status: RoomStatus::Live,
                    kind: RoomKind::Duet,
                    host_a: "dana.heaven".to_string(),
                    host_b: "eve.heaven".to_string(),
                    meta_line: "5 watching".to_string(),
                    price_label: "$0.25 USDC".to_string(),
                    mine: false,
                },
                RoomCard {
                    title: "Blues Jam Session".to_string(),
                    status: RoomStatus::Scheduled,
                    kind: RoomKind::OpenJam,
                    host_a: "charlie.heaven".to_string(),
                    host_b: "open slot".to_string(),
                    meta_line: "Tomorrow 8pm".to_string(),
                    price_label: "Free".to_string(),
                    mine: true,
                },
                RoomCard {
                    title: "Classical Piano Duet".to_string(),
                    status: RoomStatus::Ended,
                    kind: RoomKind::Duet,
                    host_a: "frank.heaven".to_string(),
                    host_b: "grace.heaven".to_string(),
                    meta_line: "Replay available".to_string(),
                    price_label: "$0.10 replay".to_string(),
                    mine: false,
                },
            ],
            activity: vec![
                ActivityItem {
                    color: hsla(0.76, 0.83, 0.72, 1.0),
                    text: "alice started Jazz Standards Night".to_string(),
                },
                ActivityItem {
                    color: hsla(0.60, 0.80, 0.72, 1.0),
                    text: "bob joined as guest".to_string(),
                },
                ActivityItem {
                    color: hsla(0.07, 0.90, 0.78, 1.0),
                    text: "3 viewers entered Jazz Standards".to_string(),
                },
                ActivityItem {
                    color: hsla(0.40, 0.78, 0.70, 1.0),
                    text: "charlie scheduled Blues Jam".to_string(),
                },
            ],
        }
    }

    fn filtered_rooms(&self) -> Vec<RoomCard> {
        self.rooms
            .iter()
            .filter(|room| match self.active_tab {
                RoomsTab::All => true,
                RoomsTab::LiveNow => room.status == RoomStatus::Live,
                RoomsTab::Scheduled => {
                    matches!(room.status, RoomStatus::Created | RoomStatus::Scheduled)
                }
                RoomsTab::MyRooms => room.mine,
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

    fn reset_create_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.create_step = CreateStep::ChooseType;
        self.selected_type = RoomType::Duet;
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

    fn submit_create_duet(&mut self, cx: &mut Context<Self>) {
        if self.create_submitting {
            return;
        }

        if self.selected_type != RoomType::Duet {
            self.modal_error = Some("Only Duet is available in V1.".to_string());
            cx.notify();
            return;
        }

        let guest_raw = self.guest_wallet_input_state.read(cx).value().to_string();
        let live_raw = self.live_price_input_state.read(cx).value().to_string();
        let replay_raw = self.replay_price_input_state.read(cx).value().to_string();

        let split_address = match auth::load_from_disk().and_then(|p| p.pkp_address) {
            Some(wallet) => wallet.to_lowercase(),
            None => {
                self.modal_error = Some(
                    "Sign in first so we can derive payout routing for this room.".to_string(),
                );
                cx.notify();
                return;
            }
        };

        if !is_hex_address(&split_address) {
            self.modal_error =
                Some("Signed wallet address is invalid for payout routing.".to_string());
            cx.notify();
            return;
        }

        let guest_wallet = if self.partner_mode == PartnerMode::InviteSpecific {
            let trimmed = guest_raw.trim().to_lowercase();
            if trimmed.is_empty() {
                self.modal_error = Some("Invite mode requires a guest wallet address.".to_string());
                cx.notify();
                return;
            }
            if !is_hex_address(&trimmed) {
                self.modal_error =
                    Some("Guest wallet must be a valid 0x... address for now.".to_string());
                cx.notify();
                return;
            }
            Some(trimmed)
        } else {
            None
        };

        let (live_amount, replay_amount, price_label) = if self.audience_mode == AudienceMode::Free
        {
            ("0".to_string(), "0".to_string(), "Free".to_string())
        } else {
            let live_amount = match normalize_usdc_decimal(&live_raw) {
                Some(v) => v,
                None => {
                    self.modal_error =
                        Some("Live entry price must be a positive USDC amount.".to_string());
                    cx.notify();
                    return;
                }
            };

            let replay_amount = match normalize_usdc_decimal(&replay_raw) {
                Some(v) => v,
                None => {
                    self.modal_error =
                        Some("Replay price must be a positive USDC amount.".to_string());
                    cx.notify();
                    return;
                }
            };

            let label = format_usdc_label(&live_amount);
            (live_amount, replay_amount, label)
        };

        let request = CreateDuetRoomRequest {
            split_address: split_address.clone(),
            guest_wallet: guest_wallet.clone(),
            network: "eip155:84532".to_string(),
            live_amount: live_amount.clone(),
            replay_amount: replay_amount.clone(),
            access_window_minutes: DEFAULT_ACCESS_WINDOW_MINUTES,
            replay_mode: "worker_gated".to_string(),
            recording_mode: "host_local".to_string(),
        };

        let endpoints = VoiceEndpoints::default();
        let host_display = auth::load_from_disk()
            .and_then(|p| p.pkp_address)
            .map(|value| short_address(&value))
            .unwrap_or_else(|| "you".to_string());
        let guest_display = guest_wallet
            .as_ref()
            .map(|wallet| short_address(wallet))
            .unwrap_or_else(|| "open slot".to_string());
        let visibility = self.visibility_mode;

        self.create_submitting = true;
        self.modal_error = None;
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || -> Result<CreateDuetFlowResult, String> {
                let create = create_duet_room_from_disk(&endpoints, &request)?;
                let mut started_live = false;
                let mut start_error = None;
                let mut jacktrip_launch_error = None;

                match start_duet_room_from_disk(&endpoints, &create.room_id) {
                    Ok(_) => {
                        started_live = true;
                        if let Err(err) = launch_jacktrip_desktop() {
                            jacktrip_launch_error = Some(err);
                        }
                    }
                    Err(err) => {
                        start_error = Some(err);
                    }
                }

                Ok(CreateDuetFlowResult {
                    room_id: create.room_id,
                    started_live,
                    start_error,
                    jacktrip_launch_error,
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.create_submitting = false;

                match result {
                    Ok(flow) => {
                        this.create_modal_open = false;
                        this.create_step = CreateStep::ChooseType;
                        this.active_tab = if flow.started_live {
                            RoomsTab::LiveNow
                        } else {
                            RoomsTab::MyRooms
                        };
                        this.modal_error = None;

                        let room_status = if flow.started_live {
                            RoomStatus::Live
                        } else {
                            RoomStatus::Created
                        };
                        let room_meta_line = if flow.started_live {
                            "Live now".to_string()
                        } else {
                            "Ready to start".to_string()
                        };

                        this.rooms.insert(
                            0,
                            RoomCard {
                                title: "My Duet Room".to_string(),
                                status: room_status,
                                kind: RoomKind::Duet,
                                host_a: host_display.clone(),
                                host_b: guest_display.clone(),
                                meta_line: room_meta_line,
                                price_label: price_label.clone(),
                                mine: true,
                            },
                        );

                        this.activity.insert(
                            0,
                            ActivityItem {
                                color: hsla(0.76, 0.83, 0.72, 1.0),
                                text: format!(
                                    "you created {} ({})",
                                    short_room_id(&flow.room_id),
                                    match visibility {
                                        VisibilityMode::Unlisted => "unlisted",
                                        VisibilityMode::Public => "public",
                                    }
                                ),
                            },
                        );

                        if flow.started_live {
                            this.activity.insert(
                                1,
                                ActivityItem {
                                    color: hsla(0.40, 0.78, 0.70, 1.0),
                                    text: format!(
                                        "you started {} live",
                                        short_room_id(&flow.room_id)
                                    ),
                                },
                            );
                        }

                        if let Some(start_err) = flow.start_error {
                            this.activity.insert(
                                1,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!(
                                        "room created, start failed: {}",
                                        truncate_text(&start_err, 96)
                                    ),
                                },
                            );
                        }

                        if let Some(launch_err) = flow.jacktrip_launch_error {
                            this.activity.insert(
                                1,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!(
                                        "live started, JackTrip launch failed: {}",
                                        truncate_text(&launch_err, 96)
                                    ),
                                },
                            );
                        }

                        this.activity.truncate(8);
                    }
                    Err(err) => {
                        this.modal_error = Some(err);
                    }
                }

                cx.notify();
            });
        })
        .detach();
    }

    fn render_main_panel(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let filtered = self.filtered_rooms();
        let mut left_col = Vec::new();
        let mut right_col = Vec::new();

        for (idx, room) in filtered.into_iter().enumerate() {
            if idx % 2 == 0 {
                left_col.push(room);
            } else {
                right_col.push(room);
            }
        }

        div()
            .v_flex()
            .flex_1()
            .h_full()
            .overflow_y_scrollbar()
            .px_6()
            .py_6()
            .gap_5()
            .child(
                div()
                    .h_flex()
                    .items_start()
                    .justify_between()
                    .child(
                        div()
                            .v_flex()
                            .gap_1()
                            .child(
                                div()
                                    .text_3xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(theme.foreground)
                                    .child("Rooms"),
                            )
                            .child(
                                div()
                                    .text_color(theme.muted_foreground)
                                    .child("Live duets, classes, and jam sessions"),
                            ),
                    )
                    .child(
                        div()
                            .id("rooms-create-btn")
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .px_5()
                            .py(px(10.))
                            .rounded_full()
                            .bg(theme.primary)
                            .cursor_pointer()
                            .hover({
                                let hover = theme.primary_hover;
                                move |s| s.bg(hover)
                            })
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.open_create_modal(window, cx);
                            }))
                            .child(
                                gpui::svg()
                                    .path("icons/plus.svg")
                                    .size(px(14.))
                                    .text_color(theme.primary_foreground),
                            )
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(theme.primary_foreground)
                                    .child("Create Room"),
                            ),
                    ),
            )
            .child(
                div()
                    .h_flex()
                    .gap_6()
                    .border_b_1()
                    .border_color(theme.border)
                    .children(RoomsTab::all().into_iter().map(|tab| {
                        let is_active = self.active_tab == tab;
                        div()
                            .id(SharedString::from(format!("rooms-tab-{}", tab.label())))
                            .v_flex()
                            .gap_2()
                            .pb_2()
                            .cursor_pointer()
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.active_tab = tab;
                                cx.notify();
                            }))
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(if is_active {
                                        FontWeight::SEMIBOLD
                                    } else {
                                        FontWeight::NORMAL
                                    })
                                    .text_color(if is_active {
                                        theme.foreground
                                    } else {
                                        theme.muted_foreground
                                    })
                                    .child(tab.label()),
                            )
                            .child(div().h(px(2.)).w(px(40.)).rounded(px(2.)).bg(if is_active {
                                theme.primary
                            } else {
                                hsla(0., 0., 0., 0.)
                            }))
                    })),
            )
            .child(
                div()
                    .h_flex()
                    .items_start()
                    .gap_4()
                    .child(
                        div()
                            .v_flex()
                            .flex_1()
                            .gap_4()
                            .children(left_col.iter().map(|room| render_room_card(room, theme))),
                    )
                    .child(
                        div()
                            .v_flex()
                            .flex_1()
                            .gap_4()
                            .children(right_col.iter().map(|room| render_room_card(room, theme))),
                    ),
            )
    }

    fn render_activity_panel(&self, theme: &Theme) -> impl IntoElement {
        div()
            .v_flex()
            .w(px(280.))
            .h_full()
            .flex_shrink_0()
            .border_l_1()
            .border_color(theme.border)
            .px_4()
            .py_6()
            .gap_4()
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.foreground)
                    .child("Activity"),
            )
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .children(self.activity.iter().map(|item| {
                        div()
                            .h_flex()
                            .items_start()
                            .gap_2()
                            .child(div().mt(px(6.)).size(px(6.)).rounded_full().bg(item.color))
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(theme.muted_foreground)
                                    .child(item.text.clone()),
                            )
                    })),
            )
    }

    fn render_create_modal(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let modal_width = match self.create_step {
            CreateStep::ChooseType => px(620.),
            CreateStep::DuetSetup => px(560.),
        };

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.65))
            .flex()
            .items_start()
            .justify_center()
            .py_6()
            .child(
                div()
                    .w(modal_width)
                    .max_h(px(700.))
                    .mx_5()
                    .rounded(px(14.))
                    .bg(theme.sidebar)
                    .border_1()
                    .border_color(theme.border)
                    .v_flex()
                    .overflow_hidden()
                    .p_5()
                    .child(match self.create_step {
                        CreateStep::ChooseType => self
                            .render_choose_room_type_modal(theme, cx)
                            .into_any_element(),
                        CreateStep::DuetSetup => {
                            self.render_duet_setup_modal(theme, cx).into_any_element()
                        }
                    }),
            )
    }

    fn render_choose_room_type_modal(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let can_continue = self.selected_type.is_available();

        div()
            .v_flex()
            .gap_4()
            .child(
                div()
                    .h_flex()
                    .items_start()
                    .justify_between()
                    .child(
                        div()
                            .v_flex()
                            .gap_1()
                            .child(
                                div()
                                    .text_3xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(theme.foreground)
                                    .child("Create Room"),
                            )
                            .child(
                                div()
                                    .text_color(theme.muted_foreground)
                                    .child("Choose a room type to get started"),
                            ),
                    )
                    .child(
                        div()
                            .id("rooms-modal-close")
                            .size(px(34.))
                            .rounded_full()
                            .bg(theme.muted)
                            .cursor_pointer()
                            .flex()
                            .items_center()
                            .justify_center()
                            .on_click(cx.listener(|this, _, _, cx| this.close_create_modal(cx)))
                            .child(
                                gpui::svg()
                                    .path("icons/x.svg")
                                    .size(px(14.))
                                    .text_color(theme.foreground),
                            ),
                    ),
            )
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .child(
                        div()
                            .h_flex()
                            .gap_3()
                            .child(self.render_room_type_card(RoomType::Duet, theme, cx))
                            .child(self.render_room_type_card(RoomType::Class, theme, cx)),
                    )
                    .child(
                        div()
                            .h_flex()
                            .gap_3()
                            .child(self.render_room_type_card(RoomType::OpenJam, theme, cx))
                            .child(self.render_room_type_card(RoomType::BandRoom, theme, cx)),
                    ),
            )
            .when_some(self.modal_error.clone(), |el, error| {
                el.child(
                    div()
                        .px_3()
                        .py_2()
                        .rounded(px(8.))
                        .bg(hsla(0.0, 0.52, 0.22, 0.35))
                        .text_sm()
                        .text_color(hsla(0.0, 0.90, 0.74, 1.0))
                        .child(error),
                )
            })
            .child({
                let mut next = div()
                    .id("rooms-create-next-btn")
                    .h(px(46.))
                    .rounded_full()
                    .bg(theme.primary)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.primary_foreground)
                            .child("Next"),
                    );

                if can_continue {
                    next = next
                        .cursor_pointer()
                        .hover({
                            let hover = theme.primary_hover;
                            move |s| s.bg(hover)
                        })
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.modal_error = None;
                            this.create_step = CreateStep::DuetSetup;
                            cx.notify();
                        }));
                } else {
                    next = next.opacity(0.5);
                }

                next
            })
    }

    fn render_room_type_card(
        &self,
        room_type: RoomType,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let selected = self.selected_type == room_type;
        let available = room_type.is_available();

        let mut card = div()
            .id(SharedString::from(format!(
                "rooms-type-{}",
                room_type.label().replace(' ', "-").to_lowercase()
            )))
            .v_flex()
            .flex_1()
            .min_w_0()
            .h(px(156.))
            .p_4()
            .rounded(px(10.))
            .border_1()
            .border_color(if selected {
                theme.primary
            } else {
                theme.border
            })
            .bg(if selected {
                hsla(0.73, 0.50, 0.16, 1.0)
            } else {
                theme.background
            })
            .gap_2()
            .child(
                gpui::svg()
                    .path(room_type.icon_path())
                    .size(px(20.))
                    .text_color(if available {
                        if selected {
                            theme.primary
                        } else {
                            theme.foreground
                        }
                    } else {
                        theme.muted_foreground
                    }),
            )
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(if available {
                        theme.foreground
                    } else {
                        theme.muted_foreground
                    })
                    .child(room_type.label()),
            )
            .child(
                div()
                    .text_xs()
                    .w_full()
                    .text_color(theme.muted_foreground)
                    .child(room_type.subtitle()),
            );

        if !available {
            card = card.opacity(0.7).child(
                div()
                    .pt_1()
                    .text_sm()
                    .text_color(hsla(0.08, 0.80, 0.70, 1.0))
                    .child("Coming soon"),
            );
        } else {
            card = card
                .cursor_pointer()
                .hover(|s| s.border_color(hsla(0.73, 0.74, 0.80, 1.0)))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.selected_type = room_type;
                    this.modal_error = None;
                    cx.notify();
                }));
        }

        card
    }

    fn render_duet_setup_modal(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let invite_specific = self.partner_mode == PartnerMode::InviteSpecific;
        let open_to_anyone = self.partner_mode == PartnerMode::OpenToAnyone;

        div()
            .v_flex()
            .gap_4()
            .child(
                div()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_3()
                            .child(
                                div()
                                    .id("rooms-duet-back")
                                    .size(px(30.))
                                    .rounded_full()
                                    .bg(theme.muted)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.create_step = CreateStep::ChooseType;
                                        this.modal_error = None;
                                        cx.notify();
                                    }))
                                    .child(
                                        gpui::svg()
                                            .path("icons/arrow-left.svg")
                                            .size(px(14.))
                                            .text_color(theme.foreground),
                                    ),
                            )
                            .child(
                                div()
                                    .text_3xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(theme.foreground)
                                    .child("Duet Setup"),
                            ),
                    )
                    .child(
                        div()
                            .id("rooms-modal-close")
                            .size(px(34.))
                            .rounded_full()
                            .bg(theme.muted)
                            .cursor_pointer()
                            .flex()
                            .items_center()
                            .justify_center()
                            .on_click(cx.listener(|this, _, _, cx| this.close_create_modal(cx)))
                            .child(
                                gpui::svg()
                                    .path("icons/x.svg")
                                    .size(px(14.))
                                    .text_color(theme.foreground),
                            ),
                    ),
            )
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .child(section_label("Partner", theme))
                    .child(
                        div()
                            .h_flex()
                            .gap_2()
                            .child(
                                selectable_chip("Open", open_to_anyone, theme)
                                    .id("rooms-partner-open")
                                    .cursor_pointer()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.partner_mode = PartnerMode::OpenToAnyone;
                                        cx.notify();
                                    })),
                            )
                            .child(
                                selectable_chip("Invite", invite_specific, theme)
                                    .id("rooms-partner-invite")
                                    .cursor_pointer()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.partner_mode = PartnerMode::InviteSpecific;
                                        cx.notify();
                                    })),
                            ),
                    )
                    .when(invite_specific, |el| {
                        el.child(
                            div()
                                .v_flex()
                                .gap_1()
                                .child(
                                    div()
                                        .text_sm()
                                        .text_color(theme.muted_foreground)
                                        .child("Invite guest"),
                                )
                                .child(render_modal_input(
                                    &self.guest_wallet_input_state,
                                    theme,
                                    None,
                                )),
                        )
                    }),
            )
            .child(div().border_t_1().border_color(theme.border))
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .child(section_label("Visibility & Audience", theme))
                    .child(
                        div()
                            .h_flex()
                            .gap_3()
                            .child(
                                div()
                                    .v_flex()
                                    .flex_1()
                                    .gap_2()
                                    .child(
                                        div()
                                            .text_sm()
                                            .text_color(theme.muted_foreground)
                                            .child("Visibility"),
                                    )
                                    .child(
                                        div()
                                            .h_flex()
                                            .gap_2()
                                            .child(
                                                selectable_chip(
                                                    "Unlisted",
                                                    self.visibility_mode
                                                        == VisibilityMode::Unlisted,
                                                    theme,
                                                )
                                                .id("rooms-visibility-unlisted")
                                                .cursor_pointer()
                                                .on_click(cx.listener(|this, _, _, cx| {
                                                    this.visibility_mode = VisibilityMode::Unlisted;
                                                    cx.notify();
                                                })),
                                            )
                                            .child(
                                                selectable_chip(
                                                    "Public",
                                                    self.visibility_mode == VisibilityMode::Public,
                                                    theme,
                                                )
                                                .id("rooms-visibility-public")
                                                .cursor_pointer()
                                                .on_click(cx.listener(|this, _, _, cx| {
                                                    this.visibility_mode = VisibilityMode::Public;
                                                    cx.notify();
                                                })),
                                            ),
                                    ),
                            )
                            .child(
                                div()
                                    .v_flex()
                                    .flex_1()
                                    .gap_2()
                                    .child(
                                        div()
                                            .text_sm()
                                            .text_color(theme.muted_foreground)
                                            .child("Audience"),
                                    )
                                    .child(
                                        div()
                                            .h_flex()
                                            .gap_2()
                                            .child(
                                                selectable_chip(
                                                    "Ticketed",
                                                    self.audience_mode == AudienceMode::Ticketed,
                                                    theme,
                                                )
                                                .id("rooms-audience-ticketed")
                                                .cursor_pointer()
                                                .on_click(cx.listener(|this, _, _, cx| {
                                                    this.audience_mode = AudienceMode::Ticketed;
                                                    this.modal_error = None;
                                                    cx.notify();
                                                })),
                                            )
                                            .child(
                                                selectable_chip(
                                                    "Free",
                                                    self.audience_mode == AudienceMode::Free,
                                                    theme,
                                                )
                                                .id("rooms-audience-free")
                                                .cursor_pointer()
                                                .on_click(cx.listener(|this, _, _, cx| {
                                                    this.audience_mode = AudienceMode::Free;
                                                    cx.notify();
                                                })),
                                            ),
                                    ),
                            ),
                    ),
            )
            .when(self.audience_mode == AudienceMode::Ticketed, |el| {
                el.child(div().border_t_1().border_color(theme.border))
                    .child(
                        div()
                            .v_flex()
                            .gap_3()
                            .child(section_label("Pricing", theme))
                            .child(
                                div()
                                    .h_flex()
                                    .gap_3()
                                    .child(
                                        div()
                                            .v_flex()
                                            .flex_1()
                                            .gap_2()
                                            .child(
                                                div()
                                                    .text_sm()
                                                    .text_color(theme.muted_foreground)
                                                    .child("Live entry"),
                                            )
                                            .child(render_modal_input(
                                                &self.live_price_input_state,
                                                theme,
                                                Some("USDC"),
                                            )),
                                    )
                                    .child(
                                        div()
                                            .v_flex()
                                            .flex_1()
                                            .gap_2()
                                            .child(
                                                div()
                                                    .text_sm()
                                                    .text_color(theme.muted_foreground)
                                                    .child("Replay"),
                                            )
                                            .child(render_modal_input(
                                                &self.replay_price_input_state,
                                                theme,
                                                Some("USDC"),
                                            )),
                                    ),
                            ),
                    )
            })
            .when_some(self.modal_error.clone(), |el, error| {
                el.child(
                    div()
                        .px_3()
                        .py_2()
                        .rounded(px(8.))
                        .bg(hsla(0.0, 0.52, 0.22, 0.35))
                        .text_sm()
                        .text_color(hsla(0.0, 0.90, 0.74, 1.0))
                        .child(error),
                )
            })
            .child({
                let mut create_btn = div()
                    .id("rooms-create-submit")
                    .mt_1()
                    .h(px(46.))
                    .rounded_full()
                    .bg(theme.primary)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.primary_foreground)
                            .child(if self.create_submitting {
                                "Creating..."
                            } else {
                                "Create Duet Room"
                            }),
                    );

                if !self.create_submitting {
                    create_btn = create_btn
                        .cursor_pointer()
                        .hover({
                            let hover = theme.primary_hover;
                            move |s| s.bg(hover)
                        })
                        .on_click(cx.listener(|this, _, _, cx| this.submit_create_duet(cx)));
                } else {
                    create_btn = create_btn.opacity(0.8);
                }

                create_btn
            })
    }
}

impl Render for RoomsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme().clone();

        div()
            .id("rooms-root")
            .relative()
            .h_flex()
            .size_full()
            .bg(theme.background)
            .child(self.render_main_panel(&theme, cx))
            .child(self.render_activity_panel(&theme))
            .when(self.create_modal_open, |el| {
                el.child(self.render_create_modal(&theme, cx))
            })
    }
}

fn section_label(text: &'static str, theme: &Theme) -> impl IntoElement {
    div()
        .text_lg()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(theme.foreground)
        .child(text)
}

fn selectable_chip(label: &'static str, active: bool, theme: &Theme) -> Div {
    div()
        .px_4()
        .py(px(8.))
        .rounded_full()
        .border_1()
        .border_color(if active { theme.primary } else { theme.border })
        .bg(if active {
            theme.secondary
        } else {
            theme.background
        })
        .text_sm()
        .font_weight(if active {
            FontWeight::SEMIBOLD
        } else {
            FontWeight::NORMAL
        })
        .text_color(if active {
            theme.foreground
        } else {
            theme.muted_foreground
        })
        .child(label)
}

fn render_modal_input(
    input_state: &Entity<InputState>,
    theme: &Theme,
    suffix: Option<&'static str>,
) -> impl IntoElement {
    div()
        .h(px(42.))
        .w_full()
        .rounded_full()
        .border_1()
        .border_color(theme.border)
        .bg(theme.background)
        .px_4()
        .h_flex()
        .items_center()
        .gap_2()
        .child(
            div()
                .flex_1()
                .child(Input::new(input_state).appearance(false).cleanable(false)),
        )
        .when_some(suffix, |el, value| {
            el.child(
                div()
                    .text_sm()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.muted_foreground)
                    .child(value),
            )
        })
}

fn render_room_card(room: &RoomCard, theme: &Theme) -> impl IntoElement {
    let (badge_text, badge_bg, badge_fg) = match room.status {
        RoomStatus::Created => (
            "Created",
            hsla(0.73, 0.50, 0.24, 1.0),
            hsla(0.73, 0.90, 0.80, 1.0),
        ),
        RoomStatus::Live => (
            "Live",
            hsla(0.76, 0.80, 0.30, 1.0),
            hsla(0.76, 0.95, 0.80, 1.0),
        ),
        RoomStatus::Scheduled => (
            "Scheduled",
            hsla(0.40, 0.60, 0.24, 1.0),
            hsla(0.40, 0.80, 0.78, 1.0),
        ),
        RoomStatus::Ended => (
            "Ended",
            hsla(0.11, 0.50, 0.24, 1.0),
            hsla(0.13, 0.90, 0.70, 1.0),
        ),
    };

    let kind_text = match room.kind {
        RoomKind::Duet => "Duet",
        RoomKind::OpenJam => "Open Jam",
    };

    let avatar = |letter: char| {
        div()
            .size(px(22.))
            .rounded_full()
            .bg(theme.primary)
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_xs()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.primary_foreground)
                    .child(letter.to_string()),
            )
    };

    div()
        .v_flex()
        .gap_4()
        .p_4()
        .rounded(px(10.))
        .border_1()
        .border_color(theme.border)
        .bg(theme.sidebar)
        .child(
            div()
                .h_flex()
                .justify_between()
                .items_center()
                .child(
                    div()
                        .h_flex()
                        .items_center()
                        .gap_1()
                        .px_2()
                        .py(px(4.))
                        .rounded_full()
                        .bg(badge_bg)
                        .child(div().size(px(6.)).rounded_full().bg(badge_fg))
                        .child(
                            div()
                                .text_xs()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(badge_fg)
                                .child(badge_text),
                        ),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(theme.muted_foreground)
                        .child(kind_text),
                ),
        )
        .child(
            div()
                .text_xl()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground)
                .child(room.title.clone()),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(avatar('A'))
                .child(avatar('B'))
                .child(
                    div()
                        .text_color(theme.muted_foreground)
                        .child(format!("{}  & {}", room.host_a, room.host_b)),
                ),
        )
        .child(
            div()
                .h_flex()
                .justify_between()
                .items_center()
                .child(
                    div()
                        .text_sm()
                        .text_color(theme.muted_foreground)
                        .child(room.meta_line.clone()),
                )
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.primary)
                        .child(room.price_label.clone()),
                ),
        )
}

fn is_hex_address(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 42
        && trimmed.starts_with("0x")
        && trimmed.chars().skip(2).all(|ch| ch.is_ascii_hexdigit())
}

fn normalize_usdc_decimal(value: &str) -> Option<String> {
    let cleaned = value
        .trim()
        .to_ascii_lowercase()
        .replace("usdc", "")
        .replace('$', "")
        .replace(',', "")
        .trim()
        .to_string();

    if cleaned.is_empty() || cleaned == "free" {
        return None;
    }

    let mut dot_count = 0usize;
    for ch in cleaned.chars() {
        if ch == '.' {
            dot_count += 1;
            if dot_count > 1 {
                return None;
            }
            continue;
        }
        if !ch.is_ascii_digit() {
            return None;
        }
    }

    if let Some((_, frac)) = cleaned.split_once('.') {
        if frac.len() > 6 {
            return None;
        }
    }

    let parsed = cleaned.parse::<f64>().ok()?;
    if parsed <= 0.0 {
        return None;
    }

    let mut out = cleaned;
    if out.contains('.') {
        while out.ends_with('0') {
            out.pop();
        }
        if out.ends_with('.') {
            out.pop();
        }
    }

    if out.is_empty() || out == "0" {
        return None;
    }

    Some(out)
}

fn short_address(address: &str) -> String {
    if address.len() <= 12 {
        return address.to_string();
    }
    format!("{}...{}", &address[..6], &address[address.len() - 4..])
}

fn short_room_id(room_id: &str) -> String {
    room_id.split('-').next().unwrap_or(room_id).to_string()
}

fn format_usdc_label(amount: &str) -> String {
    format!("${amount} USDC")
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        let mut out = String::new();
        for ch in value.chars().take(max_chars) {
            out.push(ch);
        }
        out.push_str("...");
        out
    }
}
