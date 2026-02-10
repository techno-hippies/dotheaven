use gpui::*;
use gpui_component::{
    sidebar::{Sidebar, SidebarHeader, SidebarMenu, SidebarMenuItem},
    StyledExt,
};

use crate::auth;
use crate::icons::PhosphorIcon;
use crate::pages::Page;

const ACCENT_BLUE: Hsla = Hsla { h: 0.62, s: 0.93, l: 0.76, a: 1. };
const BG_ELEVATED: Hsla = Hsla { h: 0., s: 0., l: 0.15, a: 1. };
const TEXT_PRIMARY: Hsla = Hsla { h: 0., s: 0., l: 0.98, a: 1. };

/// Abbreviate a hex address: 0x1234...abcd
fn abbreviate_address(addr: &str) -> String {
    if addr.len() > 10 {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    } else {
        addr.to_string()
    }
}

/// Build the sidebar to match the web app layout.
pub fn build_sidebar(
    active_page: Page,
    collapsed: bool,
    nav_tx: Entity<NavChannel>,
    cx: &App,
) -> impl IntoElement {
    // Main nav
    let main_menu = SidebarMenu::new().children([
        nav_item("Home", PhosphorIcon::House, Page::Home, active_page, &nav_tx),
        nav_item("Search", PhosphorIcon::MagnifyingGlass, Page::Community, active_page, &nav_tx),
        nav_item("Messages", PhosphorIcon::ChatCircle, Page::Messages, active_page, &nav_tx),
        nav_item("Wallet", PhosphorIcon::Wallet, Page::Wallet, active_page, &nav_tx),
        nav_item("Schedule", PhosphorIcon::CalendarBlank, Page::Schedule, active_page, &nav_tx),
        nav_item("Profile", PhosphorIcon::User, Page::Profile, active_page, &nav_tx),
    ]);

    // Music section — styled with top border to act as divider
    let music_menu = SidebarMenu::new()
        .mt_6()
        .pt_4()
        .border_t_1()
        .border_color(hsla(0., 0., 0.21, 1.)) // --border-subtle
        .children([
            nav_item("Discover", PhosphorIcon::Compass, Page::MusicDiscover, active_page, &nav_tx),
            nav_item("Library", PhosphorIcon::List, Page::MusicLibrary, active_page, &nav_tx),
            nav_item("Shared With Me", PhosphorIcon::ShareNetwork, Page::MusicShared, active_page, &nav_tx),
        ]);

    // Bottom actions — separate menu, stacked vertically
    let bottom_menu = SidebarMenu::new()
        .children([
            nav_item("Download", PhosphorIcon::DownloadSimple, Page::Download, active_page, &nav_tx),
            nav_item("Settings", PhosphorIcon::Gear, Page::Settings, active_page, &nav_tx),
        ]);

    // Auth button — show wallet address if logged in, or "Sign In" button
    let auth_state = cx.global::<auth::AuthState>();
    let is_authed = auth_state.is_authenticated();
    let display_addr = auth_state.display_address().map(|a| abbreviate_address(a));

    let auth_button = if is_authed {
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
            .child(
                gpui::svg()
                    .path("icons/wallet.svg")
                    .size(px(16.))
                    .text_color(ACCENT_BLUE),
            )
            .child(
                div()
                    .text_xs()
                    .text_color(TEXT_PRIMARY)
                    .child(display_addr.unwrap_or_else(|| "Connected".to_string())),
            )
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
                            let persisted = auth::to_persisted(&auth_result);
                            if let Err(e) = auth::save_to_disk(&persisted) {
                                log::error!("Failed to persist auth: {e}");
                            }
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
    };

    Sidebar::left()
        .collapsed(collapsed)
        .header(
            SidebarHeader::new().child(
                div()
                    .h_flex()
                    .items_center()
                    .px_1()
                    // Heaven logo — dark square with music note icon
                    .child(
                        div()
                            .size(px(36.))
                            .rounded(px(8.))
                            .bg(gpui::black())
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(
                                gpui::svg()
                                    .path("icons/music-notes.svg")
                                    .size(px(20.))
                                    .text_color(gpui::white()),
                            ),
                    ),
            ),
        )
        .child(main_menu)
        .child(music_menu)
        // Footer: Download, Settings, then auth button
        .footer(
            div()
                .v_flex()
                .w_full()
                .pb_3()
                .gap_2()
                .child(bottom_menu)
                .child(
                    div()
                        .px_3()
                        .pt_2()
                        .border_t_1()
                        .border_color(hsla(0., 0., 0.21, 1.))
                        .child(auth_button),
                ),
        )
}

fn nav_item(
    label: &'static str,
    icon: PhosphorIcon,
    page: Page,
    active: Page,
    nav_tx: &Entity<NavChannel>,
) -> SidebarMenuItem {
    let tx = nav_tx.clone();
    SidebarMenuItem::new(label)
        .icon(icon)
        .active(page == active)
        .on_click(move |_, _, cx| {
            tx.update(cx, |ch, cx| {
                ch.target = Some(page);
                cx.notify();
            });
        })
}

/// Simple channel entity for passing navigation events from sidebar to app.
pub struct NavChannel {
    pub target: Option<Page>,
}

impl NavChannel {
    pub fn new() -> Self {
        Self { target: None }
    }
}
