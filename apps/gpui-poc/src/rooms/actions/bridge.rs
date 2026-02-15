use super::*;

impl RoomsView {
    pub(crate) fn start_native_bridge_for_active_room(&mut self, cx: &mut Context<Self>) {
        self.refresh_native_bridge_running_state();

        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.native_bridge_pending || host.native_bridge_running {
            return;
        }
        if host.status != RoomStatus::Live {
            if let Some(active) = self.active_host_room.as_mut() {
                active.info_message = Some("Start room before starting native bridge.".to_string());
            }
            self.publish_status_info(
                "rooms.host.bridge",
                "Start room before starting native bridge.",
                cx,
            );
            cx.notify();
            return;
        }

        if let Some(reason) = native_bridge_disabled_reason() {
            if let Some(active) = self.active_host_room.as_mut() {
                active.native_bridge_error = Some(reason.clone());
                active.info_message =
                    Some("Native bridge unavailable in this build/environment.".to_string());
            }
            self.publish_status_info("rooms.host.bridge", reason, cx);
            cx.notify();
            return;
        }

        let Some(bridge_ticket) = host.bridge_ticket.clone() else {
            if let Some(active) = self.active_host_room.as_mut() {
                active.info_message = Some(
                    "Missing bridge ticket. Start room again to refresh host credentials."
                        .to_string(),
                );
            }
            self.publish_status_error(
                "rooms.host.bridge",
                "Missing bridge ticket. Start room again to refresh credentials.",
                cx,
            );
            cx.notify();
            return;
        };

        let room_id = host.room_id.clone();
        let room_id_for_update = room_id.clone();
        let worker_url = duet_worker_base_url();
        let endpoints = VoiceEndpoints::default();
        let agora_app_id = endpoints.agora_app_id;
        let china_cn_only = endpoints.china_cn_only;
        let refresh_seconds = duet_bridge_refresh_seconds();
        let pulse_source = duet_bridge_pulse_source();

        if let Some(active) = self.active_host_room.as_mut() {
            active.native_bridge_pending = true;
            active.native_bridge_error = None;
            active.info_message = Some("Starting native bridge process...".to_string());
        }
        self.publish_status_progress("rooms.host.bridge", "Starting native bridge process...", cx);
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let worker_url_for_spawn = worker_url.clone();
            let app_id_for_spawn = agora_app_id.clone();
            let pulse_source_for_spawn = pulse_source.clone();
            let result = smol::unblock(move || {
                launch_native_bridge_process(NativeBridgeLaunchConfig {
                    room_id: &room_id,
                    bridge_ticket: &bridge_ticket,
                    worker_url: &worker_url_for_spawn,
                    agora_app_id: Some(&app_id_for_spawn),
                    china_cn_only,
                    refresh_seconds,
                    pulse_source: pulse_source_for_spawn.as_deref(),
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let current_room_id = this
                    .active_host_room
                    .as_ref()
                    .map(|active| active.room_id.clone());
                if current_room_id.as_deref() != Some(room_id_for_update.as_str()) {
                    return;
                }

                match result {
                    Ok(child) => {
                        if let Err(err) = this.stop_native_bridge_process() {
                            log::warn!(
                                "[Rooms] stop previous native bridge before start failed: {err}"
                            );
                        }
                        this.native_bridge_child = Some(child);

                        if let Some(active) = this.active_host_room.as_mut() {
                            active.native_bridge_pending = false;
                            active.native_bridge_running = true;
                            active.native_bridge_error = None;
                            active.info_message = Some(match pulse_source.clone() {
                                Some(source) => format!(
                                    "Native bridge started (source: {source}). Audience should hear this source."
                                ),
                                None => "Native bridge started (default input source).".to_string(),
                            });
                        }
                        this.activity.insert(
                            0,
                            ActivityItem {
                                color: hsla(0.40, 0.78, 0.70, 1.0),
                                text: format!(
                                    "native bridge started for {}",
                                    short_room_id(&room_id_for_update)
                                ),
                            },
                        );
                        this.activity.truncate(8);
                        this.publish_status_success(
                            "rooms.host.bridge",
                            format!(
                                "Native bridge started for {}.",
                                short_room_id(&room_id_for_update)
                            ),
                            cx,
                        );
                    }
                    Err(err) => {
                        if let Some(active) = this.active_host_room.as_mut() {
                            active.native_bridge_pending = false;
                            active.native_bridge_running = false;
                            active.native_bridge_error = Some(err.clone());
                            active.info_message = Some("Native bridge failed to start.".to_string());
                        }
                        this.activity.insert(
                            0,
                            ActivityItem {
                                color: hsla(0.08, 0.80, 0.70, 1.0),
                                text: format!(
                                    "native bridge start failed: {}",
                                    truncate_text(&err, 96)
                                ),
                            },
                        );
                        this.activity.truncate(8);
                        this.publish_status_error(
                            "rooms.host.bridge",
                            format!("Native bridge start failed: {}", truncate_text(&err, 120)),
                            cx,
                        );
                    }
                }

                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn stop_native_bridge_for_active_room(&mut self, cx: &mut Context<Self>) {
        self.refresh_native_bridge_running_state();

        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.native_bridge_pending {
            return;
        }

        let result = self.stop_native_bridge_process();
        let mut bridge_status: Option<(bool, String)> = None;
        if let Some(active) = self.active_host_room.as_mut() {
            active.native_bridge_pending = false;
            active.native_bridge_running = false;
            match result.as_ref() {
                Ok(_) => {
                    active.native_bridge_error = None;
                    active.info_message = Some("Native bridge stopped.".to_string());
                    bridge_status = Some((true, "Native bridge stopped.".to_string()));
                }
                Err(err) => {
                    active.native_bridge_error = Some((*err).clone());
                    active.info_message = Some("Failed to stop native bridge cleanly.".to_string());
                    bridge_status = Some((
                        false,
                        format!("Native bridge stop failed: {}", truncate_text(err, 120)),
                    ));
                }
            }
        }
        if let Some((success, message)) = bridge_status {
            if success {
                self.publish_status_success("rooms.host.bridge", message, cx);
            } else {
                self.publish_status_error("rooms.host.bridge", message, cx);
            }
        }
        match result {
            Ok(_) => {
                self.activity.insert(
                    0,
                    ActivityItem {
                        color: hsla(0.11, 0.50, 0.70, 1.0),
                        text: "native bridge stopped".to_string(),
                    },
                );
            }
            Err(err) => {
                self.activity.insert(
                    0,
                    ActivityItem {
                        color: hsla(0.08, 0.80, 0.70, 1.0),
                        text: format!("native bridge stop failed: {}", truncate_text(&err, 96)),
                    },
                );
            }
        }
        self.activity.truncate(8);
        cx.notify();
    }

    pub(crate) fn refresh_native_bridge_running_state(&mut self) {
        let Some(child) = self.native_bridge_child.as_mut() else {
            return;
        };

        let exited_status = match child.try_wait() {
            Ok(Some(status)) => Some(status.to_string()),
            Ok(None) => None,
            Err(err) => Some(format!("status check failed: {err}")),
        };

        let Some(status_text) = exited_status else {
            return;
        };

        self.native_bridge_child = None;
        if let Some(active) = self.active_host_room.as_mut() {
            if active.native_bridge_running || active.native_bridge_pending {
                active.native_bridge_running = false;
                active.native_bridge_pending = false;
                active.native_bridge_error =
                    Some(format!("bridge exited unexpectedly ({status_text})"));
                active.info_message = if native_bridge_supported() {
                    Some("Native bridge stopped. Start it again to restore broadcast.".to_string())
                } else {
                    Some("Native bridge stopped. Use browser bridge on Linux.".to_string())
                };
            }
        }
    }

    pub(crate) fn stop_native_bridge_process(&mut self) -> Result<(), String> {
        let Some(mut child) = self.native_bridge_child.take() else {
            return Ok(());
        };

        match child.try_wait() {
            Ok(Some(_status)) => Ok(()),
            Ok(None) => {
                child
                    .kill()
                    .map_err(|e| format!("kill native bridge process failed: {e}"))?;
                let _ = child.wait();
                Ok(())
            }
            Err(e) => Err(format!("query native bridge process state failed: {e}")),
        }
    }
}
