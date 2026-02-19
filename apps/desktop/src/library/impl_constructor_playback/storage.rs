use super::*;

impl LibraryView {
    pub(in crate::library) fn fetch_storage_status(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => return,
        };
        self.storage_loading = true;
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("lock: {e}"))?;
                svc.storage_status(&auth)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.storage_loading = false;
                match result {
                    Ok(val) => {
                        this.storage_balance = Some(
                            val.get("balance")
                                .and_then(|v| v.as_str())
                                .unwrap_or("0")
                                .to_string(),
                        );
                        this.storage_monthly = val
                            .get("monthlyCost")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        this.storage_days = val.get("daysRemaining").and_then(|v| v.as_i64());
                    }
                    Err(e) => {
                        this.storage_balance = Some("0".to_string());
                        log::warn!("[Library] storage status fetch failed: {}", e);
                        if this
                            .status_message
                            .as_deref()
                            .is_some_and(|msg| msg.contains("Refreshing storage status"))
                        {
                            this.set_status_message(
                                format!("Funding submitted, but balance refresh failed: {}", e),
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

    pub(in crate::library) fn add_funds(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => {
                self.set_status_message("Sign in from Wallet before adding funds.", cx);
                return;
            }
        };
        if self.add_funds_busy {
            return;
        }
        self.add_funds_busy = true;
        self.set_status_message("Submitting funding tx...", cx);

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("lock: {e}"))?;
                svc.storage_deposit_and_approve(&auth, "0.0001")
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.add_funds_busy = false;
                match result {
                    Ok(val) => {
                        let funding_enabled = val
                            .get("turboFundingEnabled")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);
                        if !funding_enabled {
                            let message = val
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Add Credits is disabled in offchain mode.");
                            log::info!("[Library] add_funds skipped: {}", message);
                            this.set_status_message(message.to_string(), cx);
                            return;
                        }
                        let tx_hash = val
                            .get("txHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown");
                        log::info!(
                            "[Library] storage funding flow complete: txHash={}",
                            tx_hash
                        );
                        this.set_status_message(
                            "Funding submitted. Refreshing storage status...",
                            cx,
                        );
                        this.fetch_storage_status(cx);
                    }
                    Err(e) => {
                        log::error!("[Library] storage funding flow failed: {}", e);
                        this.set_status_message(format!("Funding failed: {}", e), cx);
                    }
                }
            });
        })
        .detach();
    }
}
pub(in crate::library) fn format_duration_mmss(total_seconds: u64) -> String {
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("{minutes}:{seconds:02}")
}
