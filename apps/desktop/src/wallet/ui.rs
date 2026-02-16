use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::StyledExt;

use super::*;

pub(super) fn render_asset_row(asset: &WalletAssetRow, with_top_border: bool) -> impl IntoElement {
    div()
        .h_flex()
        .items_center()
        .justify_between()
        .w_full()
        .px_4()
        .py(px(10.))
        .when(with_top_border, |el| {
            el.border_t_1().border_color(BORDER_SUBTLE())
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
                                .text_color(TEXT_PRIMARY())
                                .child(asset.symbol),
                        )
                        .child(
                            div()
                                .text_base()
                                .text_color(TEXT_MUTED())
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
                        .text_color(TEXT_PRIMARY())
                        .child(asset.balance_usd_text.clone()),
                )
                .child(
                    div()
                        .text_base()
                        .text_color(TEXT_MUTED())
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
                .border_color(BG_ELEVATED())
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
                    .text_color(TEXT_PRIMARY())
                    .child(fallback_text.to_string()),
            )
            .into_any_element()
    }
}

fn resolve_wallet_asset_image(file_name: &str) -> Option<std::path::PathBuf> {
    let candidates = [
        format!("assets/images/{file_name}"),
        format!("apps/desktop/assets/images/{file_name}"),
    ];

    for candidate in candidates {
        let path = std::path::PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }

    None
}

pub(super) fn pill_action_button(
    label: &'static str,
    enabled: bool,
    primary: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let bg = if primary {
        ACCENT_BLUE()
    } else {
        BG_ELEVATED()
    };
    let text = if primary {
        hsla(0., 0., 0.09, 1.)
    } else {
        TEXT_PRIMARY()
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
        .border_color(BORDER_SUBTLE())
        .bg(if enabled { bg } else { BG_HOVER() })
        .text_base()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(text)
        .cursor_pointer()
        .when(enabled, |el| {
            el.on_click(move |ev, window, cx| on_click(ev, window, cx))
        })
        .child(label)
}
