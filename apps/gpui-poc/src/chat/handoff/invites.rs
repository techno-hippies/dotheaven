use super::*;

impl ChatView {
    pub(in crate::chat) fn send_jacktrip_invite(
        &mut self,
        conversation_id: String,
        cx: &mut Context<Self>,
    ) {
        if conversation_id == SCARLETT_CONVERSATION_ID {
            return;
        }
        {
            let state = self
                .session_handoff
                .entry(conversation_id.clone())
                .or_default();
            if state.opening {
                log::warn!(
                    "[Chat] Invite ignored because handoff already opening: conv_id={conversation_id}"
                );
                return;
            }
            state.opening = true;
            state.last_error = None;
        }

        let host_wallet = self
            .own_address
            .clone()
            .unwrap_or_else(|| "unknown".to_string());
        let host_display = abbreviate_address(&host_wallet);
        let created_at_ms = now_unix_ns() / 1_000_000;
        let invite = JackTripRoomInvite {
            version: 1,
            invite_id: format!("inv-{created_at_ms}"),
            room_id: format!("room-{created_at_ms}"),
            host_wallet,
            host_display,
            created_at_ms,
            join_url: jacktrip_web_url(),
        };

        let encoded = match encode_jacktrip_invite(&invite) {
            Ok(content) => content,
            Err(err) => {
                let state = self.session_handoff.entry(conversation_id).or_default();
                state.opening = false;
                state.last_error = Some(err);
                state.last_info = None;
                cx.notify();
                return;
            }
        };

        let xmtp = self.xmtp.clone();
        let peer_address = self
            .conversations
            .iter()
            .find(|c| c.id == conversation_id)
            .and_then(|c| {
                if is_evm_address(&c.peer_address) {
                    Some(c.peer_address.clone())
                } else {
                    log::warn!(
                        "[Chat] Sending invite without DM peer-resolution for conv_id={conversation_id}; peer is not an EVM address: {}",
                        c.peer_address
                    );
                    None
                }
            });
        log::info!(
            "[Chat] Invite requested: conv_id={}, peer_address={}",
            conversation_id,
            peer_address.as_deref().unwrap_or("<unknown>")
        );
        let conv_id = conversation_id.clone();
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                run_with_timeout("send JackTrip invite", Duration::from_secs(20), move || {
                    send_with_dm_reactivate(&xmtp, &conv_id, peer_address.as_deref(), &encoded)
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(sent_conv_id) => {
                        let mut info = "Sent JackTrip room invite".to_string();
                        if sent_conv_id != conversation_id {
                            this.select_conversation(sent_conv_id, cx);
                            this.refresh_conversations(cx);
                            info = "Sent JackTrip room invite (conversation reopened)".to_string();
                        }
                        let state = this
                            .session_handoff
                            .entry(conversation_id.clone())
                            .or_default();
                        state.opening = false;
                        state.last_info = Some(info);
                        state.last_error = None;
                    }
                    Err(err) => {
                        log::error!(
                            "[Chat] JackTrip invite failed for conv_id={}: {err}",
                            conversation_id
                        );
                        let state = this
                            .session_handoff
                            .entry(conversation_id.clone())
                            .or_default();
                        state.opening = false;
                        state.last_info = None;
                        if should_trigger_xmtp_hard_reset(&err) && !this.xmtp_hard_reset_attempted {
                            this.xmtp_hard_reset_attempted = true;
                            state.last_error = Some(
                                "Failed to send invite: XMTP local state is stuck. Resetting local XMTP state and reconnecting now; retry in ~10s."
                                    .to_string(),
                            );
                            this.recover_xmtp_session_hard(cx);
                        } else if is_xmtp_identity_validation_error(&err) {
                            state.last_error = Some(
                                "Failed to send invite: XMTP session validation error. Reconnecting XMTP now; retry in a few seconds."
                                    .to_string(),
                            );
                            this.recover_xmtp_session(cx);
                        } else {
                            state.last_error = Some(format!("Failed to send invite: {err}"));
                        }
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
