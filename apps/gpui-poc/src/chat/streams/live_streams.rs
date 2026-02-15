use super::super::*;

impl ChatView {
    pub(in crate::chat) fn start_global_message_stream(&mut self, cx: &mut Context<Self>) {
        self.global_stream_generation = self.global_stream_generation.wrapping_add(1);
        let stream_generation = self.global_stream_generation;
        let xmtp = self.xmtp.clone();
        let own_inbox = lock_xmtp(&xmtp)
            .my_inbox_id()
            .map(|s| s.to_string())
            .unwrap_or_default();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let (tx, rx) = smol::channel::unbounded::<XmtpMessage>();

            std::thread::spawn(move || {
                let service = lock_xmtp(&xmtp);
                if let Err(e) = service.stream_all_messages(move |msg| {
                    let _ = tx.send_blocking(msg);
                }) {
                    log::error!("[Chat] Failed to start global message stream: {e}");
                }
            });

            while let Ok(msg) = rx.recv().await {
                let keep_running = this
                    .update(cx, |this, cx| {
                        if this.global_stream_generation != stream_generation || !this.connected {
                            return false;
                        }

                        let sent_at_ns = msg.sent_at_ns.parse::<i64>().unwrap_or(0);
                        let is_known_conversation =
                            this.conversations.iter().any(|c| c.id == msg.conversation_id);

                        if is_known_conversation {
                            this.touch_conversation_preview(
                                &msg.conversation_id,
                                &msg.content,
                                sent_at_ns,
                            );

                            if this.active_conversation_id.as_deref()
                                == Some(&msg.conversation_id)
                            {
                                let expires_at_ns = this.message_expires_at_ns_for_conversation(
                                    &msg.conversation_id,
                                    sent_at_ns,
                                );
                                let chat_msg = ChatMessage {
                                    id: msg.id.clone(),
                                    sender_address: msg.sender_address.clone(),
                                    content: msg.content.clone(),
                                    sent_at_ns,
                                    expires_at_ns,
                                    is_own: msg.sender_address == own_inbox,
                                };
                                if this.should_show_message_for_disappearing(chat_msg.expires_at_ns)
                                    && !this.messages.iter().any(|m| m.id == chat_msg.id)
                                {
                                    this.messages.push(chat_msg);
                                }
                            }
                            cx.notify();
                            return true;
                        }

                        // New conversation ID observed from stream (often from a new peer message
                        // or stitched/remapped DM). Refresh list with a small throttle.
                        let should_refresh = this
                            .last_stream_refresh_at
                            .map(|last| last.elapsed() >= Duration::from_secs(2))
                            .unwrap_or(true);
                        if should_refresh {
                            this.last_stream_refresh_at = Some(Instant::now());
                            log::info!(
                                "[Chat] Global stream discovered unseen conversation {}; refreshing list",
                                msg.conversation_id
                            );
                            this.refresh_conversations(cx);
                        }

                        true
                    })
                    .unwrap_or(false);
                if !keep_running {
                    break;
                }
            }
        })
        .detach();
    }

    pub(in crate::chat) fn start_global_conversation_stream(&mut self, cx: &mut Context<Self>) {
        let stream_generation = self.global_stream_generation;
        let xmtp = self.xmtp.clone();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let (tx, rx) = smol::channel::unbounded::<String>();

            std::thread::spawn(move || {
                let service = lock_xmtp(&xmtp);
                if let Err(e) = service.stream_dm_conversations(move |conversation_id| {
                    let _ = tx.send_blocking(conversation_id);
                }) {
                    log::error!("[Chat] Failed to start DM conversation stream: {e}");
                }
            });

            while let Ok(conversation_id) = rx.recv().await {
                let keep_running = this
                    .update(cx, |this, cx| {
                        if this.global_stream_generation != stream_generation || !this.connected {
                            return false;
                        }

                        if this.conversations.iter().any(|c| c.id == conversation_id) {
                            return true;
                        }

                        let should_refresh = this
                            .last_stream_refresh_at
                            .map(|last| last.elapsed() >= Duration::from_secs(2))
                            .unwrap_or(true);
                        if should_refresh {
                            this.last_stream_refresh_at = Some(Instant::now());
                            log::info!(
                                "[Chat] Conversation stream discovered unseen DM {}; refreshing list",
                                conversation_id
                            );
                            this.refresh_conversations(cx);
                        }
                        true
                    })
                    .unwrap_or(false);
                if !keep_running {
                    break;
                }
            }
        })
        .detach();
    }

    pub(in crate::chat) fn start_periodic_conversation_refresh(&mut self, cx: &mut Context<Self>) {
        let stream_generation = self.global_stream_generation;
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                // Keep periodic list refresh lightweight; global stream handles most real-time updates.
                smol::Timer::after(Duration::from_secs(15)).await;
                let keep_running = this
                    .update(cx, |this, cx| {
                        if this.global_stream_generation != stream_generation || !this.connected {
                            return false;
                        }
                        this.refresh_conversations(cx);
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

    pub(in crate::chat) fn refresh_conversations(&mut self, cx: &mut Context<Self>) {
        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn({
                let xmtp = xmtp.clone();
                move || lock_xmtp(&xmtp).list_conversations()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(convos) => {
                        let mapped = convos
                            .into_iter()
                            .map(|c| ConversationItem {
                                id: c.id,
                                peer_display_name: abbreviate_address(&c.peer_address),
                                peer_nationality: None, // TODO: resolve from profile
                                last_message: c
                                    .last_message
                                    .map(|msg| preview_text_for_content(&msg)),
                                last_message_at: c.last_message_at,
                                unread: false, // TODO: track unread state
                                peer_address: c.peer_address,
                            })
                            .collect();
                        this.rebuild_conversations(mapped);
                        log::debug!("[Chat] Loaded {} conversations", this.conversations.len());
                    }
                    Err(e) => {
                        log::error!("[Chat] Failed to list conversations: {e}");
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
