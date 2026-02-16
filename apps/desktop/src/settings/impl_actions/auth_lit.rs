use super::super::*;

impl SettingsView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut error = None;
        let service = match LitWalletService::new() {
            Ok(s) => Arc::new(Mutex::new(s)),
            Err(e) => {
                error = Some(e);
                Arc::new(Mutex::new(
                    LitWalletService::new()
                        .unwrap_or_else(|_| panic!("Lit runtime initialization failed")),
                ))
            }
        };

        // Build theme select items: "Heaven (default)" + all bundled themes
        let mut theme_items: Vec<String> = vec!["Heaven (default)".to_string()];
        for t in crate::zed_theme_import::bundled_themes() {
            theme_items.push(t.name.to_string());
        }
        let theme_select = cx.new(|cx| {
            SelectState::new(
                theme_items,
                Some(gpui_component::IndexPath {
                    section: 0,
                    row: 0,
                    column: 0,
                }),
                window,
                cx,
            )
        });

        // Subscribe to theme selection changes
        cx.subscribe(
            &theme_select,
            |this: &mut Self, _, ev: &SelectEvent<Vec<String>>, cx| {
                if let SelectEvent::Confirm(Some(value)) = ev {
                    if value == "Heaven (default)" {
                        this.reset_theme(cx);
                    } else {
                        this.apply_bundled_theme(value.clone(), cx);
                    }
                }
            },
        )
        .detach();

        Self {
            service,
            storage: Arc::new(Mutex::new(LoadStorageService::new())),
            jacktrip_test: Arc::new(Mutex::new(JackTripController::new())),
            busy: false,
            status: "Ready".to_string(),
            last_action_response: None,
            last_signature: None,
            last_storage_response: None,
            last_voice_response: None,
            error,
            show_dev_tools: false,
            imported_theme_name: None,
            theme_select,
        }
    }

    pub(crate) fn refresh_auth(&mut self, cx: &mut Context<Self>) {
        let persisted = auth::load_from_disk();
        self.error = None;
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.persisted = persisted;
            state.authing = false;
        });
        self.status = "Auth refreshed from disk".to_string();
        self.publish_status_success("settings.auth", self.status.clone(), cx);
        cx.notify();
    }

    pub(crate) fn sign_in(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Opening browser for wallet auth...".into();
        self.error = None;
        self.publish_status_progress("settings.auth", self.status.clone(), cx);
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.authing = true;
        });
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = auth::run_auth_callback_server().await;
            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(auth_result) => {
                        let persisted = auth::to_persisted(&auth_result);
                        match auth::save_to_disk(&persisted) {
                            Ok(()) => {
                                this.status = format!(
                                    "Authenticated as {}",
                                    persisted
                                        .pkp_address
                                        .clone()
                                        .unwrap_or_else(|| "(unknown PKP address)".to_string())
                                );
                                this.error = None;
                                this.publish_status_success(
                                    "settings.auth",
                                    this.status.clone(),
                                    cx,
                                );
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.persisted = Some(persisted);
                                    state.authing = false;
                                });
                            }
                            Err(e) => {
                                this.status = "Auth finished, but failed to persist".into();
                                this.error = Some(e.clone());
                                this.publish_status_error(
                                    "settings.auth",
                                    format!("{}: {}", this.status, e),
                                    cx,
                                );
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.authing = false;
                                });
                            }
                        }
                    }
                    Err(e) => {
                        this.status = "Authentication failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.auth",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                        let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                            state.authing = false;
                        });
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn logout(&mut self, cx: &mut Context<Self>) {
        auth::delete_from_disk();
        self.last_action_response = None;
        self.last_signature = None;
        self.last_storage_response = None;
        self.last_voice_response = None;
        self.error = None;
        self.status = "Signed out".to_string();
        self.publish_status_info("settings.auth", self.status.clone(), cx);
        if let Ok(mut svc) = self.service.lock() {
            svc.clear();
        }
        if let Ok(mut jacktrip) = self.jacktrip_test.lock() {
            let _ = jacktrip.disconnect();
            let _ = jacktrip.stop_local_server();
        }
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.persisted = None;
            state.authing = false;
        });
        log::info!("[Settings] User signed out");
        cx.notify();
    }

    pub(crate) fn init_lit_context(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let persisted = match auth::load_from_disk() {
            Some(p) => p,
            None => {
                self.error = Some("No persisted auth. Click Sign In first.".into());
                cx.notify();
                return;
            }
        };

        self.busy = true;
        self.status = "Initializing Lit auth context (Rust SDK)...".into();
        self.error = None;
        self.publish_status_progress("settings.lit", self.status.clone(), cx);
        cx.notify();

        let service = self.service.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = service.lock().map_err(|e| format!("service lock: {e}"))?;
                svc.initialize_from_auth(&persisted)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(status) => {
                        this.status =
                            format!("Lit ready on {} for {}", status.network, status.pkp_address);
                        this.error = None;
                        this.publish_status_success("settings.lit", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Lit init failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.lit",
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

    pub(crate) fn execute_smoke_action(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Executing Lit Action via Rust SDK...".into();
        self.error = None;
        self.publish_status_progress("settings.lit", self.status.clone(), cx);
        cx.notify();

        let service = self.service.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = service.lock().map_err(|e| format!("service lock: {e}"))?;
                svc.execute_js(SMOKE_ACTION_CODE.to_string(), None)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Lit Action executed".into();
                        this.last_action_response = Some(
                            serde_json::to_string_pretty(&resp.response)
                                .unwrap_or_else(|_| format!("{:?}", resp.response)),
                        );
                        this.error = None;
                        this.publish_status_success("settings.lit", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "executeJs failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.lit",
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

    pub(crate) fn sign_smoke_payload(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Signing payload with PKP via Rust SDK...".into();
        self.error = None;
        self.publish_status_progress("settings.lit", self.status.clone(), cx);
        cx.notify();

        let service = self.service.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = service.lock().map_err(|e| format!("service lock: {e}"))?;
                svc.pkp_sign_via_execute_js(b"heaven-gpui:pkp-sign-smoke")
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(sig) => {
                        this.status = "PKP sign succeeded".into();
                        this.last_signature = Some(
                            serde_json::to_string_pretty(&sig)
                                .unwrap_or_else(|_| format!("{sig:?}")),
                        );
                        this.error = None;
                        this.publish_status_success("settings.lit", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "PKP sign failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.lit",
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
