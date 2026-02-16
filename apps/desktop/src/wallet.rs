//! Wallet page for native Lit (Rust SDK) flow in GPUI.

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{clipboard::Clipboard, StyledExt};

use crate::auth;
use crate::shared::address::abbreviate_address;

mod auth_helpers;
mod fetch;
mod models;
mod render;
mod status_events;
mod ui;

use auth_helpers::*;
use fetch::fetch_wallet_assets;
use models::*;
use ui::{pill_action_button, render_asset_row};

use crate::app_colors;

macro_rules! define_color_fns {
    ($($name:ident => $field:ident),* $(,)?) => {
        $(
            #[allow(non_snake_case)]
            fn $name() -> Hsla { app_colors::colors().$field }
        )*
    };
}

define_color_fns! {
    BG_ELEVATED => bg_elevated,
    BG_HOVER => bg_hover,
    BORDER_SUBTLE => border_subtle,
    TEXT_PRIMARY => text_primary,
    TEXT_MUTED => text_muted,
    TEXT_DIM => text_dim,
    ACCENT_BLUE => accent_blue,
}

pub struct WalletView {
    status: String,
    assets: Vec<WalletAssetRow>,
    balances_loading: bool,
    balances_error: Option<String>,
    balances_for_address: Option<String>,
}

impl WalletView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
        Self {
            status: "Idle".to_string(),
            assets: zero_wallet_assets(),
            balances_loading: false,
            balances_error: None,
            balances_for_address: None,
        }
    }

    fn maybe_fetch_balances(&mut self, address: Option<&str>, cx: &mut Context<Self>) {
        let Some(address) = address else {
            self.assets = zero_wallet_assets();
            self.balances_loading = false;
            self.balances_error = None;
            self.balances_for_address = None;
            return;
        };

        if self.balances_loading {
            return;
        }
        if self.balances_for_address.as_deref() == Some(address) {
            return;
        }

        self.balances_loading = true;
        self.balances_error = None;
        let address = address.to_string();
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = fetch_wallet_assets(address.clone()).await;
            let _ = this.update(cx, |this, cx| {
                this.balances_loading = false;
                this.balances_for_address = Some(address.clone());
                this.assets = result.rows;
                this.balances_error = result.error;
                if let Some(err) = this.balances_error.clone() {
                    if err.to_ascii_lowercase().contains("partial") {
                        this.publish_status_info(
                            "wallet.balances",
                            format!("Wallet balances refreshed with warnings: {err}"),
                            cx,
                        );
                    } else {
                        this.publish_status_error(
                            "wallet.balances",
                            format!("Wallet balance refresh failed: {err}"),
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
