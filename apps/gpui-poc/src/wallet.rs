//! Wallet page for native Lit (Rust SDK) flow in GPUI.

use std::sync::{Arc, Mutex};

use gpui::*;
use gpui::prelude::FluentBuilder;
use gpui_component::StyledExt;

use crate::auth;
use crate::lit_wallet::LitWalletService;

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

const SMOKE_ACTION_CODE: &str = r#"(async () => {
  const now = new Date().toISOString();
  Lit.Actions.setResponse({ response: JSON.stringify({ ok: true, source: "gpui-rust", now }) });
})();"#;

pub struct WalletView {
    auth: Option<auth::PersistedAuth>,
    service: Arc<Mutex<LitWalletService>>,
    busy: bool,
    status: String,
    last_action_response: Option<String>,
    last_signature: Option<String>,
    error: Option<String>,
}

impl WalletView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
        let auth = auth::load_from_disk();
        let mut error = None;
        let service = match LitWalletService::new() {
            Ok(s) => Arc::new(Mutex::new(s)),
            Err(e) => {
                error = Some(e);
                Arc::new(Mutex::new(
                    LitWalletService::new().unwrap_or_else(|_| panic!("Lit runtime initialization failed")),
                ))
            }
        };

        Self {
            auth,
            service,
            busy: false,
            status: "Idle".to_string(),
            last_action_response: None,
            last_signature: None,
            error,
        }
    }

    fn refresh_auth(&mut self, cx: &mut Context<Self>) {
        self.auth = auth::load_from_disk();
        self.error = None;
        cx.notify();
    }

    fn sign_in(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        self.busy = true;
        self.status = "Opening browser for wallet auth...".into();
        self.error = None;
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
                                this.auth = Some(persisted.clone());
                                this.status = format!(
                                    "Authenticated as {}",
                                    persisted
                                        .pkp_address
                                        .unwrap_or_else(|| "(unknown PKP address)".to_string())
                                );
                                this.error = None;
                            }
                            Err(e) => {
                                this.status = "Auth finished, but failed to persist".into();
                                this.error = Some(e);
                            }
                        }
                    }
                    Err(e) => {
                        this.status = "Authentication failed".into();
                        this.error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn logout(&mut self, cx: &mut Context<Self>) {
        auth::delete_from_disk();
        self.auth = None;
        self.last_action_response = None;
        self.last_signature = None;
        self.status = "Logged out".into();
        self.error = None;
        if let Ok(mut svc) = self.service.lock() {
            svc.clear();
        }
        cx.notify();
    }

    fn init_lit_context(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let persisted = match self.auth.clone() {
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
                svc.pkp_sign_ethereum(b"heaven-gpui:pkp-sign-smoke")
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(sig) => {
                        this.status = "PKP sign succeeded".into();
                        this.last_signature =
                            Some(serde_json::to_string_pretty(&sig).unwrap_or_else(|_| format!("{sig:?}")));
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
}

impl Render for WalletView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let auth_addr = self
            .auth
            .as_ref()
            .and_then(|a| a.pkp_address.clone())
            .unwrap_or_else(|| "Not signed in".to_string());
        let auth_pk = self
            .auth
            .as_ref()
            .and_then(|a| a.pkp_public_key.clone())
            .unwrap_or_else(|| "-".to_string());

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
            .id("wallet-root")
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
                    .child("Wallet (Rust Native Lit Flow)"),
            )
            .child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED)
                    .child("Proof-of-concept flow: browser auth -> PKP auth context -> executeJs -> PKP signing"),
            )
            .child(
                div()
                    .v_flex()
                    .gap_2()
                    .p_4()
                    .rounded(px(10.))
                    .bg(BG_ELEVATED)
                    .border_1()
                    .border_color(BORDER_SUBTLE)
                    .child(info_line("Status", &self.status))
                    .child(info_line("Auth PKP", &auth_addr))
                    .child(info_line("Auth Public Key", &auth_pk))
                    .child(info_line("Lit Ready", if lit_ready { "yes" } else { "no" }))
                    .child(info_line("Lit Network", &lit_network)),
            )
            .child(
                div()
                    .h_flex()
                    .gap_2()
                    .flex_wrap()
                    .child(action_button(
                        "Sign In",
                        !self.busy,
                        true,
                        cx.listener(|this, _, _, cx| this.sign_in(cx)),
                    ))
                    .child(action_button(
                        "Refresh Auth",
                        !self.busy,
                        false,
                        cx.listener(|this, _, _, cx| this.refresh_auth(cx)),
                    ))
                    .child(action_button(
                        "Logout",
                        !self.busy,
                        false,
                        cx.listener(|this, _, _, cx| this.logout(cx)),
                    ))
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
                el.child(
                    result_box("Last executeJs response", &resp),
                )
            })
            .when_some(self.last_signature.clone(), |el, sig| {
                el.child(
                    result_box("Last PKP signature response", &sig),
                )
            })
            .child(
                div()
                    .text_xs()
                    .text_color(TEXT_DIM)
                    .child("Env required for Lit network discovery: HEAVEN_LIT_RPC_URL (or LIT_RPC_URL)."),
            )
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
        .child(div().text_sm().text_color(TEXT_PRIMARY).child(value.to_string()))
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
        .id(ElementId::Name(label.into()))
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
