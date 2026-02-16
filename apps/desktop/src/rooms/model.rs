use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RoomsTab {
    All,
    LiveNow,
    Scheduled,
    MyRooms,
}

impl RoomsTab {
    pub(super) fn label(self) -> &'static str {
        match self {
            RoomsTab::All => "All",
            RoomsTab::LiveNow => "Live Now",
            RoomsTab::Scheduled => "Scheduled",
            RoomsTab::MyRooms => "My Rooms",
        }
    }

    pub(super) fn all() -> [RoomsTab; 4] {
        [
            RoomsTab::All,
            RoomsTab::LiveNow,
            RoomsTab::Scheduled,
            RoomsTab::MyRooms,
        ]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RoomStatus {
    Created,
    Live,
    Scheduled,
    Ended,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RoomKind {
    DjSet,
    Duet,
    OpenJam,
}

#[derive(Clone, Debug)]
pub(super) struct RoomCard {
    pub(super) title: String,
    pub(super) status: RoomStatus,
    pub(super) kind: RoomKind,
    pub(super) host_a: String,
    pub(super) host_b: String,
    pub(super) meta_line: String,
    pub(super) price_label: String,
    pub(super) mine: bool,
}

#[derive(Clone, Debug)]
pub(super) struct ActivityItem {
    pub(super) color: Hsla,
    pub(super) text: String,
}

#[derive(Clone, Debug)]
pub(super) struct CreateDuetFlowResult {
    pub(super) room_id: String,
    pub(super) agora_channel: String,
}

#[derive(Clone, Debug)]
pub(super) struct ActiveHostRoom {
    pub(super) room_id: String,
    pub(super) title: String,
    pub(super) status: RoomStatus,
    pub(super) kind: RoomKind,
    pub(super) host_a: String,
    pub(super) host_b: String,
    pub(super) price_label: String,
    pub(super) agora_channel: Option<String>,
    pub(super) bridge_ticket: Option<String>,
    pub(super) start_error: Option<String>,
    pub(super) jacktrip_error: Option<String>,
    pub(super) info_message: Option<String>,
    pub(super) start_pending: bool,
    pub(super) end_pending: bool,
    pub(super) launch_pending: bool,
    pub(super) open_viewer_pending: bool,
    pub(super) open_broadcast_pending: bool,
    pub(super) audio_source_setup_pending: bool,
    pub(super) browser_audio_source_name: Option<String>,
    pub(super) browser_audio_source_label: Option<String>,
    pub(super) browser_bridge_opened: bool,
    pub(super) broadcaster_online: bool,
    pub(super) broadcast_state: Option<String>,
    pub(super) broadcast_mode: Option<String>,
    pub(super) broadcast_heartbeat_at: Option<u64>,
    pub(super) audio_source_error: Option<String>,
    pub(super) restore_system_mic_pending: bool,
    pub(super) default_input_source: Option<String>,
    pub(super) default_input_is_duet_virtual: bool,
    pub(super) restore_input_source_hint: Option<String>,
    pub(super) restore_input_source_label: Option<String>,
    pub(super) native_bridge_running: bool,
    pub(super) native_bridge_pending: bool,
    pub(super) native_bridge_error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HostRoomStage {
    Setup,
    ReadyAudioRoute,
    ReadyGoLive,
    OnAir,
    Ended,
}

impl ActiveHostRoom {
    pub(super) fn has_audio_route_ready(&self) -> bool {
        match self.kind {
            // Solo rooms can go live immediately: host can share app/system audio directly
            // from the broadcast page (no JackTrip routing required).
            RoomKind::DjSet => true,
            _ => {
                self.browser_audio_source_name.is_some()
                    && !self.audio_source_setup_pending
                    && self.audio_source_error.is_none()
            }
        }
    }

    pub(super) fn stage(&self) -> HostRoomStage {
        match self.status {
            RoomStatus::Ended => HostRoomStage::Ended,
            RoomStatus::Live => {
                if self.broadcaster_online {
                    HostRoomStage::OnAir
                } else if self.has_audio_route_ready() {
                    HostRoomStage::ReadyGoLive
                } else {
                    HostRoomStage::ReadyAudioRoute
                }
            }
            RoomStatus::Created | RoomStatus::Scheduled => HostRoomStage::Setup,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CreateStep {
    ChooseType,
    DuetSetup,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RoomType {
    DjSet,
    Duet,
    Class,
    OpenJam,
}

impl RoomType {
    pub(super) fn label(self) -> &'static str {
        match self {
            RoomType::DjSet => "Solo Room",
            RoomType::Duet => "Duet",
            RoomType::Class => "Class",
            RoomType::OpenJam => "Open Jam",
        }
    }

    pub(super) fn subtitle(self) -> &'static str {
        match self {
            RoomType::DjSet => "Solo performance (free or paid)",
            RoomType::Duet => "Two performers (free or paid)",
            RoomType::Class => "1-on-1 lessons",
            RoomType::OpenJam => "Open stage sessions",
        }
    }

    pub(super) fn icon_path(self) -> &'static str {
        match self {
            RoomType::DjSet => "icons/vinyl-record.svg",
            RoomType::Duet => "icons/user.svg",
            RoomType::Class => "icons/calendar-blank.svg",
            RoomType::OpenJam => "icons/music-note.svg",
        }
    }

    pub(super) fn is_available(self) -> bool {
        matches!(self, RoomType::DjSet | RoomType::Duet)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PartnerMode {
    InviteSpecific,
    OpenToAnyone,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum VisibilityMode {
    Unlisted,
    Public,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AudienceMode {
    Ticketed,
    Free,
}
