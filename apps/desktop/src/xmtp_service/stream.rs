use super::*;

impl XmtpService {
    /// Start streaming ALL messages across all DM conversations.
    /// Used for unread indicators when the user isn't viewing a specific chat.
    pub fn stream_all_messages<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(XmtpMessage) + Send + 'static,
    {
        let client = get_client(&self.client)?;
        log::info!("[XMTP] Starting stream_all_messages");

        self.runtime.spawn(async move {
            match client
                .stream_all_messages_owned(Some(ConversationType::Dm), None)
                .await
            {
                Ok(mut stream) => {
                    while let Some(result) = stream.next().await {
                        match result {
                            Ok(msg) => {
                                let conv_id = hex::encode(&msg.group_id);
                                if let Some(json_msg) = msg_to_json(&msg, &conv_id) {
                                    callback(json_msg);
                                }
                            }
                            Err(e) => {
                                log::error!("[XMTP] Stream-all error: {e}");
                                break;
                            }
                        }
                    }
                    log::info!("[XMTP] stream_all_messages ended");
                }
                Err(e) => {
                    log::error!("[XMTP] Failed to start stream-all: {e}");
                }
            }
        });

        Ok(())
    }

    /// Stream DM conversation updates (including newly discovered welcomes/groups).
    pub fn stream_dm_conversations<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(String) + Send + 'static,
    {
        let client = get_client(&self.client)?;
        log::info!("[XMTP] Starting stream_dm_conversations");

        self.runtime.spawn(async move {
            match client
                .stream_conversations_owned(Some(ConversationType::Dm), true)
                .await
            {
                Ok(mut stream) => {
                    while let Some(result) = stream.next().await {
                        match result {
                            Ok(group) => {
                                callback(hex::encode(&group.group_id));
                            }
                            Err(e) => {
                                log::error!("[XMTP] Conversation stream error: {e}");
                                break;
                            }
                        }
                    }
                    log::info!("[XMTP] stream_dm_conversations ended");
                }
                Err(e) => {
                    log::error!("[XMTP] Failed to start DM conversation stream: {e}");
                }
            }
        });

        Ok(())
    }
}
