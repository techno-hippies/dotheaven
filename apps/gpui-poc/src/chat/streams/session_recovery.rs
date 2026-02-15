use super::super::*;

impl ChatView {
    pub(in crate::chat) fn recover_xmtp_session(&mut self, cx: &mut Context<Self>) {
        log::warn!("[Chat] Triggering XMTP self-heal: disconnect + reconnect");
        self.publish_status_progress("chat.connect", "Reconnecting messages...", cx);
        self.global_stream_generation = self.global_stream_generation.wrapping_add(1);
        {
            let mut svc = lock_xmtp(&self.xmtp);
            svc.disconnect();
        }
        self.connected = false;
        self.connecting = false;
        self.connect_error = None;
        self.refresh_conversations(cx);
        self.try_connect(cx);
    }

    pub(in crate::chat) fn recover_xmtp_session_hard(&mut self, cx: &mut Context<Self>) {
        log::warn!("[Chat] Triggering XMTP hard self-heal: reset local DB + reconnect");
        self.publish_status_progress(
            "chat.connect",
            "Resetting local message session and reconnecting...",
            cx,
        );
        self.global_stream_generation = self.global_stream_generation.wrapping_add(1);
        let own_address = self.own_address.clone();
        let mut reset_info: Option<String> = None;
        let mut reset_error: Option<String> = None;
        {
            let mut svc = lock_xmtp(&self.xmtp);
            if let Some(addr) = own_address.as_deref() {
                match svc.reset_local_state_for_address(addr) {
                    Ok(msg) => {
                        log::warn!("[Chat] XMTP hard self-heal: {msg}");
                        reset_info =
                            Some("Message session reset complete. Reconnecting...".to_string());
                    }
                    Err(err) => {
                        log::error!("[Chat] XMTP hard self-heal failed: {err}");
                        reset_error = Some(format!("Message session reset failed: {err}"));
                    }
                }
            } else {
                log::warn!(
                    "[Chat] XMTP hard self-heal: own address unavailable, only disconnecting"
                );
                svc.disconnect();
            }
        }
        if let Some(message) = reset_info {
            self.publish_status_info("chat.connect", message, cx);
        }
        if let Some(message) = reset_error {
            self.publish_status_error("chat.connect", message, cx);
        }
        self.connected = false;
        self.connecting = false;
        self.connect_error = None;
        self.refresh_conversations(cx);
        self.try_connect(cx);
    }
}
