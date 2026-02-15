use gpui::*;
use gpui_component::{
    sidebar::{Sidebar, SidebarMenuItem},
    StyledExt,
};

use crate::icons::PhosphorIcon;
use crate::library;
use crate::pages::Page;

mod auth_button;
mod header;
mod menu_sections;

const ACCENT_BLUE: Hsla = Hsla {
    h: 0.62,
    s: 0.93,
    l: 0.76,
    a: 1.,
};
const BG_ELEVATED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.15,
    a: 1.,
};
const TEXT_PRIMARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.98,
    a: 1.,
};

/// Build the sidebar to match the web app layout.
pub fn build_sidebar(
    active_page: Page,
    collapsed: bool,
    nav_tx: Entity<NavChannel>,
    library_view: &Entity<library::LibraryView>,
    cx: &App,
) -> impl IntoElement {
    let main_menu = menu_sections::build_main_menu(active_page, &nav_tx);
    let music_menu = menu_sections::build_music_menu(active_page, &nav_tx, library_view, cx);
    let bottom_menu = menu_sections::build_bottom_menu(active_page, &nav_tx);
    let auth_button = auth_button::build_auth_button(cx);

    Sidebar::left()
        .collapsed(collapsed)
        .header(header::build_sidebar_header())
        .child(main_menu)
        .child(music_menu)
        // Footer: Playlists, Download, Settings, then auth button
        .footer(
            div().v_flex().w_full().gap_2().child(bottom_menu).child(
                div()
                    .h(px(60.))
                    .h_flex()
                    .items_center()
                    .px_3()
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
