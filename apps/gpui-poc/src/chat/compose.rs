use super::*;

impl ChatView {
    pub fn open_compose_with_recipient(
        &mut self,
        recipient: impl Into<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let recipient = recipient.into();
        self.compose_open = true;
        self.compose_submitting = false;
        self.compose_error = None;
        self.compose_input_state.update(cx, |state, cx| {
            state.set_value(&recipient, window, cx);
            state.focus(window, cx);
        });
        cx.notify();
    }

    pub(super) fn open_compose_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open_compose_with_recipient("", window, cx);
    }

    pub(super) fn close_compose_modal(&mut self, cx: &mut Context<Self>) {
        self.compose_open = false;
        self.compose_submitting = false;
        self.compose_error = None;
        cx.notify();
    }

    pub(super) fn handle_compose_submit(&mut self, cx: &mut Context<Self>) {
        if self.compose_submitting {
            return;
        }
        let raw = self.compose_input_state.read(cx).value().trim().to_string();
        if raw.is_empty() {
            self.compose_error =
                Some("Enter a wallet address, heaven username, or name.eth".to_string());
            cx.notify();
            return;
        }

        self.compose_submitting = true;
        self.compose_error = None;
        self.publish_status_progress("chat.compose", "Starting chat...", cx);
        cx.notify();

        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let recipient = resolve_recipient_identifier(&raw)?;
                let conv_id = lock_xmtp(&xmtp).get_or_create_dm(&recipient)?;
                Ok::<(String, String), String>((recipient, conv_id))
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                this.compose_submitting = false;
                match result {
                    Ok((_recipient, conv_id)) => {
                        this.compose_open = false;
                        this.compose_error = None;
                        this.publish_status_success("chat.compose", "Chat is ready.", cx);
                        this.refresh_conversations(cx);
                        this.select_conversation(conv_id, cx);
                    }
                    Err(e) => {
                        log::error!("[Chat] Failed to start new chat: {e}");
                        this.compose_error = Some(e);
                        if let Some(err) = this.compose_error.clone() {
                            this.publish_status_error(
                                "chat.compose",
                                format!("Could not start chat: {err}"),
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
}
