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

        // Grab persisted auth for PKP signing (needed if XMTP identity isn't registered yet).
        let persisted_auth = cx
            .try_global::<crate::auth::AuthState>()
            .and_then(|auth| auth.persisted.clone());

        // Connect on a background thread to avoid blocking the UI.
        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            // Perform XMTP connection (this blocks on tokio internally).
            let result = std::thread::spawn({
                let xmtp = xmtp.clone();
                let address = address.clone();
                move || {
                    let mut service = lock_xmtp(&xmtp);
                    service.connect(&address, |sig_text| {
                        let persisted = persisted_auth.as_ref().ok_or(
                            "No persisted auth — cannot sign XMTP identity. Please log in via the web app first.".to_string(),
                        )?;

                        log::info!("[Chat] Initializing LitWalletService for XMTP signing...");
                        let mut lit = LitWalletService::new()
                            .map_err(|e| format!("LitWalletService::new: {e}"))?;
                        lit.initialize_from_auth(persisted)
                            .map_err(|e| format!("LitWallet init: {e}"))?;

                        let message = std::str::from_utf8(sig_text)
                            .map_err(|e| format!("XMTP signature_text is not valid UTF-8: {e}"))?
                            .to_string();
                        log::info!(
                            "[Chat] PKP personal signing XMTP identity text ({} bytes)",
                            message.len()
                        );
                        lit.pkp_personal_sign(&message)
                    })
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
