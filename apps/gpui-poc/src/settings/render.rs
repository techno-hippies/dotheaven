use super::helpers::*;
use super::*;

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
                                            cx.listener(|this, _, _, cx| this.storage_deposit_and_approve(cx)),
                                        ))
                                        .child(action_button(
                                            "Encrypt+Upload File",
                                            !self.busy,
                                            true,
                                            cx.listener(|this, _, _, cx| this.storage_encrypt_upload_file(cx)),
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
                                .when_some(self.last_storage_response.clone(), |el, resp| {
                                    el.child(result_box("Last storage response", &resp))
                                })
                                .when_some(self.last_voice_response.clone(), |el, resp| {
                                    el.child(result_box("Last JackTrip response", &resp))
                                })
                                .child(
                                    div().text_xs().text_color(TEXT_DIM).child(
                                        "Env required: HEAVEN_LIT_RPC_URL (or LIT_RPC_URL). For Load uploads use HEAVEN_LOAD_TURBO_UPLOAD_URL and optional HEAVEN_LOAD_TURBO_TOKEN (default ethereum). JackTrip local test uses localhost and HEAVEN_JACKTRIP_PORT (default 4464).",
                                    ),
                                ),
                        )
                    }),
            )
    }
}
