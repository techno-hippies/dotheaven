use super::*;

use crate::auth;
use crate::shared::address::abbreviate_address;

pub(super) fn build_auth_button(cx: &App) -> impl IntoElement {
    let auth_state = cx.global::<auth::AuthState>();
    let is_authed = auth_state.is_authenticated();
    let auth_addr = auth_state.display_address().map(|a| a.to_string());
    let display_addr = auth_addr
        .as_deref()
        .map(abbreviate_address)
        .unwrap_or_else(|| "Connected".to_string());

    if is_authed {
        // Logged in: show abbreviated address as a pill
        div()
            .id("sidebar-auth")
            .h_flex()
            .w_full()
            .items_center()
            .gap_2()
            .px_3()
            .py(px(8.))
            .rounded_full()
            .bg(BG_ELEVATED)
            .cursor_pointer()
            .hover(|s| s.bg(hsla(0., 0., 0.19, 1.)))
            .on_click(move |_, _, cx| {
                let Some(addr) = auth_addr.clone() else {
                    cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
                        status.publish_error(
                            "auth.copy",
                            "Wallet address is unavailable; try signing in again.".to_string(),
                        );
                    });
                    return;
                };

                cx.write_to_clipboard(ClipboardItem::new_string(addr.clone()));
                cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
                    status.publish_success(
                        "auth.copy",
                        format!("Copied {}", abbreviate_address(&addr)),
                    );
                });
            })
            .child(
                gpui::svg()
                    .path("icons/wallet.svg")
                    .size(px(16.))
                    .text_color(ACCENT_BLUE),
            )
            .child(div().text_xs().text_color(TEXT_PRIMARY).child(display_addr))
    } else {
        // Not logged in: Sign In button
        div()
            .id("sidebar-auth")
            .h_flex()
            .w_full()
            .items_center()
            .justify_center()
            .px_3()
            .py(px(8.))
            .rounded_full()
            .bg(ACCENT_BLUE)
            .cursor_pointer()
            .hover(|s| s.bg(hsla(0.62, 0.93, 0.82, 1.)))
            .on_click(|_, _, cx| {
                cx.update_global::<auth::AuthState, _>(|state, _| {
                    state.authing = true;
                });
                cx.spawn(async |cx: &mut AsyncApp| {
                    let result = auth::run_auth_callback_server().await;
                    match result {
                        Ok(auth_result) => {
                            auth::log_auth_result("Sidebar sign-in callback", &auth_result);
                            let persisted = auth::to_persisted(&auth_result);
                            if let Err(e) = auth::save_to_disk(&persisted) {
                                log::error!("Failed to persist auth: {e}");
                            }
                            auth::log_persisted_auth("Sidebar sign-in persisted", &persisted);
                            let _ = cx.update_global::<auth::AuthState, _>(|state, _cx| {
                                state.persisted = Some(persisted);
                                state.authing = false;
                            });
                        }
                        Err(e) => {
                            log::error!("Auth failed: {e}");
                            let _ = cx.update_global::<auth::AuthState, _>(|state, _cx| {
                                state.authing = false;
                            });
                        }
                    }
                })
                .detach();
            })
            .child(
                div()
                    .text_sm()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(hsla(0., 0., 0.09, 1.))
                    .child("Sign In"),
            )
    }
}
