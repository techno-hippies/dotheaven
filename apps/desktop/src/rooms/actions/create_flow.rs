use super::*;

impl RoomsView {
    pub(crate) fn submit_create_paid_room(&mut self, cx: &mut Context<Self>) {
        if self.create_submitting {
            return;
        }

        if !matches!(self.selected_type, RoomType::DjSet | RoomType::Duet) {
            self.modal_error = Some("Only Solo Room and Duet are available in V1.".to_string());
            cx.notify();
            return;
        }

        let room_type = self.selected_type;
        let guest_raw = self.guest_wallet_input_state.read(cx).value().to_string();
        let live_raw = self.live_price_input_state.read(cx).value().to_string();
        let replay_raw = self.replay_price_input_state.read(cx).value().to_string();

        let split_address =
            match auth::load_from_disk().and_then(|p| p.wallet_address().map(str::to_string)) {
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

        let guest_wallet = if room_type == RoomType::DjSet {
            None
        } else if self.partner_mode == PartnerMode::InviteSpecific {
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

        let (room_title, room_kind, room_kind_slug, open_slot_label) = match room_type {
            RoomType::DjSet => (
                "My Solo Room".to_string(),
                RoomKind::DjSet,
                "dj_set".to_string(),
                String::new(),
            ),
            _ => (
                "My Duet Room".to_string(),
                RoomKind::Duet,
                "duet".to_string(),
                "open slot".to_string(),
            ),
        };
        let visibility_slug = match self.visibility_mode {
            VisibilityMode::Public => "public".to_string(),
            VisibilityMode::Unlisted => "unlisted".to_string(),
        };

        let request = CreateDuetRoomRequest {
            split_address,
            guest_wallet: guest_wallet.clone(),
            network: "eip155:84532".to_string(),
            live_amount,
            replay_amount,
            access_window_minutes: DEFAULT_ACCESS_WINDOW_MINUTES,
            replay_mode: "worker_gated".to_string(),
            recording_mode: "host_local".to_string(),
            visibility: visibility_slug,
            title: Some(room_title.clone()),
            room_kind: Some(room_kind_slug),
        };

        let endpoints = VoiceEndpoints::default();
        let host_display = auth::load_from_disk()
            .and_then(|p| p.wallet_address().map(str::to_string))
            .map(|value| short_address(&value))
            .unwrap_or_else(|| "you".to_string());
        let guest_display = guest_wallet
            .as_ref()
            .map(|wallet| short_address(wallet))
            .unwrap_or_else(|| open_slot_label.clone());
        let visibility = self.visibility_mode;

        self.create_submitting = true;
        self.modal_error = None;
        self.publish_status_progress("rooms.create", "Creating room...", cx);
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || -> Result<CreateDuetFlowResult, String> {
                let create = create_duet_room_from_disk(&endpoints, &request)?;
                Ok(CreateDuetFlowResult {
                    room_id: create.room_id,
                    agora_channel: create.agora_channel,
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.create_submitting = false;

                match result {
                    Ok(flow) => {
                        this.create_modal_open = false;
                        this.create_step = CreateStep::ChooseType;
                        this.active_tab = RoomsTab::Following;
                        this.modal_error = None;

                        this.upsert_room_card(RoomCard {
                            room_id: flow.room_id.clone(),
                            title: room_title.clone(),
                            status: RoomStatus::Created,
                            kind: room_kind,
                            host_a: host_display.clone(),
                            host_b: guest_display.clone(),
                            meta_line: "Ready to start".to_string(),
                            price_label: price_label.clone(),
                            listener_count: 0,
                            mine: true,
                        });

                        if let Err(err) = this.stop_native_bridge_process() {
                            log::warn!(
                                "[Rooms] failed stopping existing native bridge before replacing active room: {err}"
                            );
                        }

                        this.active_host_room = Some(ActiveHostRoom {
                            room_id: flow.room_id.clone(),
                            title: room_title.clone(),
                            status: RoomStatus::Created,
                            kind: room_kind,
                            host_a: host_display.clone(),
                            host_b: guest_display.clone(),
                            price_label: price_label.clone(),
                            agora_channel: Some(flow.agora_channel.clone()),
                            bridge_ticket: None,
                            start_error: None,
                            jacktrip_error: None,
                            info_message: Some("Room created. Start room when ready.".to_string()),
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

                        this.activity.truncate(8);

                        this.publish_status_success(
                            "rooms.create",
                            format!("Room {} created.", short_room_id(&flow.room_id)),
                            cx,
                        );
                        this.refresh_discoverable_rooms(cx);
                    }
                    Err(err) => {
                        this.modal_error = Some(err.clone());
                        this.publish_status_error(
                            "rooms.create",
                            format!("Room creation failed: {}", truncate_text(&err, 140)),
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
