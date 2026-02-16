use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::*;

const ROOMS_DISCOVERY_POLL_INTERVAL: Duration = Duration::from_secs(20);

impl RoomsView {
    pub(crate) fn start_rooms_discovery_polling(&mut self, cx: &mut Context<Self>) {
        self.rooms_poll_generation = self.rooms_poll_generation.wrapping_add(1);
        let generation = self.rooms_poll_generation;
        self.refresh_discoverable_rooms(cx);

        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                smol::Timer::after(ROOMS_DISCOVERY_POLL_INTERVAL).await;
                let keep_running = this
                    .update(cx, |this, cx| {
                        if this.rooms_poll_generation != generation {
                            return false;
                        }
                        this.refresh_discoverable_rooms(cx);
                        true
                    })
                    .unwrap_or(false);
                if !keep_running {
                    break;
                }
            },
        )
        .detach();
    }

    pub(crate) fn refresh_discoverable_rooms(&mut self, cx: &mut Context<Self>) {
        if self.rooms_refresh_in_flight {
            return;
        }
        self.rooms_refresh_in_flight = true;
        if self.rooms.is_empty() {
            self.rooms_loading = true;
        }
        self.rooms_error = None;
        cx.notify();

        let endpoints = VoiceEndpoints::default();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || discover_duet_rooms(&endpoints)).await;

            let _ = this.update(cx, |this, cx| {
                this.rooms_refresh_in_flight = false;
                match result {
                    Ok(discovery) => {
                        let wallet = auth::load_from_disk()
                            .and_then(|profile| profile.pkp_address)
                            .map(|value| value.to_ascii_lowercase());
                        let discovered_rooms =
                            map_discovery_rooms(discovery.rooms, wallet.as_deref());
                        this.rooms = merge_discovered_rooms(&this.rooms, discovered_rooms);
                        this.rooms_loading = false;
                        this.rooms_error = None;
                    }
                    Err(err) => {
                        this.rooms_loading = false;
                        this.rooms_error = Some(err.clone());
                        if this.rooms.is_empty() {
                            this.publish_status_error(
                                "rooms.discover",
                                format!("Failed to load rooms: {}", truncate_text(&err, 140)),
                                cx,
                            );
                        } else {
                            this.publish_status_info(
                                "rooms.discover",
                                format!("Room refresh failed: {}", truncate_text(&err, 120)),
                                cx,
                            );
                        }
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::rooms) fn open_room_card(&mut self, room: RoomCard, cx: &mut Context<Self>) {
        if room.mine {
            if let Err(err) = self.stop_native_bridge_process() {
                log::warn!("[Rooms] failed stopping native bridge before opening host room: {err}");
            }

            let should_refresh_live_ticket = room.status == RoomStatus::Live;
            let host_status = if should_refresh_live_ticket {
                RoomStatus::Created
            } else {
                room.status
            };
            let info_message = if should_refresh_live_ticket {
                "Refreshing host credentials for live room...".to_string()
            } else if room.status == RoomStatus::Ended {
                "Room ended.".to_string()
            } else {
                "Room ready to start.".to_string()
            };

            self.active_host_room = Some(ActiveHostRoom {
                room_id: room.room_id.clone(),
                title: room.title.clone(),
                status: host_status,
                kind: room.kind,
                host_a: room.host_a.clone(),
                host_b: room.host_b.clone(),
                price_label: room.price_label.clone(),
                agora_channel: None,
                bridge_ticket: None,
                start_error: None,
                jacktrip_error: None,
                info_message: Some(info_message),
                start_pending: false,
                end_pending: false,
                launch_pending: false,
                open_viewer_pending: false,
                open_broadcast_pending: false,
                audio_source_setup_pending: false,
                browser_audio_source_name: None,
                browser_audio_source_label: None,
                browser_bridge_opened: false,
                broadcaster_online: false,
                broadcast_state: None,
                broadcast_mode: None,
                broadcast_heartbeat_at: None,
                audio_source_error: None,
                restore_system_mic_pending: false,
                default_input_source: None,
                default_input_is_duet_virtual: false,
                restore_input_source_hint: None,
                restore_input_source_label: None,
                native_bridge_running: false,
                native_bridge_pending: false,
                native_bridge_error: None,
            });
            cx.notify();
            if should_refresh_live_ticket {
                self.start_active_host_room(cx);
            }
            return;
        }

        if room.status != RoomStatus::Live {
            self.publish_status_info("rooms.open", "Room is not live yet.", cx);
            return;
        }

        let room_id = room.room_id.clone();
        let room_id_for_update = room_id.clone();
        let watch_url = duet_watch_url(&room_id);
        self.publish_status_progress(
            "rooms.open",
            format!("Opening room {}...", short_room_id(&room_id)),
            cx,
        );
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || open::that(&watch_url)).await;
            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(_) => this.publish_status_success(
                        "rooms.open",
                        format!("Opened room {}.", short_room_id(&room_id_for_update)),
                        cx,
                    ),
                    Err(err) => this.publish_status_error(
                        "rooms.open",
                        format!(
                            "Failed to open room {}: {}",
                            short_room_id(&room_id_for_update),
                            truncate_text(&err.to_string(), 120)
                        ),
                        cx,
                    ),
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::rooms) fn upsert_room_card(&mut self, room: RoomCard) {
        if let Some(existing) = self
            .rooms
            .iter_mut()
            .find(|card| card.room_id == room.room_id)
        {
            *existing = room;
        } else {
            self.rooms.insert(0, room);
        }
    }

    pub(in crate::rooms) fn update_room_card_status(&mut self, room_id: &str, status: RoomStatus) {
        if let Some(room) = self.rooms.iter_mut().find(|card| card.room_id == room_id) {
            room.status = status;
            room.meta_line = match status {
                RoomStatus::Live => "Started just now".to_string(),
                RoomStatus::Created => "Ready to start".to_string(),
                RoomStatus::Scheduled => "Scheduled".to_string(),
                RoomStatus::Ended => "Ended".to_string(),
            };
        }
    }
}

fn merge_discovered_rooms(existing: &[RoomCard], discovered_rooms: Vec<RoomCard>) -> Vec<RoomCard> {
    let discovered_ids: HashSet<&str> = discovered_rooms
        .iter()
        .map(|room| room.room_id.as_str())
        .collect();
    let mut merged: Vec<RoomCard> = existing
        .iter()
        .filter(|room| room.mine && !discovered_ids.contains(room.room_id.as_str()))
        .cloned()
        .collect();
    merged.extend(discovered_rooms);
    dedupe_room_cards(merged)
}

fn dedupe_room_cards(rooms: Vec<RoomCard>) -> Vec<RoomCard> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::with_capacity(rooms.len());
    for room in rooms {
        if seen.insert(room.room_id.clone()) {
            out.push(room);
        }
    }
    out
}

fn map_discovery_rooms(
    items: Vec<DiscoverDuetRoomItem>,
    current_wallet: Option<&str>,
) -> Vec<RoomCard> {
    items
        .into_iter()
        .map(|item| {
            let status = parse_room_status(item.status.as_deref());
            let kind = parse_room_kind(item.room_kind.as_deref(), item.guest_wallet.as_deref());
            let host_a = display_identity(&item.host_wallet);
            let host_b = match kind {
                RoomKind::DjSet => String::new(),
                RoomKind::Duet => item
                    .guest_wallet
                    .as_deref()
                    .map(display_identity)
                    .unwrap_or_else(|| "open slot".to_string()),
                RoomKind::OpenJam => "open slot".to_string(),
            };
            let title = item
                .title
                .filter(|v| !v.trim().is_empty())
                .unwrap_or_else(|| {
                    let prefix = match kind {
                        RoomKind::DjSet => "Solo Room",
                        RoomKind::Duet => "Duet Room",
                        RoomKind::OpenJam => "Open Jam",
                    };
                    format!("{prefix} {}", short_room_id(&item.room_id))
                });
            let mine = current_wallet
                .map(|wallet| {
                    wallet.eq_ignore_ascii_case(&item.host_wallet)
                        || item
                            .guest_wallet
                            .as_deref()
                            .map(|guest| wallet.eq_ignore_ascii_case(guest))
                            .unwrap_or(false)
                })
                .unwrap_or(false);
            let meta_line = format_meta_line(status, item.started_at.or(item.live_started_at));
            let price_label =
                format_price_label(item.audience_mode.as_deref(), item.live_amount.as_deref());

            RoomCard {
                room_id: item.room_id,
                title,
                status,
                kind,
                host_a,
                host_b,
                meta_line,
                price_label,
                listener_count: item
                    .listener_count
                    .unwrap_or(if status == RoomStatus::Live { 1 } else { 0 }),
                mine,
            }
        })
        .collect()
}

fn parse_room_status(status: Option<&str>) -> RoomStatus {
    match status.unwrap_or_default().to_ascii_lowercase().as_str() {
        "live" => RoomStatus::Live,
        "scheduled" => RoomStatus::Scheduled,
        "ended" => RoomStatus::Ended,
        _ => RoomStatus::Created,
    }
}

fn parse_room_kind(kind: Option<&str>, guest_wallet: Option<&str>) -> RoomKind {
    match kind.unwrap_or_default().to_ascii_lowercase().as_str() {
        "open_jam" => RoomKind::OpenJam,
        "duet" => RoomKind::Duet,
        "dj_set" | "solo" | "solo_room" => RoomKind::DjSet,
        _ => {
            if guest_wallet.unwrap_or_default().trim().is_empty() {
                RoomKind::DjSet
            } else {
                RoomKind::Duet
            }
        }
    }
}

fn display_identity(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "unknown".to_string();
    }
    if is_hex_address(trimmed) {
        return short_address(trimmed);
    }
    trimmed.to_string()
}

fn format_meta_line(status: RoomStatus, started_at: Option<u64>) -> String {
    match status {
        RoomStatus::Live => match started_at {
            Some(ts) => format!("Started {}", relative_ago(ts)),
            None => "Started just now".to_string(),
        },
        RoomStatus::Created => match started_at {
            Some(ts) => format!("Created {}", relative_ago(ts)),
            None => "Ready to start".to_string(),
        },
        RoomStatus::Scheduled => "Scheduled".to_string(),
        RoomStatus::Ended => "Ended".to_string(),
    }
}

fn relative_ago(epoch_seconds: u64) -> String {
    let now = now_epoch_seconds();
    let delta = now.saturating_sub(epoch_seconds);
    if delta < 60 {
        "just now".to_string()
    } else if delta < 60 * 60 {
        format!("{} min ago", delta / 60)
    } else if delta < 24 * 60 * 60 {
        format!("{} hr ago", delta / (60 * 60))
    } else {
        format!("{} d ago", delta / (24 * 60 * 60))
    }
}

fn format_price_label(audience_mode: Option<&str>, live_amount: Option<&str>) -> String {
    if matches!(audience_mode, Some(mode) if mode.eq_ignore_ascii_case("free")) {
        return "Free".to_string();
    }
    let amount = live_amount.unwrap_or("0");
    if amount.trim() == "0" {
        return "Free".to_string();
    }
    let Some(decimal) = format_usdc_base_units(amount) else {
        return "Ticketed".to_string();
    };
    format!("${decimal}")
}

fn format_usdc_base_units(amount: &str) -> Option<String> {
    let digits = amount.trim();
    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    let normalized = digits.trim_start_matches('0');
    let normalized = if normalized.is_empty() {
        "0"
    } else {
        normalized
    };
    if normalized == "0" {
        return Some("0".to_string());
    }

    if normalized.len() <= 6 {
        let frac = format!("{normalized:0>6}");
        let frac = frac.trim_end_matches('0');
        return Some(format!("0.{frac}"));
    }

    let split_idx = normalized.len() - 6;
    let whole = &normalized[..split_idx];
    let frac = normalized[split_idx..].trim_end_matches('0');
    if frac.is_empty() {
        Some(whole.to_string())
    } else {
        Some(format!("{whole}.{frac}"))
    }
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
