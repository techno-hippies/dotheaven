//! Wallet page for native Lit (Rust SDK) flow in GPUI.

use alloy_primitives::{Address, U256};
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{clipboard::Clipboard, StyledExt};

use crate::auth;

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

const RPC_SEPOLIA: &str =
    "https://g.w.lavanet.xyz:443/gateway/sep1/rpc-http/69b66aca774b0ee62a86d26675365f07";
const RPC_MEGA_TESTNET_V2: &str = "https://carrot.megaeth.com/rpc";
const RPC_MEGA_MAINNET: &str = "https://mainnet.megaeth.com/rpc";

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
                cx.notify();
            });
        })
        .detach();
    }
}

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
                    .border_color(BORDER_SUBTLE)
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
                                    .text_color(TEXT_PRIMARY)
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
                            .bg(BG_ELEVATED)
                            .border_1()
                            .border_color(BORDER_SUBTLE)
                            .child(
                                div()
                                    .v_flex()
                                    .gap_1()
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(TEXT_MUTED)
                                            .child("TOTAL BALANCE"),
                                    )
                                    .child(
                                        div()
                                            .text_3xl()
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(TEXT_PRIMARY)
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
                                            .text_color(TEXT_MUTED)
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
                                    .text_color(TEXT_PRIMARY)
                                    .child("Assets"),
                            )
                            .child(
                                div()
                                    .v_flex()
                                    .w_full()
                                    .rounded(px(10.))
                                    .bg(BG_ELEVATED)
                                    .border_1()
                                    .border_color(BORDER_SUBTLE)
                                    .overflow_hidden()
                                    .children(
                                        assets.iter().enumerate().map(|(index, asset)| {
                                            render_asset_row(asset, index > 0)
                                        }),
                                    ),
                            ),
                    )
                    .child(div().text_xs().text_color(TEXT_DIM).child(footer_text)),
            )
    }
}

#[derive(Clone)]
struct WalletAssetRow {
    symbol: &'static str,
    network: &'static str,
    balance_text: String,
    balance_usd_text: String,
    balance_usd_value: f64,
    icon: WalletIcon,
    chain_badge: WalletIcon,
}

#[derive(Clone, Copy)]
struct WalletAssetConfig {
    symbol: &'static str,
    network: &'static str,
    icon: WalletIcon,
    chain_badge: WalletIcon,
    rpc_url: &'static str,
    token_address: Option<&'static str>,
    token_decimals: u8,
    price_usd: f64,
}

#[derive(Clone, Copy)]
enum WalletIcon {
    Usdm,
    Ethereum,
    MegaEth,
}

const WALLET_ASSETS: [WalletAssetConfig; 3] = [
    WalletAssetConfig {
        symbol: "ETH",
        network: "Ethereum",
        icon: WalletIcon::Ethereum,
        chain_badge: WalletIcon::Ethereum,
        rpc_url: RPC_SEPOLIA,
        token_address: None,
        token_decimals: 18,
        price_usd: 3090.0,
    },
    WalletAssetConfig {
        symbol: "ETH",
        network: "MegaETH",
        icon: WalletIcon::Ethereum,
        chain_badge: WalletIcon::MegaEth,
        rpc_url: RPC_MEGA_TESTNET_V2,
        token_address: None,
        token_decimals: 18,
        price_usd: 3090.0,
    },
    WalletAssetConfig {
        symbol: "USDM",
        network: "MegaETH",
        icon: WalletIcon::Usdm,
        chain_badge: WalletIcon::MegaEth,
        rpc_url: RPC_MEGA_MAINNET,
        token_address: Some("0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7"),
        token_decimals: 18,
        price_usd: 1.0,
    },
];

fn zero_wallet_assets() -> Vec<WalletAssetRow> {
    WALLET_ASSETS
        .iter()
        .map(|cfg| WalletAssetRow {
            symbol: cfg.symbol,
            network: cfg.network,
            balance_text: "0.0000".to_string(),
            balance_usd_text: "$0.00".to_string(),
            balance_usd_value: 0.0,
            icon: cfg.icon,
            chain_badge: cfg.chain_badge,
        })
        .collect()
}

struct WalletBalancesFetchResult {
    rows: Vec<WalletAssetRow>,
    error: Option<String>,
}

async fn fetch_wallet_assets(address: String) -> WalletBalancesFetchResult {
    smol::unblock(move || fetch_wallet_assets_sync(&address)).await
}

fn fetch_wallet_assets_sync(address: &str) -> WalletBalancesFetchResult {
    if !is_evm_address(address) {
        return WalletBalancesFetchResult {
            rows: zero_wallet_assets(),
            error: Some("Invalid wallet address".to_string()),
        };
    }

    let mut rows = Vec::with_capacity(WALLET_ASSETS.len());
    let mut failures = Vec::new();

    for cfg in WALLET_ASSETS {
        let result = if let Some(token) = cfg.token_address {
            fetch_erc20_balance(cfg.rpc_url, token, address, cfg.token_decimals)
        } else {
            fetch_native_balance(cfg.rpc_url, address)
        };

        match result {
            Ok(balance) => {
                let usd = balance * cfg.price_usd;
                rows.push(WalletAssetRow {
                    symbol: cfg.symbol,
                    network: cfg.network,
                    balance_text: format!("{balance:.4}"),
                    balance_usd_text: format!("${usd:.2}"),
                    balance_usd_value: usd,
                    icon: cfg.icon,
                    chain_badge: cfg.chain_badge,
                });
            }
            Err(err) => {
                failures.push(format!("{} {}", cfg.symbol, cfg.network));
                log::warn!(
                    "[Wallet] Failed to fetch {} {}: {}",
                    cfg.symbol,
                    cfg.network,
                    err
                );
                rows.push(WalletAssetRow {
                    symbol: cfg.symbol,
                    network: cfg.network,
                    balance_text: "0.0000".to_string(),
                    balance_usd_text: "$0.00".to_string(),
                    balance_usd_value: 0.0,
                    icon: cfg.icon,
                    chain_badge: cfg.chain_badge,
                });
            }
        }
    }

    let error = if failures.is_empty() {
        None
    } else if failures.len() == WALLET_ASSETS.len() {
        Some("Failed to fetch balances from RPC".to_string())
    } else {
        Some(format!(
            "Partial RPC failures ({}/{})",
            failures.len(),
            WALLET_ASSETS.len()
        ))
    };

    WalletBalancesFetchResult { rows, error }
}

fn fetch_native_balance(rpc_url: &str, address: &str) -> Result<f64, String> {
    let result = rpc_json(
        rpc_url,
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getBalance",
            "params": [address, "latest"]
        }),
    )?;
    let wei_hex = result
        .as_str()
        .ok_or("eth_getBalance result is not a string".to_string())?;
    let wei = parse_hex_u256(wei_hex)?;
    Ok(u256_to_units(wei, 18))
}

fn fetch_erc20_balance(
    rpc_url: &str,
    token_address: &str,
    user_address: &str,
    default_decimals: u8,
) -> Result<f64, String> {
    let balance_call_data = encode_balance_of_call(user_address)?;
    let balance_hex = rpc_eth_call(rpc_url, token_address, &balance_call_data)?;
    let raw_balance = parse_hex_u256(&balance_hex)?;

    let decimals = match rpc_eth_call(rpc_url, token_address, "0x313ce567")
        .and_then(|hex| parse_hex_u8_word(&hex))
    {
        Ok(value) => value,
        Err(err) => {
            log::warn!(
                "[Wallet] decimals() failed for token {}: {}. Falling back to {}",
                token_address,
                err,
                default_decimals
            );
            default_decimals
        }
    };

    Ok(u256_to_units(raw_balance, decimals as u32))
}

fn encode_balance_of_call(user_address: &str) -> Result<String, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("invalid user address: {e}"))?;

    let mut data = String::from("0x70a08231");
    data.push_str("000000000000000000000000");
    data.push_str(&hex::encode(user.as_slice()));
    Ok(data)
}

fn rpc_eth_call(rpc_url: &str, to: &str, data: &str) -> Result<String, String> {
    let result = rpc_json(
        rpc_url,
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_call",
            "params": [
                {
                    "to": to,
                    "data": data,
                },
                "latest"
            ]
        }),
    )?;
    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or("eth_call result is not a string".to_string())
}

fn rpc_json(rpc_url: &str, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut resp = ureq::post(rpc_url)
        .header("content-type", "application/json")
        .send_json(payload)
        .map_err(|e| format!("RPC request failed: {e}"))?;
    let body: serde_json::Value = resp
        .body_mut()
        .read_json()
        .map_err(|e| format!("RPC parse failed: {e}"))?;
    if let Some(err) = body.get("error") {
        return Err(format!("RPC error: {err}"));
    }
    body.get("result")
        .cloned()
        .ok_or("RPC response missing result".to_string())
}

fn parse_hex_u256(value: &str) -> Result<U256, String> {
    let trimmed = value.trim_start_matches("0x");
    if trimmed.is_empty() {
        return Ok(U256::ZERO);
    }
    U256::from_str_radix(trimmed, 16).map_err(|e| format!("invalid hex u256: {e}"))
}

fn parse_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let s = value.trim();
    if s == "0x" {
        return Ok(Vec::new());
    }
    hex::decode(s.trim_start_matches("0x")).map_err(|e| format!("invalid hex bytes: {e}"))
}

fn parse_hex_u8_word(value: &str) -> Result<u8, String> {
    let bytes = parse_hex_bytes(value)?;
    bytes
        .last()
        .copied()
        .ok_or("empty hex word for u8 decode".to_string())
}

fn u256_to_units(value: U256, decimals: u32) -> f64 {
    let raw = value.to_string().parse::<f64>().unwrap_or(0.0);
    let scale = 10f64.powi(decimals as i32);
    raw / scale
}

fn is_evm_address(value: &str) -> bool {
    value.parse::<Address>().is_ok()
}

fn render_asset_row(asset: &WalletAssetRow, with_top_border: bool) -> impl IntoElement {
    div()
        .h_flex()
        .items_center()
        .justify_between()
        .w_full()
        .px_4()
        .py(px(10.))
        .when(with_top_border, |el| {
            el.border_t_1().border_color(BORDER_SUBTLE)
        })
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_3()
                .child(render_wallet_icon_with_badge(asset.icon, asset.chain_badge))
                .child(
                    div()
                        .v_flex()
                        .gap_1()
                        .child(
                            div()
                                .text_base()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(TEXT_PRIMARY)
                                .child(asset.symbol),
                        )
                        .child(
                            div()
                                .text_base()
                                .text_color(TEXT_MUTED)
                                .child(asset.network),
                        ),
                ),
        )
        .child(
            div()
                .v_flex()
                .items_end()
                .gap_1()
                .child(
                    div()
                        .text_base()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(TEXT_PRIMARY)
                        .child(asset.balance_usd_text.clone()),
                )
                .child(
                    div()
                        .text_base()
                        .text_color(TEXT_MUTED)
                        .child(asset.balance_text.clone()),
                ),
        )
}

fn render_wallet_icon_with_badge(icon: WalletIcon, badge: WalletIcon) -> impl IntoElement {
    div()
        .relative()
        .size(px(40.))
        .child(render_wallet_icon(icon, 40.0))
        .child(
            div()
                .absolute()
                .right_0()
                .bottom_0()
                .size(px(18.))
                .rounded_full()
                .bg(gpui::black())
                .border_1()
                .border_color(BG_ELEVATED)
                .flex()
                .items_center()
                .justify_center()
                .child(render_wallet_icon(badge, 14.0)),
        )
}

fn render_wallet_icon(icon: WalletIcon, size: f32) -> AnyElement {
    match icon {
        WalletIcon::Ethereum => gpui::svg()
            .path("icons/ethereum.svg")
            .size(px(size))
            .into_any_element(),
        WalletIcon::MegaEth => gpui::svg()
            .path("icons/megaeth.svg")
            .size(px(size))
            .into_any_element(),
        WalletIcon::Usdm => {
            render_wallet_png_or_fallback("usdm.png", "M", hsla(0.0, 0.0, 0.80, 1.0), size)
        }
    }
}

fn render_wallet_png_or_fallback(
    file_name: &str,
    fallback_text: &str,
    fallback_bg: Hsla,
    size: f32,
) -> AnyElement {
    if let Some(path) = resolve_wallet_asset_image(file_name) {
        gpui::img(path)
            .size(px(size))
            .object_fit(ObjectFit::Cover)
            .into_any_element()
    } else {
        div()
            .size(px(size))
            .rounded_full()
            .bg(fallback_bg)
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_size(px((size * 0.38).max(7.0)))
                    .font_weight(FontWeight::BOLD)
                    .text_color(TEXT_PRIMARY)
                    .child(fallback_text.to_string()),
            )
            .into_any_element()
    }
}

fn resolve_wallet_asset_image(file_name: &str) -> Option<std::path::PathBuf> {
    let candidates = [
        format!("assets/images/{file_name}"),
        format!("apps/gpui-poc/assets/images/{file_name}"),
    ];

    for candidate in candidates {
        let path = std::path::PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }

    None
}

fn preferred_wallet_address(auth: Option<&auth::PersistedAuth>) -> Option<String> {
    let auth = auth?;
    // EOA-auth users should see their connected wallet address first.
    if auth.auth_method_type == Some(1) {
        auth.eoa_address
            .clone()
            .or_else(|| auth.pkp_address.clone())
    } else {
        auth.pkp_address
            .clone()
            .or_else(|| auth.eoa_address.clone())
    }
}

fn abbreviate_address(addr: &str) -> String {
    if addr.len() > 10 {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    } else {
        addr.to_string()
    }
}

fn pill_action_button(
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
        .id(ElementId::Name(format!("wallet-pill-{label}").into()))
        .h_flex()
        .items_center()
        .justify_center()
        .w_full()
        .px_4()
        .py(px(10.))
        .rounded_full()
        .border_1()
        .border_color(BORDER_SUBTLE)
        .bg(if enabled { bg } else { BG_HOVER })
        .text_base()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(text)
        .cursor_pointer()
        .when(enabled, |el| {
            el.on_click(move |ev, window, cx| on_click(ev, window, cx))
        })
        .child(label)
}
