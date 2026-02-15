use super::*;

impl ChatView {
    pub(super) fn handle_send_message(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let text = self.input_state.read(cx).value().to_string();
        let text = text.trim().to_string();
        if text.is_empty() {
            return;
        }

        let conv_id = match &self.active_conversation_id {
            Some(id) => id.clone(),
            None => return,
        };
        let peer_address = self
            .conversations
            .iter()
            .find(|c| c.id == conv_id)
            .and_then(|c| {
                if is_evm_address(&c.peer_address) {
                    Some(c.peer_address.clone())
                } else {
                    log::warn!(
                        "[Chat] Sending without DM peer-resolution for conv_id={conv_id}; peer is not an EVM address: {}",
                        c.peer_address
                    );
                    None
                }
            });

        // Clear input
        self.input_state.update(cx, |state, cx| {
            state.set_value("", window, cx);
        });
        if conv_id == SCARLETT_CONVERSATION_ID {
            self.handle_send_scarlett_message(text, cx);
            return;
        }
        cx.notify();

        // Send via XMTP in background
        let xmtp = self.xmtp.clone();
        let conv_id_for_send = conv_id.clone();
        let conv_id_for_ui = conv_id.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                send_with_dm_reactivate(&xmtp, &conv_id_for_send, peer_address.as_deref(), &text)
            })
            .await;

            let _ = this.update(cx, |this, cx| match result {
                Ok(sent_conv_id) => {
                    if sent_conv_id != conv_id_for_ui {
                        this.select_conversation(sent_conv_id, cx);
                        this.refresh_conversations(cx);
                    }
                }
                Err(e) => {
                    log::error!("[Chat] Failed to send message: {e}");
                    this.publish_status_error(
                        "chat.send",
                        format!("Failed to send message: {e}"),
                        cx,
                    );
                    if should_trigger_xmtp_hard_reset(&e) && !this.xmtp_hard_reset_attempted {
                        this.xmtp_hard_reset_attempted = true;
                        this.recover_xmtp_session_hard(cx);
                    } else if is_xmtp_identity_validation_error(&e) {
                        this.recover_xmtp_session(cx);
                    }
                    // TODO: mark message as failed in UI
                }
            });
        })
        .detach();
    }

    fn handle_send_scarlett_message(&mut self, text: String, cx: &mut Context<Self>) {
        if self.ai_sending {
            return;
        }

        let user_msg = make_user_message(text.clone());
        self.scarlett_messages.push(user_msg.clone());
        self.messages = self.scarlett_messages.clone();
        self.ai_sending = true;
        self.voice_error = None;
        self.touch_conversation_preview(
            SCARLETT_CONVERSATION_ID,
            &user_msg.content,
            user_msg.sent_at_ns,
        );
        self.ensure_scarlett_conversation();
        cx.notify();

        let history: Vec<ChatHistoryItem> = self
            .scarlett_messages
            .iter()
            .rev()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|m| ChatHistoryItem {
                role: if m.is_own {
                    "user".to_string()
                } else {
                    "assistant".to_string()
                },
                content: m.content,
            })
            .collect();
        let endpoints = crate::voice::VoiceEndpoints::default();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                crate::voice::send_chat_message_from_disk_auth(&endpoints, &text, &history)
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                this.ai_sending = false;
                match result {
                    Ok(reply) => {
                        let msg = make_scarlett_message(reply);
                        this.scarlett_messages.push(msg.clone());
                        if this.is_scarlett_active() {
                            this.messages = this.scarlett_messages.clone();
                        }
                        this.touch_conversation_preview(
                            SCARLETT_CONVERSATION_ID,
                            &msg.content,
                            msg.sent_at_ns,
                        );
                        this.ensure_scarlett_conversation();
                    }
                    Err(err) => {
                        this.voice_error = Some(err.clone());
                        let msg = make_scarlett_message(
                            "Sorry, something went wrong. Please try again.".to_string(),
                        );
                        this.scarlett_messages.push(msg.clone());
                        if this.is_scarlett_active() {
                            this.messages = this.scarlett_messages.clone();
                        }
                        this.touch_conversation_preview(
                            SCARLETT_CONVERSATION_ID,
                            &msg.content,
                            msg.sent_at_ns,
                        );
                        this.ensure_scarlett_conversation();
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
