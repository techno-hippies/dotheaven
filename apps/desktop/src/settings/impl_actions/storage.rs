use super::super::helpers::infer_track_meta_from_path;
use super::super::*;

impl SettingsView {
    pub(crate) fn storage_health(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Checking storage health...".into();
        self.error = None;
        self.publish_status_progress("settings.storage", self.status.clone(), cx);
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.health()
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Storage is healthy".into();
                        this.last_storage_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                        this.publish_status_success("settings.storage", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Storage health check failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.storage",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn storage_status(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => {
                self.error = Some("No persisted auth. Click Sign In first.".into());
                cx.notify();
                return;
            }
        };

        self.busy = true;
        self.status = "Fetching Load storage status...".into();
        self.error = None;
        self.publish_status_progress("settings.storage", self.status.clone(), cx);
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.storage_status(&auth)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Load storage status loaded".into();
                        this.last_storage_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                        this.publish_status_success("settings.storage", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Load storage status failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.storage",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn storage_preflight_smoke(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => {
                self.error = Some("No persisted auth. Click Sign In first.".into());
                cx.notify();
                return;
            }
        };

        self.busy = true;
        self.status = "Running Load preflight check (10MB)...".into();
        self.error = None;
        self.publish_status_progress("settings.storage", self.status.clone(), cx);
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.storage_preflight(&auth, 10 * 1024 * 1024)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Load preflight check complete".into();
                        this.last_storage_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                        this.publish_status_success("settings.storage", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Load preflight check failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.storage",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn storage_deposit_and_approve(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => {
                self.error = Some("No persisted auth. Click Sign In first.".into());
                cx.notify();
                return;
            }
        };

        self.busy = true;
        self.status = "Running funding flow...".into();
        self.error = None;
        self.publish_status_progress("settings.storage", self.status.clone(), cx);
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.storage_deposit_and_approve(&auth, "0.0001")
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Load funding flow complete".into();
                        this.last_storage_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                        this.publish_status_success("settings.storage", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Load funding flow failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.storage",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn storage_encrypt_upload_file(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => {
                self.error = Some("No persisted auth. Click Sign In first.".into());
                cx.notify();
                return;
            }
        };

        let Some(path) = rfd::FileDialog::new()
            .set_title("Select Audio File to Encrypt + Upload")
            .add_filter(
                "Audio",
                &["mp3", "m4a", "flac", "wav", "ogg", "aac", "opus", "wma"],
            )
            .pick_file()
        else {
            return;
        };

        let path_str = path.to_string_lossy().to_string();
        let track_meta = infer_track_meta_from_path(&path);

        self.busy = true;
        self.status =
            "Encrypting + uploading + registering content via storage (can take a few minutes)..."
                .into();
        self.error = None;
        self.publish_status_progress("settings.storage", self.status.clone(), cx);
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.content_encrypt_upload_register(&auth, &path_str, true, track_meta)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Encrypted upload + content register complete".into();
                        this.last_storage_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                        this.publish_status_success("settings.storage", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Encrypted upload failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.storage",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
