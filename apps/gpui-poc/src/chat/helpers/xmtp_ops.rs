use super::*;

pub(crate) fn lock_xmtp<'a>(
    xmtp: &'a Arc<Mutex<XmtpService>>,
) -> std::sync::MutexGuard<'a, XmtpService> {
    match xmtp.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::error!("[Chat] XMTP mutex was poisoned by a prior panic; recovering lock");
            poisoned.into_inner()
        }
    }
}

pub(crate) fn run_with_timeout<T, F>(op_name: &str, timeout: Duration, op: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let started = Instant::now();
    log::info!(
        "[Chat] Starting op '{op_name}' with timeout={}s",
        timeout.as_secs()
    );
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let _ = tx.send(op());
    });
    match rx.recv_timeout(timeout) {
        Ok(Ok(value)) => {
            log::info!(
                "[Chat] Op '{op_name}' completed in {}ms",
                started.elapsed().as_millis()
            );
            Ok(value)
        }
        Ok(Err(err)) => {
            log::warn!(
                "[Chat] Op '{op_name}' failed in {}ms: {err}",
                started.elapsed().as_millis()
            );
            Err(err)
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            let msg = format!("{op_name} timed out after {}s", timeout.as_secs());
            log::error!(
                "[Chat] Op '{op_name}' timed out in {}ms",
                started.elapsed().as_millis()
            );
            Err(msg)
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            let msg = format!("{op_name} worker disconnected");
            log::error!(
                "[Chat] Op '{op_name}' worker disconnected in {}ms",
                started.elapsed().as_millis()
            );
            Err(msg)
        }
    }
}

pub(crate) fn is_xmtp_identity_validation_error(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("inboxvalidationfailed")
        || lower.contains("intent [")
        || lower.contains("create_dm_by_identity_retry")
        || lower.contains("create_dm_retry")
}

fn is_xmtp_inactive_error(err: &str) -> bool {
    err.to_ascii_lowercase().contains("inactive")
}

pub(crate) fn should_trigger_xmtp_hard_reset(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("database disk image is malformed")
        || lower.contains("file is not a database")
        || (lower.contains("sqlite") && lower.contains("corrupt"))
}

pub(crate) fn send_with_dm_reactivate(
    xmtp: &Arc<Mutex<XmtpService>>,
    conversation_id: &str,
    peer_address: Option<&str>,
    content: &str,
) -> Result<String, String> {
    log::info!(
        "[Chat] Sending message: conv_id={conversation_id}, peer_present={}, content_len={}",
        peer_address.is_some(),
        content.len()
    );
    let first_send = {
        let svc = lock_xmtp(xmtp);
        svc.send_message(conversation_id, content)
    };
    match first_send {
        Ok(()) => Ok(conversation_id.to_string()),
        Err(err) => {
            let Some(peer) = peer_address.filter(|peer| is_evm_address(peer)) else {
                return Err(err);
            };
            if !is_xmtp_inactive_error(&err) && !is_xmtp_identity_validation_error(&err) {
                return Err(err);
            }
            log::warn!(
                "[Chat] Send failed on {conversation_id}; resolving DM by peer before retry: peer={peer}, err={err}"
            );
            let resolved_conv_id =
                lock_xmtp(xmtp).refresh_dm_for_peer(peer, Duration::from_secs(8))?;
            let retry_send = {
                let svc = lock_xmtp(xmtp);
                svc.send_message(&resolved_conv_id, content)
            };
            if let Err(retry_err) = retry_send {
                if is_xmtp_inactive_error(&retry_err) {
                    return Err(format!(
                        "{retry_err}; conversation remains inactive after DM refresh (peer={peer})"
                    ));
                }
                return Err(format!("{err}; retry after DM refresh failed: {retry_err}"));
            }
            if resolved_conv_id != conversation_id {
                log::info!(
                    "[Chat] Send remapped to stitched DM: old_conv_id={conversation_id}, new_conv_id={resolved_conv_id}"
                );
            }
            Ok(resolved_conv_id)
        }
    }
}

pub(crate) fn load_messages_with_dm_reactivate(
    xmtp: &Arc<Mutex<XmtpService>>,
    conversation_id: &str,
    peer_address: Option<&str>,
    limit: Option<i64>,
) -> Result<(String, Vec<XmtpMessage>), String> {
    log::info!(
        "[Chat] Loading messages: conv_id={conversation_id}, peer_present={}",
        peer_address.is_some()
    );
    let first_load = {
        let svc = lock_xmtp(xmtp);
        svc.load_messages(conversation_id, limit)
    };
    match first_load {
        Ok(msgs) => Ok((conversation_id.to_string(), msgs)),
        Err(err) => {
            let Some(peer) = peer_address.filter(|peer| is_evm_address(peer)) else {
                return Err(err);
            };
            if !is_xmtp_inactive_error(&err) && !is_xmtp_identity_validation_error(&err) {
                return Err(err);
            }
            log::warn!(
                "[Chat] Load failed on {conversation_id}; resolving DM by peer before retry: peer={peer}, err={err}"
            );
            let retry_conv_id =
                lock_xmtp(xmtp).refresh_dm_for_peer(peer, Duration::from_secs(8))?;
            let msgs = lock_xmtp(xmtp)
                .load_messages(&retry_conv_id, limit)
                .map_err(|retry_err| {
                    format!("{err}; retry after DM refresh failed: {retry_err}")
                })?;
            Ok((retry_conv_id, msgs))
        }
    }
}

pub(crate) fn set_disappearing_message_seconds_with_dm_reactivate(
    xmtp: &Arc<Mutex<XmtpService>>,
    conversation_id: &str,
    peer_address: Option<&str>,
    seconds: u64,
) -> Result<(String, Option<DisappearingMessageState>), String> {
    log::info!(
        "[Chat] Setting disappearing messages: conv_id={conversation_id}, peer_present={}, seconds={seconds}",
        peer_address.is_some()
    );

    let first_set = {
        let svc = lock_xmtp(xmtp);
        svc.set_disappearing_message_seconds(conversation_id, seconds)
    };
    match first_set {
        Ok(settings) => Ok((
            conversation_id.to_string(),
            settings.map(|s| DisappearingMessageState {
                disappear_starting_at_ns: s.from_ns,
                retention_duration_ns: s.in_ns,
            }),
        )),
        Err(err) => {
            let Some(peer) = peer_address.filter(|peer| is_evm_address(peer)) else {
                return Err(err);
            };
            if !is_xmtp_inactive_error(&err) && !is_xmtp_identity_validation_error(&err) {
                return Err(err);
            }
            log::warn!(
                "[Chat] Disappearing settings update failed on {conversation_id}; resolving DM by peer before retry: peer={peer}, err={err}"
            );
            let resolved_conv_id =
                lock_xmtp(xmtp).refresh_dm_for_peer(peer, Duration::from_secs(8))?;
            let retry_set = {
                let svc = lock_xmtp(xmtp);
                svc.set_disappearing_message_seconds(&resolved_conv_id, seconds)
            };
            match retry_set {
                Ok(settings) => {
                    if resolved_conv_id != conversation_id {
                        log::info!(
                            "[Chat] Disappearing settings remapped to stitched DM: old_conv_id={conversation_id}, new_conv_id={resolved_conv_id}"
                        );
                    }
                    Ok((
                        resolved_conv_id,
                        settings.map(|s| DisappearingMessageState {
                            disappear_starting_at_ns: s.from_ns,
                            retention_duration_ns: s.in_ns,
                        }),
                    ))
                }
                Err(retry_err) => {
                    if is_xmtp_inactive_error(&retry_err) {
                        return Err(format!(
                            "{retry_err}; conversation remains inactive after DM refresh (peer={peer})"
                        ));
                    }
                    Err(format!("{err}; retry after DM refresh failed: {retry_err}"))
                }
            }
        }
    }
}
