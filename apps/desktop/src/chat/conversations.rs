use super::*;

impl ChatView {
    pub(super) fn disappearing_message_seconds_for_conversation(
        &self,
        conversation_id: &str,
    ) -> u64 {
        self.disappearing_message_seconds
            .get(conversation_id)
            .map(|state| state.retention_seconds())
            .unwrap_or(0)
    }

    pub(crate) fn message_expires_at_ns_for_conversation(
        &self,
        conversation_id: &str,
        sent_at_ns: i64,
    ) -> Option<i64> {
        let state = self.disappearing_message_seconds.get(conversation_id)?;
        if !state.is_enabled() {
            return None;
        }
        if sent_at_ns < state.disappear_starting_at_ns {
            return None;
        }
        Some(sent_at_ns.saturating_add(state.retention_duration_ns))
    }

    pub(crate) fn should_show_message_for_disappearing(
        &self,
        message_expires_at_ns: Option<i64>,
    ) -> bool {
        match message_expires_at_ns {
            Some(expires_at_ns) => now_unix_ns() < expires_at_ns,
            None => true,
        }
    }

    pub(super) fn filter_messages_for_disappearing(
        &self,
        _conversation_id: &str,
        messages: Vec<ChatMessage>,
    ) -> Vec<ChatMessage> {
        messages
            .into_iter()
            .filter(|msg| self.should_show_message_for_disappearing(msg.expires_at_ns))
            .collect()
    }

    pub(super) fn set_disappearing_message_seconds(
        &mut self,
        conversation_id: String,
        seconds: u64,
        cx: &mut Context<Self>,
    ) {
        let peer_address = self
            .conversations
            .iter()
            .find(|c| c.id == conversation_id)
            .and_then(|c| {
                if is_evm_address(&c.peer_address) {
                    Some(c.peer_address.clone())
                } else {
                    log::warn!(
                        "[Chat] Skipping DM peer-resolution for disappearing settings update; peer is not an EVM address: conv_id={}, peer={}",
                        conversation_id,
                        c.peer_address
                    );
                    None
                }
            });

        let previous_state = self
            .disappearing_message_seconds
            .get(&conversation_id)
            .copied();

        // Optimistic local UI update (selection + header indicator).
        if seconds == 0 {
            self.disappearing_message_seconds.remove(&conversation_id);
        } else {
            self.disappearing_message_seconds.insert(
                conversation_id.clone(),
                DisappearingMessageState {
                    disappear_starting_at_ns: now_unix_ns(),
                    retention_duration_ns: (seconds as i64).saturating_mul(1_000_000_000),
                },
            );
        }
        cx.notify();

        // Update via XMTP in background.
        let xmtp = self.xmtp.clone();
        let conv_id_for_send = conversation_id.clone();
        let conv_id_for_ui = conversation_id.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock({
                let xmtp = xmtp.clone();
                let conv_id_for_send = conv_id_for_send.clone();
                let peer_address = peer_address.clone();
                move || {
                    run_with_timeout(
                        "set disappearing messages",
                        Duration::from_secs(15),
                        move || {
                            helpers::set_disappearing_message_seconds_with_dm_reactivate(
                                &xmtp,
                                &conv_id_for_send,
                                peer_address.as_deref(),
                                seconds,
                            )
                        },
                    )
                }
            })
            .await;

            let _ = this.update(cx, |this, cx| match result {
                Ok((resolved_conv_id, resolved_state)) => {
                    if resolved_conv_id != conv_id_for_ui {
                        // DM stitching/remap: reload on the resolved ID to keep streams + actions consistent.
                        this.select_conversation(resolved_conv_id.clone(), cx);
                        this.refresh_conversations(cx);
                    }

                    // Apply resolved settings.
                    this.disappearing_message_seconds.remove(&conv_id_for_ui);
                    if let Some(state) = resolved_state {
                        this.disappearing_message_seconds
                            .insert(resolved_conv_id.clone(), state);
                    } else {
                        this.disappearing_message_seconds.remove(&resolved_conv_id);
                    }

                    cx.notify();
                }
                Err(e) => {
                    log::error!("[Chat] Failed to update disappearing messages: {e}");

                    // Revert optimistic state.
                    this.disappearing_message_seconds.remove(&conv_id_for_ui);
                    if let Some(state) = previous_state {
                        this.disappearing_message_seconds
                            .insert(conv_id_for_ui.clone(), state);
                    }

                    this.publish_status_error(
                        "chat.disappearing",
                        format!("Failed to update disappearing messages: {e}"),
                        cx,
                    );
                    cx.notify();

                    if should_trigger_xmtp_hard_reset(&e) && !this.xmtp_hard_reset_attempted {
                        this.xmtp_hard_reset_attempted = true;
                        this.recover_xmtp_session_hard(cx);
                    } else if is_xmtp_identity_validation_error(&e) {
                        this.recover_xmtp_session(cx);
                    }
                }
            });
        })
        .detach();
    }

    pub(super) fn copy_conversation_wallet_address(
        &mut self,
        conversation_id: String,
        cx: &mut Context<Self>,
    ) {
        let Some(conversation) = self.conversations.iter().find(|c| c.id == conversation_id) else {
            log::warn!(
                "[Chat] Failed to copy wallet address: conversation not found {}",
                conversation_id
            );
            self.publish_status_error(
                "chat.copy",
                "Unable to copy wallet address: conversation not found.",
                cx,
            );
            return;
        };

        if !is_evm_address(&conversation.peer_address) {
            log::warn!(
                "[Chat] Failed to copy wallet address for conv_id={}; peer_address is not an EVM address: {}",
                conversation_id,
                conversation.peer_address
            );
            self.publish_status_error(
                "chat.copy",
                "Cannot copy wallet address: peer is not an Ethereum address.",
                cx,
            );
            return;
        }

        let peer_address = conversation.peer_address.clone();
        cx.write_to_clipboard(ClipboardItem::new_string(peer_address.clone()));
        self.publish_status_success(
            "chat.copy",
            format!(
                "Copied {} ({})",
                abbreviate_address(&peer_address),
                conversation.peer_display_name
            ),
            cx,
        );
    }

    pub(super) fn on_auth_changed(&mut self, cx: &mut Context<Self>) {
        let auth = cx.global::<crate::auth::AuthState>();
        let new_address = auth.display_address().map(|a| a.to_string());

        if new_address != self.own_address {
            log::info!(
                "[Chat] Auth owner changed for Scarlett history: old={} new={}",
                self.own_address.as_deref().unwrap_or("<none>"),
                new_address.as_deref().unwrap_or("<none>")
            );
            match self.voice_controller.lock() {
                Ok(mut voice) => voice.reset_auth(),
                Err(poisoned) => poisoned.into_inner().reset_auth(),
            }
            self.own_address = new_address;
            self.disappearing_message_seconds.clear();
            self.reload_scarlett_history_for_current_owner();
            if self.own_address.is_some() && !self.connected && !self.connecting {
                self.try_connect(cx);
            } else if self.own_address.is_none() {
                // Logged out
                self.global_stream_generation = self.global_stream_generation.wrapping_add(1);
                lock_xmtp(&self.xmtp).disconnect();
                self.connected = false;
                self.conversations.clear();
                self.messages = self.scarlett_messages.clone();
                self.active_conversation_id = None;
                self.ai_sending = false;
                self.voice_error = None;
                match self.voice_controller.lock() {
                    Ok(mut voice) => {
                        let _ = voice.end_call();
                        voice.reset_auth();
                    }
                    Err(poisoned) => {
                        let mut voice = poisoned.into_inner();
                        let _ = voice.end_call();
                        voice.reset_auth();
                    }
                }
                cx.notify();
            }
        }
    }

    pub(super) fn ensure_scarlett_conversation(&mut self) {
        let last = self.scarlett_messages.last().cloned();
        let row = ConversationItem {
            id: SCARLETT_CONVERSATION_ID.to_string(),
            peer_address: SCARLETT_CONVERSATION_ID.to_string(),
            peer_display_name: SCARLETT_NAME.to_string(),
            peer_nationality: None,
            last_message: last.as_ref().map(|m| normalize_preview_text(&m.content)),
            last_message_at: last.as_ref().map(|m| m.sent_at_ns / 1_000_000),
            unread: false,
        };

        self.conversations
            .retain(|c| c.id != SCARLETT_CONVERSATION_ID);
        self.conversations.insert(0, row);
    }

    pub(super) fn rebuild_conversations(&mut self, mut xmpt: Vec<ConversationItem>) {
        let previous_active_id = self.active_conversation_id.clone();
        let previous_active_peer = previous_active_id.as_ref().and_then(|id| {
            self.conversations
                .iter()
                .find(|c| &c.id == id)
                .map(|c| c.peer_address.clone())
        });

        xmpt.retain(|c| c.id != SCARLETT_CONVERSATION_ID);
        self.conversations = xmpt;
        self.ensure_scarlett_conversation();

        let Some(active_id) = previous_active_id else {
            return;
        };
        if active_id == SCARLETT_CONVERSATION_ID {
            self.active_conversation_id = Some(SCARLETT_CONVERSATION_ID.to_string());
            self.messages = self.scarlett_messages.clone();
            return;
        }
        if self.conversations.iter().any(|c| c.id == active_id) {
            return;
        }
        if let Some(peer) = previous_active_peer {
            if let Some(remapped) = self
                .conversations
                .iter()
                .find(|c| c.peer_address.eq_ignore_ascii_case(&peer))
            {
                log::info!(
                    "[Chat] Active conversation remapped by peer: old_id={active_id}, new_id={}",
                    remapped.id
                );
                if let Some(state) = self.disappearing_message_seconds.remove(&active_id) {
                    self.disappearing_message_seconds
                        .insert(remapped.id.clone(), state);
                }
                self.active_conversation_id = Some(remapped.id.clone());
                return;
            }
        }
        log::warn!(
            "[Chat] Active conversation {active_id} no longer exists after refresh; switching to Scarlett"
        );
        self.active_conversation_id = Some(SCARLETT_CONVERSATION_ID.to_string());
        self.messages = self.scarlett_messages.clone();
    }

    pub(super) fn touch_conversation_preview(
        &mut self,
        conversation_id: &str,
        content: &str,
        sent_at_ns: i64,
    ) {
        let Some(idx) = self
            .conversations
            .iter()
            .position(|c| c.id == conversation_id)
        else {
            return;
        };

        let mut conv = self.conversations.remove(idx);
        conv.last_message = Some(preview_text_for_content(content));
        conv.last_message_at = Some(sent_at_ns / 1_000_000);
        self.conversations.insert(0, conv);
    }

    pub(super) fn select_conversation(&mut self, id: String, cx: &mut Context<Self>) {
        if self.is_scarlett_active() && id != SCARLETT_CONVERSATION_ID {
            self.end_scarlett_call(cx);
        }
        self.active_conversation_id = Some(id.clone());
        if id == SCARLETT_CONVERSATION_ID {
            log::info!(
                "[Chat] Selecting Scarlett conversation owner={} messages_in_memory={}",
                self.own_address.as_deref().unwrap_or("<none>"),
                self.scarlett_messages.len()
            );
            self.messages = self.scarlett_messages.clone();
            cx.notify();
            return;
        }

        self.messages.clear();
        cx.notify();

        // Load messages from XMTP
        let xmtp = self.xmtp.clone();
        let conv_id = id.clone();
        let peer_address = self
            .conversations
            .iter()
            .find(|c| c.id == conv_id)
            .and_then(|c| {
                if is_evm_address(&c.peer_address) {
                    Some(c.peer_address.clone())
                } else {
                    log::warn!(
                        "[Chat] Skipping DM peer-resolution for conv_id={conv_id}; peer is not an EVM address: {}",
                        c.peer_address
                    );
                    None
                }
            });
        let own_inbox = lock_xmtp(&xmtp)
            .my_inbox_id()
            .map(|s| s.to_string())
            .unwrap_or_default();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock({
                let xmtp = xmtp.clone();
                let conv_id = conv_id.clone();
                let peer_address = peer_address.clone();
                move || {
                    run_with_timeout("load messages", Duration::from_secs(15), move || {
                        let (resolved_conv_id, msgs) = load_messages_with_dm_reactivate(
                            &xmtp,
                            &conv_id,
                            peer_address.as_deref(),
                            None,
                        )?;

                        let disappearing_settings = lock_xmtp(&xmtp)
                            .disappearing_message_settings(&resolved_conv_id)
                            .unwrap_or_else(|e| {
                                log::warn!(
                                    "[Chat] Failed to load disappearing settings for {}: {}",
                                    resolved_conv_id,
                                    e
                                );
                                None
                            });
                        let disappearing_state =
                            disappearing_settings.map(|s| DisappearingMessageState {
                                disappear_starting_at_ns: s.from_ns,
                                retention_duration_ns: s.in_ns,
                            });

                        Ok((resolved_conv_id, msgs, disappearing_state))
                    })
                }
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                // Only update if this conversation is still active
                if this.active_conversation_id.as_ref() != Some(&conv_id) {
                    return;
                }
                match &result {
                    Ok((resolved_conv_id, msgs, disappearing_state)) => {
                        if resolved_conv_id != &conv_id {
                            this.active_conversation_id = Some(resolved_conv_id.clone());
                            if let Some(state) = this.disappearing_message_seconds.remove(&conv_id)
                            {
                                this.disappearing_message_seconds
                                    .insert(resolved_conv_id.clone(), state);
                            }
                            this.refresh_conversations(cx);
                        }

                        // Refresh disappearing settings for this conversation.
                        this.disappearing_message_seconds.remove(resolved_conv_id);
                        if let Some(state) = *disappearing_state {
                            this.disappearing_message_seconds
                                .insert(resolved_conv_id.clone(), state);
                        }

                        let loaded_messages: Vec<ChatMessage> = msgs
                            .iter()
                            .map(|m| {
                                let is_own = m.sender_address == own_inbox;
                                let sent_at_ns = m.sent_at_ns.parse().unwrap_or(0);
                                let expires_at_ns = this.message_expires_at_ns_for_conversation(
                                    resolved_conv_id,
                                    sent_at_ns,
                                );
                                ChatMessage {
                                    id: m.id.clone(),
                                    sender_address: m.sender_address.clone(),
                                    content: m.content.clone(),
                                    sent_at_ns,
                                    expires_at_ns,
                                    is_own,
                                }
                            })
                            .collect();
                        this.messages = this
                            .filter_messages_for_disappearing(&resolved_conv_id, loaded_messages);
                        if let Some(last) = this.messages.last().cloned() {
                            this.touch_conversation_preview(
                                resolved_conv_id,
                                &last.content,
                                last.sent_at_ns,
                            );
                        }
                    }
                    Err(e) => {
                        log::error!("[Chat] Failed to load messages: {e}");
                        if should_trigger_xmtp_hard_reset(e) && !this.xmtp_hard_reset_attempted {
                            this.xmtp_hard_reset_attempted = true;
                            this.recover_xmtp_session_hard(cx);
                        }
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
