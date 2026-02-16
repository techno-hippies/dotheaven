use super::helpers::*;
use super::*;
use gpui_component::select::Select;
use gpui_component::Sizable;

impl Render for SettingsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let auth_state = cx.global::<auth::AuthState>();
        let addr = auth_state
            .persisted
            .as_ref()
            .and_then(|a| a.pkp_address.clone());
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
            .gap_6()
            // ── Header ──
            .child(
                div()
                    .text_2xl()
                    .font_weight(FontWeight::BOLD)
                    .text_color(TEXT_PRIMARY())
                    .child("Settings"),
            )
            // ── Account ──
            .child(self.render_account_section(is_authed, addr.as_deref(), cx))
            // ── Appearance ──
            .child(self.render_appearance_section(cx))
            // ── Developer Tools (collapsible) ──
            .child(self.render_dev_tools_section(
                lit_ready,
                &lit_network,
                addr.as_deref().unwrap_or("N/A"),
                cx,
            ))
    }
}

impl SettingsView {
    fn render_account_section(
        &self,
        is_authed: bool,
        addr: Option<&str>,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        div()
            .v_flex()
            .gap_3()
            .child(section_heading("Account"))
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .rounded(px(6.))
                    .bg(BG_ELEVATED())
                    .border_1()
                    .border_color(BORDER_SUBTLE())
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .v_flex()
                                    .gap_1()
                                    .child(
                                        div().text_base().text_color(TEXT_MUTED()).child("Wallet"),
                                    )
                                    .child(
                                        div().text_base().text_color(TEXT_PRIMARY()).child(
                                            addr.map(|a| {
                                                if a.len() > 14 {
                                                    format!("{}...{}", &a[..6], &a[a.len() - 4..])
                                                } else {
                                                    a.to_string()
                                                }
                                            })
                                            .unwrap_or_else(|| "Not signed in".to_string()),
                                        ),
                                    ),
                            )
                            .child(
                                div()
                                    .h_flex()
                                    .gap_2()
                                    .when(!is_authed, |el| {
                                        el.child(action_button(
                                            "Sign In",
                                            !self.busy,
                                            true,
                                            cx.listener(|this, _, _, cx| this.sign_in(cx)),
                                        ))
                                    })
                                    .when(is_authed, |el| {
                                        el.child(
                                            div()
                                                .id("settings-logout")
                                                .h_flex()
                                                .items_center()
                                                .justify_center()
                                                .px_4()
                                                .py(px(9.))
                                                .rounded_full()
                                                .bg(ACCENT_RED())
                                                .cursor_pointer()
                                                .hover(|s| s.bg(BG_HOVER()))
                                                .on_click(
                                                    cx.listener(|this, _, _, cx| this.logout(cx)),
                                                )
                                                .child(
                                                    div()
                                                        .text_base()
                                                        .font_weight(FontWeight::SEMIBOLD)
                                                        .text_color(TEXT_PRIMARY())
                                                        .child("Log Out"),
                                                ),
                                        )
                                    }),
                            ),
                    ),
            )
    }

    fn render_appearance_section(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .v_flex()
            .gap_3()
            .child(section_heading("Appearance"))
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .rounded(px(6.))
                    .bg(BG_ELEVATED())
                    .border_1()
                    .border_color(BORDER_SUBTLE())
                    // Theme select dropdown
                    .child(
                        div()
                            .v_flex()
                            .gap_2()
                            .child(div().text_base().text_color(TEXT_MUTED()).child("Theme"))
                            .child(
                                div().max_w(px(300.)).child(
                                    Select::new(&self.theme_select)
                                        .placeholder("Select a theme")
                                        .with_size(gpui_component::Size::Medium),
                                ),
                            ),
                    )
                    // Import custom theme
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_3()
                            .child(action_button(
                                "Import Custom Theme",
                                true,
                                false,
                                cx.listener(|this, _, _, cx| this.import_zed_theme(cx)),
                            ))
                            .child(
                                div()
                                    .text_base()
                                    .text_color(TEXT_DIM())
                                    .child("Customize at zed.dev/theme-builder"),
                            ),
                    ),
            )
    }

    fn render_dev_tools_section(
        &self,
        lit_ready: bool,
        lit_network: &str,
        addr: &str,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let chevron = if self.show_dev_tools { "▾" } else { "▸" };

        div()
            .v_flex()
            .gap_3()
            // Clickable header row
            .child(
                div()
                    .id("dev-tools-toggle")
                    .h_flex()
                    .items_center()
                    .gap_2()
                    .cursor_pointer()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.show_dev_tools = !this.show_dev_tools;
                        cx.notify();
                    }))
                    .child(
                        div()
                            .text_base()
                            .text_color(TEXT_MUTED())
                            .child(chevron),
                    )
                    .child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(TEXT_MUTED())
                            .child("Developer Tools"),
                    ),
            )
            .when(self.show_dev_tools, |el| {
                el.child(
                    div()
                        .v_flex()
                        .gap_3()
                        .p_4()
                        .rounded(px(6.))
                        .bg(BG_ELEVATED())
                        .border_1()
                        .border_color(BORDER_SUBTLE())
                        .child(info_line("Lit Ready", if lit_ready { "yes" } else { "no" }))
                        .child(info_line("Lit Network", lit_network))
                        .child(info_line("Auth PKP", addr))
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
                                    "Refresh Auth",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| this.refresh_auth(cx)),
                                ))
                                .child(action_button(
                                    "Storage Health",
                                    !self.busy,
                                    true,
                                    cx.listener(|this, _, _, cx| this.storage_health(cx)),
                                ))
                                .child(action_button(
                                    "Storage Status",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| this.storage_status(cx)),
                                ))
                                .child(action_button(
                                    "Preflight 10MB",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| this.storage_preflight_smoke(cx)),
                                ))
                                .child(action_button(
                                    "Funding Check",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| {
                                        this.storage_deposit_and_approve(cx)
                                    }),
                                ))
                                .child(action_button(
                                    "Encrypt+Upload File",
                                    !self.busy,
                                    true,
                                    cx.listener(|this, _, _, cx| {
                                        this.storage_encrypt_upload_file(cx)
                                    }),
                                ))
                                .child(action_button(
                                    "JT Server On",
                                    !self.busy,
                                    true,
                                    cx.listener(|this, _, _, cx| {
                                        this.jacktrip_start_local_server(cx)
                                    }),
                                ))
                                .child(action_button(
                                    "JT Server Off",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| {
                                        this.jacktrip_stop_local_server(cx)
                                    }),
                                ))
                                .child(action_button(
                                    "JT Connect Local",
                                    !self.busy,
                                    true,
                                    cx.listener(|this, _, _, cx| {
                                        this.jacktrip_connect_local_client(cx)
                                    }),
                                ))
                                .child(action_button(
                                    "JT Disconnect",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| {
                                        this.jacktrip_disconnect_client(cx)
                                    }),
                                ))
                                .child(action_button(
                                    "JT List Ports",
                                    !self.busy,
                                    false,
                                    cx.listener(|this, _, _, cx| this.jacktrip_list_ports(cx)),
                                )),
                        )
                        .when_some(self.error.clone(), |el, error| {
                            el.child(
                                div()
                                    .text_base()
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
                        .when_some(self.last_storage_response.clone(), |el, resp| {
                            el.child(result_box("Last storage response", &resp))
                        })
                        .when_some(self.last_voice_response.clone(), |el, resp| {
                            el.child(result_box("Last JackTrip response", &resp))
                        })
                        .child(
                            div().text_base().text_color(TEXT_DIM()).child(
                                "Env: HEAVEN_LIT_RPC_URL, HEAVEN_LOAD_TURBO_UPLOAD_URL, HEAVEN_JACKTRIP_PORT (default 4464).",
                            ),
                        ),
                )
            })
    }
}

fn section_heading(label: &str) -> impl IntoElement {
    div()
        .text_base()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(TEXT_PRIMARY())
        .child(label.to_string())
}
