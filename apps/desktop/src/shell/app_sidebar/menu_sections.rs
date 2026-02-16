use super::*;
use gpui_component::sidebar::{SidebarMenu, SidebarMenuItem};

pub(super) fn build_main_menu(active_page: Page, nav_tx: &Entity<NavChannel>) -> SidebarMenu {
    SidebarMenu::new().children([
        nav_item("Home", PhosphorIcon::House, Page::Home, active_page, nav_tx),
        nav_item(
            "Rooms",
            PhosphorIcon::MusicNotes,
            Page::Rooms,
            active_page,
            nav_tx,
        ),
        nav_item(
            "Messages",
            PhosphorIcon::ChatCircle,
            Page::Messages,
            active_page,
            nav_tx,
        ),
        nav_item(
            "Wallet",
            PhosphorIcon::Wallet,
            Page::Wallet,
            active_page,
            nav_tx,
        ),
        nav_item(
            "Schedule",
            PhosphorIcon::CalendarBlank,
            Page::Schedule,
            active_page,
            nav_tx,
        ),
        nav_item(
            "Profile",
            PhosphorIcon::User,
            Page::Profile,
            active_page,
            nav_tx,
        ),
    ])
}

pub(super) fn build_music_menu(
    active_page: Page,
    nav_tx: &Entity<NavChannel>,
    library_view: &Entity<library::LibraryView>,
    cx: &App,
) -> SidebarMenu {
    let playlists = library_view.read(cx).sidebar_playlists().to_vec();
    let active_playlist_id = library_view.read(cx).active_playlist_detail_id();
    let lib_for_playlists = library_view.clone();
    let lib_for_library_root = library_view.clone();
    let library_is_active = active_page == Page::MusicLibrary && active_playlist_id.is_none();

    let mut music_menu = SidebarMenu::new()
        .mt_6()
        .pt_4()
        .border_t_1()
        .border_color(hsla(0., 0., 0.21, 1.)) // --border-subtle
        .child(
            SidebarMenuItem::new("Library")
                .icon(PhosphorIcon::List)
                .active(library_is_active)
                .on_click({
                    let tx = nav_tx.clone();
                    move |_, _, cx| {
                        tx.update(cx, |ch, cx| {
                            ch.target = Some(Page::MusicLibrary);
                            cx.notify();
                        });
                        let _ = lib_for_library_root.update(cx, |view, cx| {
                            view.open_library_root(cx);
                        });
                    }
                }),
        )
        .child(nav_item(
            "Shared With Me",
            PhosphorIcon::ShareNetwork,
            Page::MusicShared,
            active_page,
            nav_tx,
        ));

    // Individual playlists as nav items
    for pl in playlists {
        let lib = lib_for_playlists.clone();
        let tx = nav_tx.clone();
        let pl_id = pl.id.clone();
        let pl_name = pl.name.clone();
        let is_active_playlist = active_page == Page::MusicLibrary
            && active_playlist_id
                .as_deref()
                .map(|id| id.eq_ignore_ascii_case(pl_id.as_str()))
                .unwrap_or(false);
        music_menu = music_menu.child(
            SidebarMenuItem::new(pl.name.clone())
                .icon(PhosphorIcon::Queue)
                .active(is_active_playlist)
                .on_click(move |_, _, cx| {
                    // Navigate to Library page first
                    tx.update(cx, |ch, cx| {
                        ch.target = Some(Page::MusicLibrary);
                        cx.notify();
                    });
                    let id = pl_id.clone();
                    let name = pl_name.clone();
                    let _ = lib.update(cx, |view, cx| {
                        view.open_playlist_detail(id, name, cx);
                    });
                }),
        );
    }

    music_menu
}

pub(super) fn build_bottom_menu(active_page: Page, nav_tx: &Entity<NavChannel>) -> SidebarMenu {
    SidebarMenu::new().children([nav_item(
        "Settings",
        PhosphorIcon::Gear,
        Page::Settings,
        active_page,
        nav_tx,
    )])
}
