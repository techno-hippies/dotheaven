//! Settings page for account/session actions and developer tooling.

use std::path::Path;
use std::sync::{Arc, Mutex};

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::StyledExt;

use crate::auth;
use crate::lit_wallet::LitWalletService;
use crate::synapse_sidecar::{SynapseSidecarService, TrackMetaInput};

const BG_ELEVATED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.15,
    a: 1.,
};
const BG_HOVER: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.19,
    a: 1.,
};
const BORDER_SUBTLE: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.21,
    a: 1.,
};
const TEXT_PRIMARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.98,
    a: 1.,
};
const TEXT_MUTED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.64,
    a: 1.,
};
const TEXT_DIM: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.45,
    a: 1.,
};
const ACCENT_BLUE: Hsla = Hsla {
    h: 0.62,
    s: 0.93,
    l: 0.76,
    a: 1.,
};
const ACCENT_RED: Hsla = Hsla {
    h: 0.0,
    s: 0.72,
    l: 0.62,
    a: 1.,
};

const SMOKE_ACTION_CODE: &str = r#"(async () => {
  const now = new Date().toISOString();
  Lit.Actions.setResponse({ response: JSON.stringify({ ok: true, source: "gpui-rust", now }) });
})();"#;

pub struct SettingsView {
    service: Arc<Mutex<LitWalletService>>,
    sidecar: Arc<Mutex<SynapseSidecarService>>,
    busy: bool,
    status: String,
    last_action_response: Option<String>,
    last_signature: Option<String>,
    last_sidecar_response: Option<String>,
    error: Option<String>,
    show_dev_tools: bool,
}

impl SettingsView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
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

        Self {
            service,
            sidecar: Arc::new(Mutex::new(SynapseSidecarService::new())),
            busy: false,
            status: "Ready".to_string(),
            last_action_response: None,
            last_signature: None,
            last_sidecar_response: None,
            error,
            show_dev_tools: true,
        }
    }

    fn refresh_auth(&mut self, cx: &mut Context<Self>) {
        let persisted = auth::load_from_disk();
        self.error = None;
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.persisted = persisted;
            state.authing = false;
        });
        self.status = "Auth refreshed from disk".to_string();
        cx.notify();
    }

    fn sign_in(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Opening browser for wallet auth...".into();
        self.error = None;
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
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.persisted = Some(persisted);
                                    state.authing = false;
                                });
                            }
                            Err(e) => {
                                this.status = "Auth finished, but failed to persist".into();
                                this.error = Some(e);
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.authing = false;
                                });
                            }
                        }
                    }
                    Err(e) => {
                        this.status = "Authentication failed".into();
                        this.error = Some(e);
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

    fn logout(&mut self, cx: &mut Context<Self>) {
        auth::delete_from_disk();
        self.last_action_response = None;
        self.last_signature = None;
        self.last_sidecar_response = None;
        self.error = None;
        self.status = "Signed out".to_string();
        if let Ok(mut svc) = self.service.lock() {
            svc.clear();
        }
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.persisted = None;
            state.authing = false;
        });
        log::info!("[Settings] User signed out");
        cx.notify();
    }

    fn init_lit_context(&mut self, cx: &mut Context<Self>) {
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
                    }
                    Err(e) => {
                        this.status = "Lit init failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn execute_smoke_action(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Executing Lit Action via Rust SDK...".into();
        self.error = None;
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
                    }
                    Err(e) => {
                        this.status = "executeJs failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn sign_smoke_payload(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Signing payload with PKP via Rust SDK...".into();
        self.error = None;
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
                    }
                    Err(e) => {
                        this.status = "PKP sign failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn sidecar_health(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Checking Synapse sidecar health...".into();
        self.error = None;
        cx.notify();

        let sidecar = self.sidecar.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = sidecar.lock().map_err(|e| format!("sidecar lock: {e}"))?;
                svc.health()
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Synapse sidecar is healthy".into();
                        this.last_sidecar_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                    }
                    Err(e) => {
                        this.status = "Synapse sidecar health check failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn sidecar_storage_status(&mut self, cx: &mut Context<Self>) {
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
        self.status = "Fetching Synapse storage status via sidecar...".into();
        self.error = None;
        cx.notify();

        let sidecar = self.sidecar.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = sidecar.lock().map_err(|e| format!("sidecar lock: {e}"))?;
                svc.storage_status(&auth)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Synapse storage status loaded".into();
                        this.last_sidecar_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                    }
                    Err(e) => {
                        this.status = "Synapse storage status failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn sidecar_preflight_smoke(&mut self, cx: &mut Context<Self>) {
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
        self.status = "Running Synapse preflight check (10MB)...".into();
        self.error = None;
        cx.notify();

        let sidecar = self.sidecar.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = sidecar.lock().map_err(|e| format!("sidecar lock: {e}"))?;
                svc.storage_preflight(&auth, 10 * 1024 * 1024)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Synapse preflight check complete".into();
                        this.last_sidecar_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                    }
                    Err(e) => {
                        this.status = "Synapse preflight check failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn sidecar_deposit_and_approve(&mut self, cx: &mut Context<Self>) {
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
        self.status = "Depositing 1.00 USDFC + approving storage operator...".into();
        self.error = None;
        cx.notify();

        let sidecar = self.sidecar.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = sidecar.lock().map_err(|e| format!("sidecar lock: {e}"))?;
                svc.storage_deposit_and_approve(&auth, "1.00")
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Deposit + approve complete".into();
                        this.last_sidecar_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                    }
                    Err(e) => {
                        this.status = "Deposit + approve failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn sidecar_encrypt_upload_file(&mut self, cx: &mut Context<Self>) {
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
        self.status = "Encrypting + uploading + registering content via sidecar...".into();
        self.error = None;
        cx.notify();

        let sidecar = self.sidecar.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = sidecar.lock().map_err(|e| format!("sidecar lock: {e}"))?;
                svc.content_encrypt_upload_register(&auth, &path_str, true, track_meta)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(resp) => {
                        this.status = "Encrypted upload + content register complete".into();
                        this.last_sidecar_response = Some(
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| format!("{resp:?}")),
                        );
                        this.error = None;
                    }
                    Err(e) => {
                        this.status = "Encrypted upload failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}

impl Render for SettingsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let auth_state = cx.global::<auth::AuthState>();
        let addr = auth_state
            .persisted
            .as_ref()
            .and_then(|a| a.pkp_address.clone())
            .unwrap_or_else(|| "Not signed in".to_string());
        let is_authed = auth_state.is_authenticated();

        let lit_ready = self
            .service
            .lock()
            .map(|svc| svc.is_ready())
            .unwrap_or(false);
        let lit_network = self
            .service
            .lock()
            .ok()
            .and_then(|svc| svc.network_name().map(|s| s.to_string()))
            .unwrap_or_else(|| "-".to_string());

        div()
            .id("settings-root")
            .v_flex()
            .size_full()
            .overflow_y_scroll()
            .p_6()
            .gap_4()
            .child(
                div()
                    .text_2xl()
                    .font_weight(FontWeight::BOLD)
                    .text_color(TEXT_PRIMARY)
                    .child("Settings"),
            )
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .rounded(px(10.))
                    .bg(BG_ELEVATED)
                    .border_1()
                    .border_color(BORDER_SUBTLE)
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED)
                            .child(format!("Current wallet: {addr}")),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED)
                            .child(format!("Status: {}", self.status)),
                    )
                    .child(
                        div()
                            .h_flex()
                            .gap_2()
                            .flex_wrap()
                            .child(action_button(
                                "Sign In",
                                !self.busy && !is_authed,
                                true,
                                cx.listener(|this, _, _, cx| this.sign_in(cx)),
                            ))
                            .child(action_button(
                                "Refresh Auth",
                                !self.busy,
                                false,
                                cx.listener(|this, _, _, cx| this.refresh_auth(cx)),
                            ))
                            .child(
                                div()
                                    .id("settings-logout")
                                    .h_flex()
                                    .items_center()
                                    .justify_center()
                                    .px_4()
                                    .py(px(10.))
                                    .rounded(px(8.))
                                    .bg(ACCENT_RED)
                                    .cursor_pointer()
                                    .hover(|s| s.bg(BG_HOVER))
                                    .on_click(cx.listener(|this, _, _, cx| this.logout(cx)))
                                    .child(
                                        div()
                                            .text_sm()
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(TEXT_PRIMARY)
                                            .child("Log Out"),
                                    ),
                            ),
                    ),
            )
            .child(
                div()
                    .v_flex()
                    .gap_2()
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(TEXT_MUTED)
                                    .child("Lit Developer Tools"),
                            )
                            .child(action_button(
                                if self.show_dev_tools { "Hide" } else { "Show" },
                                true,
                                false,
                                cx.listener(|this, _, _, cx| {
                                    this.show_dev_tools = !this.show_dev_tools;
                                    cx.notify();
                                }),
                            )),
                    )
                    .when(self.show_dev_tools, |el| {
                        el.child(
                            div()
                                .v_flex()
                                .gap_3()
                                .p_4()
                                .rounded(px(10.))
                                .bg(BG_ELEVATED)
                                .border_1()
                                .border_color(BORDER_SUBTLE)
                                .child(info_line("Lit Ready", if lit_ready { "yes" } else { "no" }))
                                .child(info_line("Lit Network", &lit_network))
                                .child(info_line("Auth PKP", &addr))
                                .child(
                                    div()
                                        .h_flex()
                                        .gap_2()
                                        .flex_wrap()
                                        .child(action_button(
                                            "Init Lit Context",
                                            !self.busy,
                                            true,
                                            cx.listener(|this, _, _, cx| this.init_lit_context(cx)),
                                        ))
                                        .child(action_button(
                                            "Execute Smoke Action",
                                            !self.busy && lit_ready,
                                            false,
                                            cx.listener(|this, _, _, cx| this.execute_smoke_action(cx)),
                                        ))
                                        .child(action_button(
                                            "Sign Smoke Payload",
                                            !self.busy && lit_ready,
                                            false,
                                            cx.listener(|this, _, _, cx| this.sign_smoke_payload(cx)),
                                        ))
                                        .child(action_button(
                                            "Sidecar Health",
                                            !self.busy,
                                            true,
                                            cx.listener(|this, _, _, cx| this.sidecar_health(cx)),
                                        ))
                                        .child(action_button(
                                            "Storage Status",
                                            !self.busy,
                                            false,
                                            cx.listener(|this, _, _, cx| this.sidecar_storage_status(cx)),
                                        ))
                                        .child(action_button(
                                            "Preflight 10MB",
                                            !self.busy,
                                            false,
                                            cx.listener(|this, _, _, cx| this.sidecar_preflight_smoke(cx)),
                                        ))
                                        .child(action_button(
                                            "Deposit+Approve $1",
                                            !self.busy,
                                            false,
                                            cx.listener(|this, _, _, cx| this.sidecar_deposit_and_approve(cx)),
                                        ))
                                        .child(action_button(
                                            "Encrypt+Upload File",
                                            !self.busy,
                                            true,
                                            cx.listener(|this, _, _, cx| this.sidecar_encrypt_upload_file(cx)),
                                        )),
                                )
                                .when_some(self.error.clone(), |el, error| {
                                    el.child(
                                        div()
                                            .text_sm()
                                            .text_color(hsla(0.0, 0.7, 0.7, 1.0))
                                            .child(format!("Error: {error}")),
                                    )
                                })
                                .when_some(self.last_action_response.clone(), |el, resp| {
                                    el.child(result_box("Last executeJs response", &resp))
                                })
                                .when_some(self.last_signature.clone(), |el, sig| {
                                    el.child(result_box("Last PKP signature response", &sig))
                                })
                                .when_some(self.last_sidecar_response.clone(), |el, resp| {
                                    el.child(result_box("Last Synapse sidecar response", &resp))
                                })
                                .child(
                                    div().text_xs().text_color(TEXT_DIM).child(
                                        "Env required: HEAVEN_LIT_RPC_URL (or LIT_RPC_URL). Synapse sidecar requires bun + sidecar deps.",
                                    ),
                                ),
                        )
                    }),
            )
    }
}

fn infer_track_meta_from_path(path: &Path) -> TrackMetaInput {
    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Track")
        .trim()
        .to_string();

    let split: Vec<&str> = file_name.split(" - ").collect();
    if split.len() >= 2 {
        let artist = split[0].trim().to_string();
        let title = split[1..].join(" - ").trim().to_string();
        if !title.is_empty() && !artist.is_empty() {
            return TrackMetaInput {
                title: Some(title),
                artist: Some(artist),
                album: Some(String::new()),
                mbid: None,
            };
        }
    }

    TrackMetaInput {
        title: Some(file_name),
        artist: Some("Unknown Artist".to_string()),
        album: Some(String::new()),
        mbid: None,
    }
}

fn info_line(label: &str, value: &str) -> impl IntoElement {
    div()
        .h_flex()
        .gap_2()
        .child(
            div()
                .text_sm()
                .text_color(TEXT_DIM)
                .min_w(px(120.))
                .child(format!("{label}:")),
        )
        .child(
            div()
                .text_sm()
                .text_color(TEXT_PRIMARY)
                .child(value.to_string()),
        )
}

fn result_box(title: &str, body: &str) -> impl IntoElement {
    div()
        .v_flex()
        .gap_2()
        .p_4()
        .rounded(px(10.))
        .bg(BG_ELEVATED)
        .border_1()
        .border_color(BORDER_SUBTLE)
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(TEXT_PRIMARY)
                .child(title.to_string()),
        )
        .child(
            div()
                .text_xs()
                .text_color(TEXT_MUTED)
                .child(body.to_string()),
        )
}

fn action_button(
    label: &'static str,
    enabled: bool,
    primary: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let bg = if primary { ACCENT_BLUE } else { BG_ELEVATED };
    let text = if primary {
        hsla(0., 0., 0.09, 1.)
    } else {
        TEXT_PRIMARY
    };

    div()
        .id(ElementId::Name(format!("settings-{label}").into()))
        .h_flex()
        .items_center()
        .justify_center()
        .px_4()
        .py(px(9.))
        .rounded(px(8.))
        .border_1()
        .border_color(BORDER_SUBTLE)
        .bg(if enabled { bg } else { BG_HOVER })
        .text_sm()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(text)
        .cursor_pointer()
        .when(enabled, |el| {
            el.on_click(move |ev, window, cx| on_click(ev, window, cx))
        })
        .child(label)
}
