use super::*;

impl XmtpService {
    /// List DM conversations.
    pub fn list_conversations(&self) -> Result<Vec<ConversationInfo>, String> {
        let client = get_client(&self.client)?;
        let my_inbox_id = self.my_inbox_id.as_deref().unwrap_or_default().to_string();
        let consent_states = dm_consent_states();
        let should_sync = {
            let mut last_sync_at = self
                .last_dm_sync_at
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let now = Instant::now();
            let sync_needed = last_sync_at
                .map(|last| now.saturating_duration_since(last) >= Duration::from_secs(20))
                .unwrap_or(true);
            if sync_needed {
                *last_sync_at = Some(now);
            }
            sync_needed
        };

        self.runtime.block_on(async {
            if should_sync {
                // Keep this aligned with web transport: sync all first, then list DMs.
                // If network sync fails, still return the local DB snapshot.
                match client
                    .sync_all_welcomes_and_groups(Some(consent_states.clone()))
                    .await
                {
                    Ok(summary) => {
                        log::debug!("[XMTP] list sync summary: {summary:?}");
                    }
                    Err(e) => {
                        log::warn!(
                            "[XMTP] sync_all_welcomes_and_groups during list failed; using local state: {e}"
                        );
                    }
                }
            } else {
                log::debug!("[XMTP] Skipping full DM sync (throttled)");
            }

            let args = xmtp_db::encrypted_store::group::GroupQueryArgs {
                conversation_type: Some(ConversationType::Dm),
                consent_states: Some(consent_states.clone()),
                include_duplicate_dms: true,
                ..Default::default()
            };

            let conversations = client
                .list_conversations(args)
                .map_err(|e| format!("list: {e}"))?;

            let mut results = Vec::new();

            for conv in conversations {
                let group_id_hex = hex::encode(&conv.group.group_id);

                // Resolve peer's Ethereum address from group members.
                let peer_address = match conv.group.members().await {
                    Ok(members) => {
                        let peer = members.iter().find(|m| m.inbox_id != my_inbox_id);
                        if let Some(peer) = peer {
                            peer.account_identifiers
                                .iter()
                                .find_map(|id| match id {
                                    Identifier::Ethereum(eth) => Some(eth.0.clone()),
                                    _ => None,
                                })
                                .unwrap_or_else(|| {
                                    conv.group
                                        .dm_id
                                        .clone()
                                        .unwrap_or_else(|| group_id_hex.clone())
                                })
                        } else {
                            conv.group
                                .dm_id
                                .clone()
                                .unwrap_or_else(|| group_id_hex.clone())
                        }
                    }
                    Err(e) => {
                        log::warn!("[XMTP] Failed to load members for {group_id_hex}: {e}");
                        conv.group
                            .dm_id
                            .clone()
                            .unwrap_or_else(|| group_id_hex.clone())
                    }
                };

                let (last_message, last_message_at, last_message_sender) =
                    if let Some(ref msg) = conv.last_message {
                        let text = decode_text(msg).and_then(|decoded| {
                            parse_voice_signal_text(&decoded).is_none().then_some(decoded)
                        });
                        (
                            text,
                            Some(msg.sent_at_ns / 1_000_000),
                            Some(msg.sender_inbox_id.clone()),
                        )
                    } else {
                        (None, None, None)
                    };

                let info = ConversationInfo {
                    id: group_id_hex,
                    peer_address,
                    last_message,
                    last_message_at,
                    last_message_sender,
                };
                results.push(info);
            }

            results.sort_by(|a, b| {
                b.last_message_at
                    .unwrap_or(0)
                    .cmp(&a.last_message_at.unwrap_or(0))
                    .then_with(|| a.id.cmp(&b.id))
            });
            Ok(results)
        })
    }

    /// Get or create a DM conversation with a peer.
    pub fn get_or_create_dm(&self, peer_address: &str) -> Result<String, String> {
        self.get_or_create_dm_with_timeout(peer_address, Duration::from_secs(20))
    }

    /// Get or create a DM conversation with a timeout.
    pub fn get_or_create_dm_with_timeout(
        &self,
        peer_address: &str,
        timeout: Duration,
    ) -> Result<String, String> {
        self.refresh_dm_for_peer(peer_address, timeout)
    }

    /// Refresh DM state from the network and return the current DM conversation id for a peer.
    ///
    /// This intentionally resolves by peer identity rather than trusting a previously cached
    /// conversation id, because DM group ids can change after stitching/sync.
    pub fn refresh_dm_for_peer(
        &self,
        peer_address: &str,
        timeout: Duration,
    ) -> Result<String, String> {
        let client = get_client(&self.client)?;
        let peer = peer_address.trim().to_string();
        if !is_evm_address(&peer) {
            return Err(format!(
                "refresh_dm_for_peer expects an EVM address, got: {peer}"
            ));
        }

        self.runtime.block_on(async {
            let dm_future = async {
                match client
                    .sync_all_welcomes_and_groups(Some(dm_consent_states()))
                    .await
                {
                    Ok(summary) => {
                        log::info!(
                            "[XMTP] Refreshed welcomes/groups before DM lookup for {peer}: {summary:?}"
                        );
                    }
                    Err(e) => {
                        log::warn!(
                            "[XMTP] sync_all_welcomes_and_groups before DM lookup failed: {e}"
                        );
                    }
                }

                let identifier = Identifier::Ethereum(ident::Ethereum(peer.to_lowercase()));
                let dm = client
                    .find_or_create_dm_by_identity(identifier, None)
                    .await
                    .map_err(|e| format!("create_dm_by_identity: {e} | debug={e:?}"))?;

                if !dm.is_active().map_err(|e| format!("dm_is_active: {e}"))? {
                    return Err(format!(
                        "resolved DM is inactive after sync (peer={peer}); cannot send on stale DM"
                    ));
                }

                Ok::<String, String>(hex::encode(&dm.group_id))
            };

            tokio::time::timeout(timeout, dm_future)
                .await
                .map_err(|_| format!("refresh_dm timed out after {}s", timeout.as_secs()))?
        })
    }
}
