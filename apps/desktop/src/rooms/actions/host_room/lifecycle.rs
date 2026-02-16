use super::*;

impl RoomsView {
    pub(crate) fn close_host_room_view(&mut self, cx: &mut Context<Self>) {
        if let Err(err) = self.stop_native_bridge_process() {
            log::warn!("[Rooms] failed stopping native bridge on close: {err}");
        }
        self.active_host_room = None;
        self.active_tab = RoomsTab::Following;
        cx.notify();
    }

    pub(crate) fn start_active_host_room(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.start_pending || host.end_pending || host.status == RoomStatus::Ended {
            return;
        }

        let room_id = host.room_id.clone();
        let room_id_for_update = room_id.clone();
        let should_launch_jacktrip = matches!(host.kind, RoomKind::Duet);
        let endpoints = VoiceEndpoints::default();
        if let Some(active) = self.active_host_room.as_mut() {
            active.start_pending = true;
            active.start_error = None;
            active.info_message = Some("Starting room...".to_string());
        }
        self.publish_status_progress(
            "rooms.host.start",
            format!("Starting room {}...", short_room_id(&room_id)),
            cx,
        );
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let start_result = start_duet_room_from_disk(&endpoints, &room_id);
                let launch_result = if start_result.is_ok() && should_launch_jacktrip {
                    launch_jacktrip_desktop().err()
                } else {
                    None
                };
                (start_result, launch_result)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let mut start_success_status: Option<String> = None;
                let mut start_error_status: Option<String> = None;
                let mut jacktrip_error_status: Option<String> = None;
                let mut started_room_id: Option<String> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id_for_update {
                        return;
                    }

                    active.start_pending = false;
                    match result.0 {
                        Ok(start) => {
                            active.status = RoomStatus::Live;
                            active.start_error = None;
                            active.agora_channel =
                                start.agora_channel.or(active.agora_channel.clone());
                            active.bridge_ticket =
                                start.bridge_ticket.or(active.bridge_ticket.clone());
                            active.browser_bridge_opened = false;
                            active.broadcaster_online = false;
                            active.broadcast_state = Some("idle".to_string());
                            active.broadcast_mode = None;
                            active.broadcast_heartbeat_at = None;
                            active.audio_source_error = None;
                            active.browser_audio_source_name = None;
                            active.browser_audio_source_label = None;
                            active.restore_system_mic_pending = false;
                            active.default_input_source = None;
                            active.default_input_is_duet_virtual = false;
                            active.restore_input_source_hint = None;
                            active.restore_input_source_label = None;
                            active.info_message = Some(match active.kind {
                                RoomKind::DjSet => {
                                    "Room started. Open broadcast page and share app/system audio (or mic)."
                                        .to_string()
                                }
                                _ => {
                                    "Room started. Connect audio source, then go live.".to_string()
                                }
                            });
                            active.native_bridge_running = false;
                            active.native_bridge_pending = false;
                            active.native_bridge_error = None;
                            let room_id = active.room_id.clone();
                            started_room_id = Some(room_id.clone());
                            start_success_status =
                                Some(format!("Room {} started.", short_room_id(&room_id)));
                        }
                        Err(err) => {
                            active.start_error = Some(err.clone());
                            active.info_message = Some("Room start failed.".to_string());
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!("room start failed: {}", truncate_text(&err, 96)),
                                },
                            );
                            start_error_status = Some(format!(
                                "Room {} failed to start: {}",
                                short_room_id(&active.room_id),
                                truncate_text(&err, 120)
                            ));
                        }
                    }

                    active.jacktrip_error = result.1.clone();
                    if let Some(launch_err) = result.1 {
                        this.activity.insert(
                            0,
                            ActivityItem {
                                color: hsla(0.08, 0.80, 0.70, 1.0),
                                text: format!(
                                    "live started, JackTrip launch failed: {}",
                                    truncate_text(&launch_err, 96)
                                ),
                            },
                        );
                        jacktrip_error_status = Some(format!(
                            "JackTrip launch failed: {}",
                            truncate_text(&launch_err, 120)
                        ));
                    }

                    this.activity.truncate(8);
                }
                if let Some(room_id) = started_room_id {
                    this.active_tab = RoomsTab::Following;
                    this.update_room_card_status(&room_id, RoomStatus::Live);
                    this.activity.insert(
                        0,
                        ActivityItem {
                            color: hsla(0.40, 0.78, 0.70, 1.0),
                            text: format!("you started {} live", short_room_id(&room_id)),
                        },
                    );
                    this.activity.truncate(8);
                }
                let should_refresh_discovery = start_success_status.is_some();
                if let Some(message) = start_success_status {
                    this.publish_status_success("rooms.host.start", message, cx);
                }
                if let Some(message) = start_error_status {
                    this.publish_status_error("rooms.host.start", message, cx);
                }
                if let Some(message) = jacktrip_error_status {
                    this.publish_status_error("rooms.host.jacktrip", message, cx);
                }
                if should_refresh_discovery {
                    this.refresh_discoverable_rooms(cx);
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn end_active_host_room(&mut self, cx: &mut Context<Self>) {
        let room_id = match self.active_host_room.as_ref() {
            Some(host) if !host.end_pending && host.status != RoomStatus::Ended => {
                host.room_id.clone()
            }
            _ => return,
        };

        if let Err(err) = self.stop_native_bridge_process() {
            log::warn!("[Rooms] failed stopping native bridge before end: {err}");
        }
        if let Some(active) = self.active_host_room.as_mut() {
            active.native_bridge_running = false;
            active.native_bridge_pending = false;
        }

        let room_id_for_update = room_id.clone();
        let endpoints = VoiceEndpoints::default();
        if let Some(active) = self.active_host_room.as_mut() {
            active.end_pending = true;
            active.info_message = Some("Ending room...".to_string());
        }
        self.publish_status_progress(
            "rooms.host.end",
            format!("Ending room {}...", short_room_id(&room_id)),
            cx,
        );
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || end_duet_room_from_disk(&endpoints, &room_id)).await;

            let _ = this.update(cx, |this, cx| {
                let mut end_success_status: Option<String> = None;
                let mut end_error_status: Option<String> = None;
                let mut ended_room_id: Option<String> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id_for_update {
                        return;
                    }

                    active.end_pending = false;
                    match result {
                        Ok(_) => {
                            active.status = RoomStatus::Ended;
                            active.browser_bridge_opened = false;
                            active.broadcaster_online = false;
                            active.broadcast_state = Some("stopped".to_string());
                            active.restore_system_mic_pending = false;
                            active.info_message = Some("Room ended.".to_string());
                            let room_id = active.room_id.clone();
                            ended_room_id = Some(room_id.clone());
                            end_success_status =
                                Some(format!("Room {} ended.", short_room_id(&room_id)));
                        }
                        Err(err) => {
                            active.info_message = Some("End room failed.".to_string());
                            active.start_error = Some(err.clone());
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!("end room failed: {}", truncate_text(&err, 96)),
                                },
                            );
                            this.activity.truncate(8);
                            end_error_status =
                                Some(format!("End room failed: {}", truncate_text(&err, 120)));
                        }
                    }
                }
                if let Some(room_id) = ended_room_id {
                    this.active_tab = RoomsTab::Following;
                    this.update_room_card_status(&room_id, RoomStatus::Ended);
                    this.activity.insert(
                        0,
                        ActivityItem {
                            color: hsla(0.11, 0.50, 0.70, 1.0),
                            text: format!("you ended {}", short_room_id(&room_id)),
                        },
                    );
                    this.activity.truncate(8);
                }
                let should_refresh_discovery = end_success_status.is_some();
                if let Some(message) = end_success_status {
                    this.publish_status_success("rooms.host.end", message, cx);
                }
                if let Some(message) = end_error_status {
                    this.publish_status_error("rooms.host.end", message, cx);
                }
                if should_refresh_discovery {
                    this.refresh_discoverable_rooms(cx);
                }
                cx.notify();
            });
        })
        .detach();
    }
}
