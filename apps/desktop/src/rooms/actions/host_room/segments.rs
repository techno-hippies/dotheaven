use super::*;

impl RoomsView {
    pub(crate) fn open_segment_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(active) = self.active_host_room.as_ref() else {
            return;
        };
        if active.status != RoomStatus::Live {
            self.segment_modal_error =
                Some("Start room before starting a new segment.".to_string());
            cx.notify();
            return;
        }

        let default_pay_to = auth::load_from_disk()
            .and_then(|p| p.wallet_address().map(str::to_string))
            .unwrap_or_default()
            .to_lowercase();

        self.segment_modal_open = true;
        self.segment_modal_error = None;
        self.segment_search_pending = false;
        self.segment_start_pending = false;
        self.segment_song_results.clear();
        self.segment_selected_song = None;

        self.segment_song_query_input_state
            .update(cx, |state, cx| state.set_value("", window, cx));
        self.segment_pay_to_input_state
            .update(cx, |state, cx| state.set_value(&default_pay_to, window, cx));

        cx.notify();
    }

    pub(crate) fn close_segment_modal(&mut self, cx: &mut Context<Self>) {
        self.segment_modal_open = false;
        self.segment_modal_error = None;
        self.segment_search_pending = false;
        self.segment_start_pending = false;
        self.segment_song_results.clear();
        self.segment_selected_song = None;
        cx.notify();
    }

    pub(crate) fn select_segment_song(&mut self, song: SongSearchItem, cx: &mut Context<Self>) {
        self.segment_selected_song = Some(song);
        self.segment_modal_error = None;
        cx.notify();
    }

    pub(crate) fn clear_segment_song_selection(&mut self, cx: &mut Context<Self>) {
        self.segment_selected_song = None;
        cx.notify();
    }

    pub(crate) fn search_segment_songs(&mut self, cx: &mut Context<Self>) {
        if self.segment_search_pending {
            return;
        }

        let query = self
            .segment_song_query_input_state
            .read(cx)
            .value()
            .to_string();
        let query_trimmed = query.trim().to_string();
        if query_trimmed.len() < 2 {
            self.segment_song_results.clear();
            self.segment_selected_song = None;
            self.segment_modal_error = None;
            cx.notify();
            return;
        }

        let endpoints = VoiceEndpoints::default();
        self.segment_search_pending = true;
        self.segment_modal_error = None;
        self.publish_status_progress("rooms.segment.search", "Searching songs...", cx);
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || search_songs(&endpoints, &query_trimmed)).await;

            let _ = this.update(cx, |this, cx| {
                this.segment_search_pending = false;

                match result {
                    Ok(resp) => {
                        this.segment_song_results = resp.songs;
                        this.segment_selected_song = None;
                        this.segment_modal_error = None;
                        this.publish_status_success(
                            "rooms.segment.search",
                            "Song search complete.",
                            cx,
                        );
                    }
                    Err(err) => {
                        this.segment_modal_error = Some(err.clone());
                        this.publish_status_error(
                            "rooms.segment.search",
                            format!("Song search failed: {}", truncate_text(&err, 140)),
                            cx,
                        );
                    }
                }

                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn submit_start_segment(&mut self, cx: &mut Context<Self>) {
        if self.segment_start_pending {
            return;
        }
        let Some(active) = self.active_host_room.as_ref() else {
            self.segment_modal_error = Some("No active room.".to_string());
            cx.notify();
            return;
        };
        if active.status != RoomStatus::Live {
            self.segment_modal_error = Some("Room must be live to start a segment.".to_string());
            cx.notify();
            return;
        }

        let room_id = active.room_id.clone();
        let room_id_for_update = room_id.clone();
        let pay_to = self
            .segment_pay_to_input_state
            .read(cx)
            .value()
            .trim()
            .to_lowercase();

        if !is_hex_address(&pay_to) {
            self.segment_modal_error = Some("payTo must be a valid 0x... address.".to_string());
            cx.notify();
            return;
        }

        let song_id = self
            .segment_selected_song
            .as_ref()
            .map(|song| song.song_id.clone());

        let endpoints = VoiceEndpoints::default();
        self.segment_start_pending = true;
        self.segment_modal_error = None;
        self.publish_status_progress(
            "rooms.segment.start",
            format!("Starting segment for {}...", short_room_id(&room_id)),
            cx,
        );
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                start_duet_segment_from_disk(&endpoints, &room_id, &pay_to, song_id.as_deref())
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.segment_start_pending = false;

                match result {
                    Ok(resp) => {
                        this.segment_modal_open = false;
                        this.segment_modal_error = None;
                        this.segment_song_results.clear();
                        this.segment_selected_song = None;

                        if let Some(active) = this.active_host_room.as_mut() {
                            if active.room_id == room_id_for_update {
                                active.info_message = Some(format!(
                                    "Started new segment {}.",
                                    short_room_id(&resp.current_segment_id)
                                ));
                            }
                        }

                        this.activity.insert(
                            0,
                            ActivityItem {
                                color: hsla(0.40, 0.78, 0.70, 1.0),
                                text: format!(
                                    "segment started for {}",
                                    short_room_id(&room_id_for_update)
                                ),
                            },
                        );
                        this.activity.truncate(8);

                        this.publish_status_success(
                            "rooms.segment.start",
                            format!(
                                "Segment started for {}.",
                                short_room_id(&room_id_for_update)
                            ),
                            cx,
                        );
                    }
                    Err(err) => {
                        this.segment_modal_error = Some(err.clone());
                        this.publish_status_error(
                            "rooms.segment.start",
                            format!("Segment start failed: {}", truncate_text(&err, 140)),
                            cx,
                        );
                    }
                }

                cx.notify();
            });
        })
        .detach();
    }
}
