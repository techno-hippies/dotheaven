use super::*;

impl XmtpService {
    /// Send a text message to a conversation.
    pub fn send_message(&self, conversation_id: &str, content: &str) -> Result<(), String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let content = content.to_string();

        self.runtime.block_on(async {
            let group = match client.stitched_group(&group_id) {
                Ok(group) => group,
                Err(stitched_err) => {
                    log::warn!(
                        "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                    );
                    client.group(&group_id).map_err(|e| format!("group: {e}"))?
                }
            };

            let encoded = TextCodec::encode(content).map_err(|e| format!("encode: {e}"))?;
            let bytes = encoded.encode_to_vec();

            group
                .send_message(&bytes, SendMessageOpts::default())
                .await
                .map(|_| ())
                .map_err(|e| format!("send: {e}"))
        })
    }

    /// Send a session signaling message (offer/accept/reject) over XMTP.
    /// Media is not transported via XMTP; this is metadata signaling only.
    pub fn send_voice_signal(
        &self,
        conversation_id: &str,
        signal: &VoiceSignalEnvelope,
    ) -> Result<(), String> {
        let content = encode_voice_signal_text(signal)?;
        self.send_message(conversation_id, &content)
    }

    /// Load messages from a conversation.
    pub fn load_messages(
        &self,
        conversation_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<XmtpMessage>, String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let conv_id = conversation_id.to_string();

        self.runtime.block_on(async {
            let group = match client.stitched_group(&group_id) {
                Ok(group) => group,
                Err(stitched_err) => {
                    log::warn!(
                        "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                    );
                    client.group(&group_id).map_err(|e| format!("group: {e}"))?
                }
            };

            // Sync to get latest messages.
            if let Err(e) = group.sync().await {
                let sync_err = e.to_string();
                if sync_err.to_ascii_lowercase().contains("inactive") {
                    log::warn!(
                        "[XMTP] sync failed for inactive group {conv_id}; loading local messages only"
                    );
                } else {
                    return Err(format!("sync: {e}"));
                }
            }

            let args = MsgQueryArgs {
                kind: Some(GroupMessageKind::Application),
                limit,
                ..Default::default()
            };

            let messages = group.find_messages(&args).map_err(|e| format!("find: {e}"))?;

            let results: Vec<XmtpMessage> =
                messages.iter().filter_map(|m| msg_to_json(m, &conv_id)).collect();

            Ok(results)
        })
    }

    /// Get the current disappearing message settings for a conversation.
    ///
    /// Returns `Ok(None)` when no disappearing settings are enabled.
    pub fn disappearing_message_settings(
        &self,
        conversation_id: &str,
    ) -> Result<Option<DisappearingMessageSettings>, String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;

        self.runtime.block_on(async {
            let group = match client.stitched_group(&group_id) {
                Ok(group) => group,
                Err(stitched_err) => {
                    log::warn!(
                        "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                    );
                    client.group(&group_id).map_err(|e| format!("group: {e}"))?
                }
            };

            let settings = group
                .disappearing_settings()
                .map_err(|e| format!("disappearing_settings: {e}"))?;

            Ok(settings
                .filter(|s| s.is_enabled())
                .map(|s| DisappearingMessageSettings {
                    from_ns: s.from_ns,
                    in_ns: s.in_ns,
                }))
        })
    }

    /// Set disappearing messages for a conversation.
    ///
    /// - `seconds == 0`: disables disappearing messages
    /// - `seconds > 0`: enables disappearing messages, tracking messages starting "now"
    pub fn set_disappearing_message_seconds(
        &self,
        conversation_id: &str,
        seconds: u64,
    ) -> Result<Option<DisappearingMessageSettings>, String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;

        self.runtime.block_on(async {
            let group = match client.stitched_group(&group_id) {
                Ok(group) => group,
                Err(stitched_err) => {
                    log::warn!(
                        "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                    );
                    client.group(&group_id).map_err(|e| format!("group: {e}"))?
                }
            };

            if seconds == 0 {
                group
                    .remove_conversation_message_disappearing_settings()
                    .await
                    .map_err(|e| format!("remove_disappearing_settings: {e}"))?;
            } else {
                let from_ns = xmtp_common::time::now_ns();
                let in_ns = (seconds as i64).saturating_mul(1_000_000_000);
                let settings =
                    xmtp_mls_common::group_mutable_metadata::MessageDisappearingSettings::new(
                        from_ns, in_ns,
                    );

                group
                    .update_conversation_message_disappearing_settings(settings)
                    .await
                    .map_err(|e| format!("update_disappearing_settings: {e}"))?;
            }

            let settings = group
                .disappearing_settings()
                .map_err(|e| format!("disappearing_settings: {e}"))?;

            Ok(settings
                .filter(|s| s.is_enabled())
                .map(|s| DisappearingMessageSettings {
                    from_ns: s.from_ns,
                    in_ns: s.in_ns,
                }))
        })
    }
}
