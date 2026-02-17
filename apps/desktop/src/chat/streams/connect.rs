use super::super::*;

impl ChatView {
    pub(in crate::chat) fn try_connect(&mut self, cx: &mut Context<Self>) {
        let address = match &self.own_address {
            Some(a) => a.clone(),
            None => return,
        };

        self.connecting = true;
        self.connect_error = None;
        self.publish_status_progress("chat.connect", "Connecting to XMTP...", cx);
        cx.notify();

        // Connect on a background thread to avoid blocking the UI.
        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            // Perform XMTP connection (this blocks on tokio internally).
            let result = std::thread::spawn({
                let xmtp = xmtp.clone();
                let address = address.clone();
                move || {
                    let mut service = lock_xmtp(&xmtp);
                    service.connect(&address)
                }
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                this.connecting = false;
                match result {
                    Ok(inbox_id) => {
                        log::info!("[Chat] XMTP connected: {inbox_id}");
                        this.connected = true;
                        this.connect_error = None;
                        this.xmtp_hard_reset_attempted = false;
                        this.publish_status_success("chat.connect", "Messages connected.", cx);
                        this.refresh_conversations(cx);
                        this.start_global_message_stream(cx);
                        this.start_global_conversation_stream(cx);
                        this.start_periodic_conversation_refresh(cx);
                    }
                    Err(e) => {
                        log::error!("[Chat] XMTP connect failed: {e}");
                        this.connect_error = Some(e);
                        if let Some(err) = this.connect_error.clone() {
                            this.publish_status_error(
                                "chat.connect",
                                format!("Messages connect failed: {err}"),
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
