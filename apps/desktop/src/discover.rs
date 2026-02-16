//! Discover (Home) page.
//!
//! Replaces the old social feed home with a music-first discover experience:
//! - Trending Rooms (horizontal scroll)
//! - New Releases (Story ipId tracks; horizontal scroll)
//! - Top Songs (global scrobbles)

use std::env;

use gpui::prelude::FluentBuilder;
use gpui::StatefulInteractiveElement as _;
use gpui::*;
use gpui_component::menu::PopupMenuItem;
use gpui_component::scroll::ScrollableElement;
use gpui_component::switch::Switch;
use gpui_component::theme::Theme;
use gpui_component::ActiveTheme;
use gpui_component::Sizable;
use gpui_component::StyledExt;
use serde_json::Value;

use crate::library;
use crate::pages::Page;
use crate::shared::{ipfs, rpc::http_post_json};
use crate::shell::app_sidebar::NavChannel;
use crate::ui::overflow_menu::track_row_overflow_menu;

const MAX_TRENDING_ROOMS: usize = 10;
const MAX_NEW_RELEASES: usize = 10;
const MAX_TOP_SONGS: usize = 10;

const DEFAULT_SUBGRAPH_ACTIVITY_URL: &str =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TopSongsMode {
    All,
    Verified,
}

#[derive(Debug, Clone)]
struct TrendingRoom {
    title: String,
    subtitle: String,
    hue: f32,
}

#[derive(Debug, Clone)]
struct ReleaseRow {
    track_id: String,
    title: String,
    artist: String,
    album: String,
    cover_cid: Option<String>,
    registered_at_sec: u64,
}

#[derive(Debug, Clone)]
struct TopSongRow {
    title: String,
    artist: String,
    album: String,
    cover_cid: Option<String>,
    play_count_total: u64,
    play_count_verified: u64,
}

pub struct DiscoverView {
    nav_channel: Entity<NavChannel>,
    library_view: Entity<library::LibraryView>,
    trending_rooms: Vec<TrendingRoom>,
    trending_scroll_handle: ScrollHandle,

    releases_loading: bool,
    releases_error: Option<String>,
    releases_fetch_seq: u64,
    new_releases: Vec<ReleaseRow>,
    releases_scroll_handle: ScrollHandle,

    top_songs_mode: TopSongsMode,
    top_songs_loading: bool,
    top_songs_error: Option<String>,
    top_songs_fetch_seq: u64,
    top_songs: Vec<TopSongRow>,
}

impl DiscoverView {
    pub fn new(
        nav_channel: Entity<NavChannel>,
        library_view: Entity<library::LibraryView>,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut this = Self {
            nav_channel,
            library_view,
            trending_rooms: seed_trending_rooms(),
            trending_scroll_handle: ScrollHandle::new(),
            releases_loading: false,
            releases_error: None,
            releases_fetch_seq: 0,
            new_releases: Vec::new(),
            releases_scroll_handle: ScrollHandle::new(),
            top_songs_mode: TopSongsMode::All,
            top_songs_loading: false,
            top_songs_error: None,
            top_songs_fetch_seq: 0,
            top_songs: Vec::new(),
        };

        cx.observe_global::<crate::scrobble_refresh::ScrobbleRefreshSignal>(|this, cx| {
            this.refresh_top_songs_force(cx);
            cx.notify();
        })
        .detach();

        this.refresh_new_releases(cx);
        this.refresh_top_songs(cx);
        this
    }

    fn open_rooms(&mut self, cx: &mut Context<Self>) {
        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::Rooms);
            cx.notify();
        });
    }

    fn open_artist(&mut self, artist_name: impl Into<String>, cx: &mut Context<Self>) {
        let artist_name = artist_name.into();
        if artist_name.trim().is_empty() {
            return;
        }

        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::MusicLibrary);
            cx.notify();
        });

        let _ = self.library_view.update(cx, |view, cx| {
            view.open_artist_page(artist_name, cx);
        });
    }

    fn open_album(
        &mut self,
        artist_name: impl Into<String>,
        album_name: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let artist_name = artist_name.into();
        if artist_name.trim().is_empty() {
            return;
        }

        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::MusicLibrary);
            cx.notify();
        });

        let _ = self.library_view.update(cx, |view, cx| {
            view.open_album_page(artist_name, album_name, cx);
        });
    }

    fn toggle_top_songs_mode(&mut self, cx: &mut Context<Self>) {
        self.top_songs_mode = match self.top_songs_mode {
            TopSongsMode::All => TopSongsMode::Verified,
            TopSongsMode::Verified => TopSongsMode::All,
        };
        self.refresh_top_songs_force(cx);
        cx.notify();
    }

    fn refresh_new_releases(&mut self, cx: &mut Context<Self>) {
        if self.releases_loading {
            return;
        }

        self.releases_loading = true;
        self.releases_error = None;
        self.releases_fetch_seq = self.releases_fetch_seq.wrapping_add(1);
        let fetch_seq = self.releases_fetch_seq;
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || fetch_latest_tracks(MAX_NEW_RELEASES)).await;
            let _ = this.update(cx, |this, cx| {
                if this.releases_fetch_seq != fetch_seq {
                    return;
                }
                this.releases_loading = false;
                match result {
                    Ok(rows) => {
                        this.new_releases = rows;
                        this.releases_error = None;
                    }
                    Err(err) => {
                        this.releases_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn refresh_top_songs(&mut self, cx: &mut Context<Self>) {
        self.refresh_top_songs_inner(false, cx);
    }

    fn refresh_top_songs_force(&mut self, cx: &mut Context<Self>) {
        self.refresh_top_songs_inner(true, cx);
    }

    fn refresh_top_songs_inner(&mut self, force: bool, cx: &mut Context<Self>) {
        if !force && !self.top_songs.is_empty() {
            return;
        }

        if self.top_songs_loading {
            return;
        }

        let had_cached_rows = !self.top_songs.is_empty();
        self.top_songs_error = None;
        self.top_songs_loading = true;
        self.top_songs_fetch_seq = self.top_songs_fetch_seq.wrapping_add(1);
        let fetch_seq = self.top_songs_fetch_seq;
        if !had_cached_rows {
            cx.notify();
        }

        let mode = self.top_songs_mode;
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || fetch_top_songs(mode, MAX_TOP_SONGS)).await;
            let _ = this.update(cx, |this, cx| {
                if this.top_songs_fetch_seq != fetch_seq {
                    return;
                }
                this.top_songs_loading = false;
                match result {
                    Ok(rows) => {
                        this.top_songs = rows;
                        this.top_songs_error = None;
                    }
                    Err(err) => {
                        this.top_songs_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}

impl Render for DiscoverView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme().clone();
        let entity = cx.entity().clone();

        div()
            .id("discover-scroll")
            .v_flex()
            .flex_1()
            .size_full()
            .overflow_y_scrollbar()
            .px_6()
            .py_6()
            .gap_10()
            .child(render_trending_rooms(
                &self.trending_rooms,
                &self.trending_scroll_handle,
                &theme,
                cx,
            ))
            .child(render_new_releases(
                self.releases_loading,
                self.releases_error.as_deref(),
                &self.new_releases,
                &self.releases_scroll_handle,
                &theme,
                cx,
            ))
            .child(render_top_songs_section(
                self.top_songs_mode,
                self.top_songs_loading,
                self.top_songs_error.as_deref(),
                &self.top_songs,
                entity,
                cx,
            ))
    }
}

/// Apply horizontal scroll with vertical-wheel translation to a row container.
fn h_scroll_row(
    id: impl Into<ElementId>,
    scroll_handle: &ScrollHandle,
    cx: &mut Context<DiscoverView>,
) -> Stateful<Div> {
    let handle = scroll_handle.clone();
    div()
        .id(id)
        .h_flex()
        .w_full()
        .min_w_0()
        .gap_4()
        .track_scroll(scroll_handle)
        .overflow_x_scroll()
        .on_scroll_wheel(
            cx.listener(move |_this, ev: &ScrollWheelEvent, _window, cx| {
                let delta = ev.delta.pixel_delta(px(18.));
                let dx = if delta.x != px(0.) { delta.x } else { delta.y };
                if dx == px(0.) {
                    return;
                }

                let cur = handle.offset();
                let mut next = cur;
                next.x -= dx;

                let max_x = handle.max_offset().width;
                if max_x > px(0.) {
                    next.x = next.x.max(-max_x);
                }
                next.x = next.x.min(px(0.));

                if next.x != cur.x {
                    handle.set_offset(next);
                    cx.stop_propagation();
                }
            }),
        )
        .pb_2()
}

fn render_section_header(title: &str, theme: &Theme) -> impl IntoElement {
    div().h_flex().items_center().justify_between().child(
        div()
            .text_base()
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(theme.foreground)
            .child(title.to_string()),
    )
}

fn render_trending_rooms(
    rooms: &[TrendingRoom],
    scroll_handle: &ScrollHandle,
    theme: &Theme,
    cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    let rooms = rooms.iter().take(MAX_TRENDING_ROOMS).enumerate();
    let scroll_handle = scroll_handle.clone();

    div()
        .v_flex()
        .gap_4()
        .child(render_section_header("Trending", theme))
        .child(
            h_scroll_row("discover-trending-rooms-row", &scroll_handle, cx)
                .children(rooms.map(|(idx, room)| render_room_tile(idx, room, theme, cx))),
        )
}

fn render_room_tile(
    idx: usize,
    room: &TrendingRoom,
    theme: &Theme,
    cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    // A "cover" with a color wash to mimic artwork, since rooms don't have images yet.
    let cover_bg = hsla(room.hue, 0.55, 0.26, 1.);
    let cover_bg_2 = hsla((room.hue + 0.08) % 1.0, 0.65, 0.22, 1.);

    div()
        .id(("discover-room-tile", idx))
        .w(px(150.))
        .flex_shrink_0()
        .v_flex()
        .gap_2()
        .cursor_pointer()
        .hover(|s| s.opacity(0.92))
        .on_click(cx.listener(|this, _ev, _window, cx| {
            this.open_rooms(cx);
        }))
        .child(
            div()
                .size(px(150.))
                .relative()
                .rounded(px(16.))
                .overflow_hidden()
                .bg(cover_bg)
                .child(
                    div()
                        .absolute()
                        .top_0()
                        .left_0()
                        .size_full()
                        .bg(cover_bg_2)
                        .opacity(0.55)
                        .into_any_element(),
                )
                .child(
                    div()
                        .absolute()
                        .top(px(12.))
                        .left(px(12.))
                        .size(px(32.))
                        .rounded(px(10.))
                        .bg(hsla(0., 0., 0.1, 0.25))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/music-notes.svg")
                                .size(px(20.))
                                .text_color(hsla(0., 0., 0.95, 0.9)),
                        ),
                ),
        )
        .child(
            div()
                .v_flex()
                .gap_0p5()
                .child(
                    div()
                        .text_base()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.foreground)
                        .truncate()
                        .child(room.title.clone()),
                )
                .child(
                    div()
                        .text_base()
                        .text_color(theme.muted_foreground)
                        .truncate()
                        .child(room.subtitle.clone()),
                ),
        )
}

fn render_new_releases(
    loading: bool,
    error: Option<&str>,
    releases: &[ReleaseRow],
    scroll_handle: &ScrollHandle,
    theme: &Theme,
    cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    let scroll_handle = scroll_handle.clone();
    let body: AnyElement = if loading && releases.is_empty() {
        h_scroll_row("discover-new-releases-row-skeleton", &scroll_handle, cx)
            .children((0..6).map(|idx| render_release_skeleton(idx, theme)))
            .into_any_element()
    } else if let Some(err) = error {
        div()
            .h_flex()
            .items_center()
            .text_base()
            .text_color(theme.muted_foreground)
            .child(format!("Failed to load new releases: {err}"))
            .into_any_element()
    } else if releases.is_empty() {
        div()
            .h_flex()
            .items_center()
            .text_base()
            .text_color(theme.muted_foreground)
            .child("No releases yet.")
            .into_any_element()
    } else {
        h_scroll_row("discover-new-releases-row", &scroll_handle, cx)
            .children(
                releases
                    .iter()
                    .enumerate()
                    .map(|(idx, row)| render_release_tile(idx, row, theme, cx)),
            )
            .into_any_element()
    };

    div()
        .v_flex()
        .gap_4()
        .child(render_section_header("New Releases", theme))
        .child(body)
}

fn render_release_skeleton(idx: usize, theme: &Theme) -> impl IntoElement {
    div()
        .id(SharedString::from(format!("release-skeleton-{idx}")))
        .w(px(150.))
        .flex_shrink_0()
        .v_flex()
        .gap_2()
        .child(
            div()
                .size(px(150.))
                .rounded(px(16.))
                .bg(theme.muted)
                .opacity(0.8),
        )
        .child(
            div()
                .h(px(14.))
                .rounded(px(10.))
                .bg(theme.muted)
                .opacity(0.65),
        )
        .child(
            div()
                .h(px(14.))
                .rounded(px(10.))
                .bg(theme.muted)
                .opacity(0.45),
        )
}

fn render_release_tile(
    idx: usize,
    row: &ReleaseRow,
    theme: &Theme,
    _cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    let cover = match row.cover_cid.as_deref() {
        Some(cid) => gpui::img(ipfs::heaven_cover_image_url(cid, 256, 256, 85))
            .size(px(150.))
            .rounded(px(16.))
            .object_fit(ObjectFit::Cover)
            .into_any_element(),
        None => div()
            .size(px(150.))
            .rounded(px(16.))
            .bg(theme.muted)
            .flex()
            .items_center()
            .justify_center()
            .child(
                gpui::svg()
                    .path("icons/music-note.svg")
                    .size(px(22.))
                    .text_color(theme.muted_foreground),
            )
            .into_any_element(),
    };

    // TODO: navigate to a network track detail page instead of library
    div()
        .id(("discover-release-tile", idx))
        .w(px(150.))
        .flex_shrink_0()
        .v_flex()
        .gap_2()
        .child(
            div()
                .size(px(150.))
                .rounded(px(16.))
                .overflow_hidden()
                .bg(theme.muted)
                .child(cover),
        )
        .child(
            div()
                .v_flex()
                .gap_0p5()
                .child(
                    div()
                        .text_base()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.foreground)
                        .truncate()
                        .child(row.title.clone()),
                )
                .child(
                    div()
                        .text_base()
                        .text_color(theme.muted_foreground)
                        .truncate()
                        .child(row.artist.clone()),
                ),
        )
}

fn render_top_songs_section(
    mode: TopSongsMode,
    loading: bool,
    error: Option<&str>,
    songs: &[TopSongRow],
    entity: Entity<DiscoverView>,
    cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    let theme = cx.theme().clone();
    let switch_entity = entity.clone();
    let checked = mode == TopSongsMode::Verified;

    div()
        .v_flex()
        .gap_4()
        .child(
            div()
                .h_flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_base()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.foreground)
                        .child("Top Songs"),
                )
                .child(
                    div()
                        .h_flex()
                        .items_center()
                        .gap_3()
                        .child(
                            div()
                                .text_sm()
                                .line_height(px(16.))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(theme.muted_foreground)
                                .child("Verified"),
                        )
                        .child(
                            Switch::new("discover-top-songs-verified-switch")
                                .checked(checked)
                                .small()
                                .on_click(move |_, _window, cx| {
                                    let _ = switch_entity.update(cx, |this, cx| {
                                        this.toggle_top_songs_mode(cx);
                                    });
                                }),
                        ),
                ),
        )
        .child(render_top_songs_body(
            mode, loading, error, songs, &theme, entity, cx,
        ))
}

fn render_top_songs_body(
    mode: TopSongsMode,
    loading: bool,
    error: Option<&str>,
    songs: &[TopSongRow],
    theme: &Theme,
    entity: Entity<DiscoverView>,
    cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    if loading && songs.is_empty() {
        return div()
            .text_base()
            .text_color(theme.muted_foreground)
            .child("Loading top songs...");
    }

    if let Some(err) = error {
        return div()
            .text_base()
            .text_color(theme.muted_foreground)
            .child(format!("Failed to load top songs: {err}"));
    }

    if songs.is_empty() {
        return div()
            .text_base()
            .text_color(theme.muted_foreground)
            .child("No scrobbles yet.");
    }

    div()
        .v_flex()
        .w_full()
        .child(render_top_songs_header(mode, theme))
        .children(songs.iter().enumerate().map(|(idx, row)| {
            let is_last = idx + 1 == songs.len();
            render_top_song_row(idx, row, is_last, mode, theme, entity.clone(), cx)
        }))
}

fn render_top_songs_header(mode: TopSongsMode, theme: &Theme) -> impl IntoElement {
    let plays_label = match mode {
        TopSongsMode::All => "PLAYS",
        TopSongsMode::Verified => "VERIFIED",
    };

    div()
        .h_flex()
        .w_full()
        .h(px(32.))
        .px_4()
        .items_center()
        .border_b_1()
        .border_color(theme.border)
        .text_xs()
        .text_color(theme.muted_foreground)
        .font_weight(FontWeight::MEDIUM)
        .child(div().w(px(48.)).child("#"))
        .child(div().w(px(420.)).child("TRACK"))
        .child(
            div()
                .min_w(px(220.))
                .flex_1()
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .truncate()
                .child("ARTIST"),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(96.))
                        .h_flex()
                        .items_center()
                        .justify_end()
                        .child(plays_label),
                )
                .child(div().w(px(36.))),
        )
}

fn render_top_song_row(
    idx: usize,
    row: &TopSongRow,
    is_last: bool,
    mode: TopSongsMode,
    theme: &Theme,
    entity: Entity<DiscoverView>,
    cx: &mut Context<DiscoverView>,
) -> impl IntoElement {
    let row_group: SharedString = format!("discover-top-song-row-group-{idx}").into();
    let artist_name = row.artist.clone();
    let album_name = row.album.clone();

    let menu_entity = entity.clone();
    let artist_for_menu = artist_name.clone();
    let artist_for_album_menu = artist_name.clone();
    let album_for_menu = album_name.clone();

    let play_count = match mode {
        TopSongsMode::All => row.play_count_total,
        TopSongsMode::Verified => row.play_count_verified,
    };
    let plays_label = if play_count == 1 { "play" } else { "plays" };

    let cover_el: AnyElement = match row.cover_cid.as_deref() {
        Some(cid) => div()
            .size(px(40.))
            .rounded(px(6.))
            .overflow_hidden()
            .bg(theme.muted)
            .flex_shrink_0()
            .child(
                gpui::img(ipfs::heaven_cover_image_url(cid, 96, 96, 80))
                    .size(px(40.))
                    .rounded(px(6.))
                    .object_fit(ObjectFit::Cover),
            )
            .into_any_element(),
        None => div()
            .size(px(40.))
            .rounded(px(6.))
            .bg(theme.muted)
            .flex_shrink_0()
            .flex()
            .items_center()
            .justify_center()
            .child(
                gpui::svg()
                    .path("icons/music-note.svg")
                    .size(px(16.))
                    .text_color(theme.muted_foreground),
            )
            .into_any_element(),
    };

    div()
        .id(("discover-top-song-row", idx))
        .group(row_group.clone())
        .h_flex()
        .w_full()
        .h(px(52.))
        .items_center()
        .px_4()
        .cursor_pointer()
        .hover(|s| s.bg(theme.list_hover))
        .when(!is_last, |el| el.border_b_1().border_color(theme.border))
        .on_click(cx.listener(move |this, _ev, _window, cx| {
            this.open_artist(artist_name.clone(), cx);
        }))
        .child(
            div().h_flex().items_center().w(px(48.)).child(
                div()
                    .text_sm()
                    .text_color(theme.muted_foreground)
                    .child(format!("{}", idx + 1)),
            ),
        )
        .child(
            div()
                .h_flex()
                .w(px(420.))
                .flex_none()
                .min_w_0()
                .gap_3()
                .items_center()
                .overflow_hidden()
                .child(cover_el)
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .text_sm()
                        .truncate()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(theme.foreground)
                        .child(row.title.clone()),
                ),
        )
        .child(
            div()
                .min_w(px(220.))
                .flex_1()
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(theme.muted_foreground)
                .truncate()
                .child(row.artist.clone()),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(96.))
                        .text_sm()
                        .text_color(theme.muted_foreground)
                        .h_flex()
                        .justify_end()
                        .child(format!("{} {}", play_count, plays_label)),
                )
                .child(track_row_overflow_menu(
                    ("discover-top-song-dots", idx),
                    row_group,
                    false,
                    move |menu, _window, _cx| {
                        let mut menu = menu.item(PopupMenuItem::new("Go to artist").on_click({
                            let menu_entity = menu_entity.clone();
                            let artist_name = artist_for_menu.clone();
                            move |_, _, cx| {
                                let _ = menu_entity.update(cx, |this, cx| {
                                    this.open_artist(artist_name.clone(), cx);
                                });
                            }
                        }));

                        if !album_for_menu.trim().is_empty() {
                            menu = menu.item(PopupMenuItem::new("Go to album").on_click({
                                let menu_entity = menu_entity.clone();
                                let artist_name = artist_for_album_menu.clone();
                                let album_name = album_for_menu.clone();
                                move |_, _, cx| {
                                    let _ = menu_entity.update(cx, |this, cx| {
                                        this.open_album(
                                            artist_name.clone(),
                                            album_name.clone(),
                                            cx,
                                        );
                                    });
                                }
                            }));
                        }

                        menu
                    },
                )),
        )
}

fn seed_trending_rooms() -> Vec<TrendingRoom> {
    // Design-first placeholders until rooms have real cover art / trending ranking.
    [
        ("Midnight Jam", "Hosted by Luna", 0.84),
        ("Electric Duet", "Open mic duo", 0.04),
        ("Summer Waves", "Chill set", 0.58),
        ("Golden Hour", "Sunset crew", 0.12),
        ("Neon Pulse", "Synth night", 0.70),
        ("Basement Jazz", "Standards", 0.33),
        ("Lo-fi Study", "Beats to read", 0.50),
        ("House Session", "4/4 only", 0.92),
        ("Indie Corner", "New finds", 0.20),
        ("Vocal Warmup", "Daily drills", 0.65),
    ]
    .into_iter()
    .map(|(title, subtitle, hue)| TrendingRoom {
        title: title.to_string(),
        subtitle: subtitle.to_string(),
        hue,
    })
    .collect()
}

fn subgraph_activity_url() -> String {
    env::var("HEAVEN_SUBGRAPH_ACTIVITY_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_ACTIVITY_URL.to_string())
}

fn fetch_latest_tracks(max_entries: usize) -> Result<Vec<ReleaseRow>, String> {
    let subgraph_url = subgraph_activity_url();
    let query = format!(
        "{{ tracks(where: {{ kind: 2 }}, first: {max_entries}, orderBy: registeredAt, orderDirection: desc) {{ id title artist album coverCid registeredAt }} }}"
    );
    let response = http_post_json(&subgraph_url, serde_json::json!({ "query": query }))?;
    if let Some(errors) = response.get("errors") {
        return Err(format!("Activity subgraph error: {errors}"));
    }

    let rows = response
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for row in rows {
        let Some(track_id) = row
            .get("id")
            .and_then(Value::as_str)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
        else {
            continue;
        };
        let title = sanitize_track_field(row.get("title"), "Unknown Track");
        let artist = sanitize_track_field(row.get("artist"), "Unknown Artist");
        let album = sanitize_track_field(row.get("album"), "");
        let cover_cid = sanitize_cover_cid(row.get("coverCid"));
        let registered_at_sec = parse_u64_field(row.get("registeredAt"));

        out.push(ReleaseRow {
            track_id,
            title,
            artist,
            album,
            cover_cid,
            registered_at_sec,
        });
    }

    Ok(out)
}

fn fetch_top_songs(mode: TopSongsMode, max_entries: usize) -> Result<Vec<TopSongRow>, String> {
    let subgraph_url = subgraph_activity_url();
    let order_by = match mode {
        TopSongsMode::All => "scrobbleCountTotal",
        TopSongsMode::Verified => "scrobbleCountVerified",
    };

    // Default to MBID + Story ipId tracks.
    let where_clause = match mode {
        TopSongsMode::All => "where: { kind_in: [1, 2] }",
        TopSongsMode::Verified => "where: { kind_in: [1, 2], scrobbleCountVerified_gt: \"0\" }",
    };

    let query = format!(
        "{{ tracks({where_clause}, first: {max_entries}, orderBy: {order_by}, orderDirection: desc) {{ id title artist album coverCid scrobbleCountTotal scrobbleCountVerified }} }}"
    );

    let response = http_post_json(&subgraph_url, serde_json::json!({ "query": query }))?;
    if let Some(errors) = response.get("errors") {
        return Err(format!("Activity subgraph error: {errors}"));
    }

    let rows = response
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for row in rows {
        let title = sanitize_track_field(row.get("title"), "Unknown Track");
        let artist = sanitize_track_field(row.get("artist"), "Unknown Artist");
        let album = sanitize_track_field(row.get("album"), "");
        let cover_cid = sanitize_cover_cid(row.get("coverCid"));
        let play_count_total = parse_u64_field(row.get("scrobbleCountTotal"));
        let play_count_verified = parse_u64_field(row.get("scrobbleCountVerified"));

        out.push(TopSongRow {
            title,
            artist,
            album,
            cover_cid,
            play_count_total,
            play_count_verified,
        });
    }

    Ok(out)
}

fn parse_u64_field(value: Option<&Value>) -> u64 {
    match value {
        Some(v) if v.is_number() => v.as_u64().unwrap_or_default(),
        Some(v) if v.is_string() => v
            .as_str()
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or_default(),
        _ => 0,
    }
}

fn short_track_label(track_id: &str) -> String {
    let trimmed = track_id.trim();
    if trimmed.is_empty() {
        return "Unknown Track".to_string();
    }
    if trimmed.len() <= 14 {
        return trimmed.to_string();
    }
    format!("Track {}...", &trimmed[..10])
}

fn sanitize_track_field(raw: Option<&Value>, fallback: &str) -> String {
    raw.and_then(Value::as_str)
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn escape_gql(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ")
        .replace('\r', " ")
}

fn sanitize_cover_cid(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .filter(|v| is_valid_cover_cid(v))
        .map(ToString::to_string)
}

fn is_valid_cover_cid(value: &str) -> bool {
    value.starts_with("Qm")
        || value.starts_with("bafy")
        || value.starts_with("ar://")
        || value.starts_with("ls3://")
        || value.starts_with("load-s3://")
}
