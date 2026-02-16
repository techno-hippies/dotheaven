use super::*;

impl Render for WalletView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let auth_state = cx.global::<auth::AuthState>();
        let auth_addr = preferred_wallet_address(auth_state.persisted.as_ref())
            .unwrap_or_else(|| "0x0000...0000".to_string());
        let is_authed = auth_state.is_authenticated();
        self.maybe_fetch_balances(
            if is_authed {
                Some(auth_addr.as_str())
            } else {
                None
            },
            cx,
        );

        let display_addr = if is_authed {
            abbreviate_address(&auth_addr)
        } else {
            auth_addr.clone()
        };
        let assets = if is_authed {
            self.assets.clone()
        } else {
            zero_wallet_assets()
        };
        let total_balance = if is_authed {
            assets
                .iter()
                .map(|asset| asset.balance_usd_value)
                .sum::<f64>()
        } else {
            0.0
        };
        let total_balance_display = format!("${total_balance:.2}");

        let footer_text = if is_authed {
            if self.balances_loading {
                "Refreshing balances from RPC...".to_string()
            } else if let Some(err) = &self.balances_error {
                format!("RPC balance fetch issue: {err}")
            } else {
                self.status.clone()
            }
        } else {
            "Sign in to enable send/receive and on-chain actions.".to_string()
        };

        div()
            .id("wallet-root")
            .v_flex()
            .size_full()
            .overflow_y_scroll()
            .child(
                div()
                    .w_full()
                    .border_b_1()
                    .border_color(BORDER_SUBTLE())
                    .child(
                        div()
                            .w_full()
                            .max_w(px(920.))
                            .mx_auto()
                            .px_6()
                            .py_4()
                            .child(
                                div()
                                    .text_2xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(TEXT_PRIMARY())
                                    .child("Wallet"),
                            ),
                    ),
            )
            .child(
                div()
                    .w_full()
                    .max_w(px(920.))
                    .mx_auto()
                    .px_6()
                    .py_5()
                    .v_flex()
                    .gap_6()
                    .child(
                        div()
                            .v_flex()
                            .gap_4()
                            .p_5()
                            .rounded(px(12.))
                            .bg(BG_ELEVATED())
                            .border_1()
                            .border_color(BORDER_SUBTLE())
                            .child(
                                div()
                                    .v_flex()
                                    .gap_1()
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(TEXT_MUTED())
                                            .child("TOTAL BALANCE"),
                                    )
                                    .child(
                                        div()
                                            .text_3xl()
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(TEXT_PRIMARY())
                                            .child(total_balance_display),
                                    ),
                            )
                            .child(
                                div()
                                    .h_flex()
                                    .items_center()
                                    .gap_2()
                                    .child(
                                        div()
                                            .text_base()
                                            .text_color(TEXT_MUTED())
                                            .child(display_addr),
                                    )
                                    .when(is_authed, |el| {
                                        el.child(
                                            Clipboard::new("wallet-copy-address")
                                                .value(auth_addr.clone()),
                                        )
                                    }),
                            )
                            .child(
                                div()
                                    .h_flex()
                                    .gap_2()
                                    .child(div().flex_1().child(pill_action_button(
                                        "Receive",
                                        is_authed,
                                        true,
                                        cx.listener(|this, _, _, cx| {
                                            this.status =
                                                "Receive flow coming soon in GPUI wallet.".into();
                                            this.publish_status_info(
                                                "wallet.actions",
                                                this.status.clone(),
                                                cx,
                                            );
                                            cx.notify();
                                        }),
                                    )))
                                    .child(div().flex_1().child(pill_action_button(
                                        "Send",
                                        is_authed,
                                        false,
                                        cx.listener(|this, _, _, cx| {
                                            this.status =
                                                "Send flow coming soon in GPUI wallet.".into();
                                            this.publish_status_info(
                                                "wallet.actions",
                                                this.status.clone(),
                                                cx,
                                            );
                                            cx.notify();
                                        }),
                                    ))),
                            ),
                    )
                    .child(
                        div()
                            .v_flex()
                            .gap_2()
                            .child(
                                div()
                                    .text_xl()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(TEXT_PRIMARY())
                                    .child("Assets"),
                            )
                            .child(
                                div()
                                    .v_flex()
                                    .w_full()
                                    .rounded(px(10.))
                                    .bg(BG_ELEVATED())
                                    .border_1()
                                    .border_color(BORDER_SUBTLE())
                                    .overflow_hidden()
                                    .children(
                                        assets.iter().enumerate().map(|(index, asset)| {
                                            render_asset_row(asset, index > 0)
                                        }),
                                    ),
                            ),
                    )
                    .child(div().text_xs().text_color(TEXT_DIM()).child(footer_text)),
            )
    }
}
