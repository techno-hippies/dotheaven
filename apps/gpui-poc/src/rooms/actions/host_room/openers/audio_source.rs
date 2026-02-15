use super::*;

impl RoomsView {
    pub(crate) fn setup_jacktrip_audio_source_for_active_room(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.audio_source_setup_pending {
            return;
        }
        if host.kind != RoomKind::Duet {
            if let Some(active) = self.active_host_room.as_mut() {
                active.info_message = Some(
                    "No JackTrip audio source setup is required for DJ rooms. Open Broadcast and share app audio instead."
                        .to_string(),
                );
            }
            cx.notify();
            return;
        }

        let room_id = host.room_id.clone();
        if let Some(active) = self.active_host_room.as_mut() {
            active.audio_source_setup_pending = true;
            active.audio_source_error = None;
            active.info_message = Some("Preparing JackTrip browser audio source...".to_string());
        }
        self.publish_status_progress(
            "rooms.host.audio_source",
            "Preparing JackTrip browser audio source...",
            cx,
        );
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let setup_result = smol::unblock(setup_linux_duet_audio_source).await;

            let _ = this.update(cx, |this, cx| {
                let mut audio_status: Option<(bool, String)> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id {
                        return;
                    }

                    active.audio_source_setup_pending = false;
                    match setup_result {
                        Ok(result) => {
                            active.browser_audio_source_name = Some(result.source_name.clone());
                            active.browser_audio_source_label =
                                Some(result.browser_pick_label.clone());
                            active.audio_source_error = None;
                            active.default_input_source = result
                                .default_source_after
                                .clone()
                                .or(result.default_source_before.clone());
                            active.default_input_is_duet_virtual = result.default_source_is_duet;
                            active.restore_input_source_hint =
                                result.recommended_restore_source.clone();
                            active.restore_input_source_label =
                                result.recommended_restore_label.clone();
                            active.restore_system_mic_pending = false;
                            let setup_note = if result.created_sink {
                                format!(
                                    "created virtual sink \"{}\" via {}",
                                    result.sink_description, result.backend
                                )
                            } else {
                                format!(
                                    "reusing virtual sink \"{}\" via {}",
                                    result.sink_description, result.backend
                                )
                            };
                            let routing_note = if result.moved_inputs_count > 0 {
                                format!(
                                    "auto-routed {} JackTrip stream(s) to sink \"{}\"",
                                    result.moved_inputs_count, result.sink_name
                                )
                            } else {
                                format!(
                                    "if no audio, move JackTrip playback stream to sink \"{}\" in pavucontrol",
                                    result.sink_name
                                )
                            };
                            let selection_note = if result.set_default_source {
                                format!(
                                    "browser Default now points to \"{}\"",
                                    result.browser_pick_label
                                )
                            } else {
                                format!(
                                    "system default mic unchanged; select microphone \"{}\" in browser bridge",
                                    result.browser_pick_label
                                )
                            };
                            let stale_default_note = if !result.set_default_source_requested
                                && result.default_source_before.as_deref()
                                    == Some(result.source_name.as_str())
                            {
                                " Current system default input is already the JackTrip virtual source."
                            } else {
                                ""
                            };
                            let restore_note = if result.default_source_is_duet {
                                if let Some(label) = result.recommended_restore_label.as_ref() {
                                    format!(
                                        " Consider restoring system mic default to \"{}\" when done testing.",
                                        label
                                    )
                                } else if let Some(source) =
                                    result.recommended_restore_source.as_ref()
                                {
                                    format!(
                                        " Consider restoring system mic default to source \"{}\" when done testing.",
                                        source
                                    )
                                } else {
                                    " System default mic currently points to JackTrip virtual source."
                                        .to_string()
                                }
                            } else {
                                String::new()
                            };
                            active.info_message = Some(format!(
                                "JackTrip audio source ready ({setup_note}; {routing_note}; {selection_note}).{stale_default_note}{restore_note}",
                            ));
                            log::info!(
                                "[Rooms] audio source setup complete: room_id={}, source={}, label=\"{}\", default_before={:?}, default_after={:?}, default_is_duet={}, restore_hint={:?}, moved_inputs_count={}",
                                active.room_id,
                                result.source_name,
                                result.browser_pick_label,
                                result.default_source_before,
                                result.default_source_after,
                                result.default_source_is_duet,
                                result.recommended_restore_source,
                                result.moved_inputs_count
                            );
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.40, 0.78, 0.70, 1.0),
                                    text: format!(
                                        "audio source ready: {} ({})",
                                        truncate_text(&result.browser_pick_label, 52),
                                        truncate_text(&result.sink_name, 20)
                                    ),
                                },
                            );
                            this.activity.truncate(8);
                            audio_status = Some((
                                true,
                                if result.moved_inputs_count > 0 {
                                    format!(
                                        "Audio source ready. Auto-routed JackTrip. {}.",
                                        if result.set_default_source {
                                            "Browser Default is now set to the JackTrip source"
                                        } else {
                                            "Select the JackTrip source in browser mic picker"
                                        }
                                    )
                                } else {
                                    format!(
                                        "Audio source ready. Route JackTrip in pavucontrol if needed, then {}.",
                                        if result.set_default_source {
                                            "use Browser Default"
                                        } else {
                                            "pick the JackTrip source in browser"
                                        }
                                    )
                                },
                            ));
                        }
                        Err(err) => {
                            active.audio_source_error = Some(err.clone());
                            active.info_message =
                                Some("JackTrip audio source setup failed.".to_string());
                            log::warn!(
                                "[Rooms] audio source setup failed: room_id={}, error={}",
                                active.room_id,
                                err
                            );
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!(
                                        "audio source setup failed: {}",
                                        truncate_text(&err, 96)
                                    ),
                                },
                            );
                            this.activity.truncate(8);
                            audio_status = Some((
                                false,
                                format!(
                                    "Audio source setup failed: {}",
                                    truncate_text(&err, 140)
                                ),
                            ));
                        }
                    }
                }
                if let Some((ok, message)) = audio_status {
                    if ok {
                        this.publish_status_success("rooms.host.audio_source", message, cx);
                    } else {
                        this.publish_status_error("rooms.host.audio_source", message, cx);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn restore_system_mic_for_active_room(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.restore_system_mic_pending {
            return;
        }
        let room_id = host.room_id.clone();
        let preferred_source = host.restore_input_source_hint.clone();

        if let Some(active) = self.active_host_room.as_mut() {
            active.restore_system_mic_pending = true;
            active.audio_source_error = None;
            active.info_message = Some("Restoring system microphone default...".to_string());
        }
        self.publish_status_progress(
            "rooms.host.restore_system_mic",
            "Restoring system microphone default...",
            cx,
        );
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let restore_result = smol::unblock(move || {
                restore_linux_default_input_source(preferred_source.as_deref())
            })
            .await;
            let current_default_after = smol::unblock(current_linux_default_source).await;

            let _ = this.update(cx, |this, cx| {
                let mut restore_status: Option<(bool, String)> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id {
                        return;
                    }

                    active.restore_system_mic_pending = false;
                    match restore_result {
                        Ok(target_source) => {
                            active.default_input_source = current_default_after
                                .ok()
                                .flatten()
                                .or(Some(target_source.clone()));
                            active.default_input_is_duet_virtual = false;
                            active.restore_input_source_hint = Some(target_source.clone());
                            active.info_message = Some(format!(
                                "System microphone default restored to \"{}\".",
                                target_source
                            ));
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.40, 0.78, 0.70, 1.0),
                                    text: format!(
                                        "restored default mic: {}",
                                        truncate_text(&target_source, 56)
                                    ),
                                },
                            );
                            this.activity.truncate(8);
                            log::info!(
                                "[Rooms] restored system mic default: room_id={}, source={}",
                                active.room_id,
                                target_source
                            );
                            restore_status =
                                Some((true, "System microphone default restored.".to_string()));
                        }
                        Err(err) => {
                            active.audio_source_error = Some(err.clone());
                            active.info_message = Some("Failed to restore system mic.".to_string());
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!(
                                        "restore default mic failed: {}",
                                        truncate_text(&err, 96)
                                    ),
                                },
                            );
                            this.activity.truncate(8);
                            log::warn!(
                                "[Rooms] restore system mic failed: room_id={}, error={}",
                                active.room_id,
                                err
                            );
                            restore_status = Some((
                                false,
                                format!("Restore system mic failed: {}", truncate_text(&err, 140)),
                            ));
                        }
                    }
                }

                if let Some((ok, message)) = restore_status {
                    if ok {
                        this.publish_status_success("rooms.host.restore_system_mic", message, cx);
                    } else {
                        this.publish_status_error("rooms.host.restore_system_mic", message, cx);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
