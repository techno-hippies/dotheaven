//! Profile page — native GPUI profile layout with scrobbles-first timeline.

use gpui::*;

use crate::pages::Page;
use crate::shell::app_sidebar::NavChannel;
use crate::{auth, chat, library};

mod model;
mod render;
mod scrobbles_feed;

use model::{ProfileScrobbleRow, ProfileTab};

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
    BG_PAGE => bg_page,
    BG_SURFACE => bg_surface,
    BG_HOVER => bg_hover,
    BORDER_SUBTLE => border_subtle,
    TEXT_PRIMARY => text_primary,
    TEXT_SECONDARY => text_secondary,
    TEXT_MUTED => text_muted,
    TEXT_DIM => text_dim,
    ACCENT_BLUE => accent_blue,
}

pub(super) const BG_BANNER: Hsla = Hsla {
    h: 0.67,
    s: 0.62,
    l: 0.18,
    a: 1.,
};
pub(super) const BG_BANNER_GLOW_A: Hsla = Hsla {
    h: 0.61,
    s: 0.87,
    l: 0.32,
    a: 0.38,
};
pub(super) const BG_BANNER_GLOW_B: Hsla = Hsla {
    h: 0.78,
    s: 0.83,
    l: 0.40,
    a: 0.34,
};
pub(super) const BG_BANNER_GLOW_C: Hsla = Hsla {
    h: 0.65,
    s: 0.75,
    l: 0.45,
    a: 0.26,
};
pub(super) const BG_AVATAR: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.15,
    a: 1.,
};
pub(super) const BG_COVER_PLACEHOLDER: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.18,
    a: 1.,
};
pub(super) const ACCENT_BLUE_HOVER: Hsla = Hsla {
    h: 0.62,
    s: 0.93,
    l: 0.82,
    a: 1.,
};

pub(super) const PROFILE_DISPLAY_NAME: &str = "Alice";
pub(super) const PROFILE_HANDLE: &str = "alice.heaven";
pub(super) const PROFILE_BIO: &str =
    "Jazz vocalist & guitarist. Playing standards and originals. Based in Brooklyn.";
pub(super) const PROFILE_FOLLOWERS: usize = 248;
pub(super) const PROFILE_FOLLOWING: usize = 89;
pub(super) const PROFILE_WALLET_ADDRESS: &str = "0xA11CE0000000000000000000000000000000000";
pub(super) const SCROBBLE_ROW_HEIGHT: f32 = 52.0;
pub(super) const SCROBBLE_HEADER_HEIGHT: f32 = 32.0;
pub(super) const SCROBBLE_TITLE_COLUMN_WIDTH: f32 = 420.0;
pub(super) const SCROBBLE_ARTIST_COLUMN_WIDTH: f32 = 220.0;
pub(super) const SCROBBLE_TIME_COLUMN_WIDTH: f32 = 96.0;

pub struct ProfileView {
    nav_channel: Entity<NavChannel>,
    chat_view: Entity<chat::ChatView>,
    library_view: Entity<library::LibraryView>,
    scroll_handle: ScrollHandle,
    active_tab: ProfileTab,
    is_following: bool,
    scrobbles_loading: bool,
    scrobbles_error: Option<String>,
    scrobbles_for: Option<String>,
    scrobbles_fetch_seq: u64,
    scrobbles: Vec<ProfileScrobbleRow>,
}

impl ProfileView {
    pub fn new(
        nav_channel: Entity<NavChannel>,
        chat_view: Entity<chat::ChatView>,
        library_view: Entity<library::LibraryView>,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut this = Self {
            nav_channel,
            chat_view,
            library_view,
            scroll_handle: ScrollHandle::new(),
            active_tab: ProfileTab::Scrobbles,
            is_following: false,
            scrobbles_loading: false,
            scrobbles_error: None,
            scrobbles_for: None,
            scrobbles_fetch_seq: 0,
            scrobbles: Vec::new(),
        };

        cx.observe_global::<auth::AuthState>(|this, cx| {
            log::info!("[Profile] auth change observed -> refresh scrobbles");
            this.refresh_scrobbles_for_auth(cx);
            cx.notify();
        })
        .detach();
        cx.observe_global::<crate::scrobble_refresh::ScrobbleRefreshSignal>(|this, cx| {
            log::info!("[Profile] scrobble refresh signal observed -> force refresh");
            this.refresh_scrobbles_for_auth_force(cx);
            cx.notify();
        })
        .detach();

        // Keep the Playlists tab reactive to LibraryView sidebar playlist refreshes.
        let lib = this.library_view.clone();
        cx.observe(&lib, |this, _lib, cx| {
            if this.active_tab == ProfileTab::Playlists {
                cx.notify();
            }
        })
        .detach();

        this.refresh_scrobbles_for_auth(cx);
        this
    }

    pub(super) fn open_message_compose(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let recipient = PROFILE_WALLET_ADDRESS.to_string();
        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::Messages);
            cx.notify();
        });

        let _ = self.chat_view.update(cx, |view, cx| {
            view.open_compose_with_recipient(recipient.clone(), window, cx);
        });
        cx.notify();
    }

    pub(super) fn open_scrobble_artist(
        &mut self,
        artist_name: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let artist_name = artist_name.into();
        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::MusicLibrary);
            cx.notify();
        });
        let _ = self.library_view.update(cx, |view, cx| {
            view.open_artist_page(artist_name, cx);
        });
    }

    pub(super) fn open_scrobble_album(
        &mut self,
        artist_name: impl Into<String>,
        album_name: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let artist_name = artist_name.into();
        let album_name = album_name.into();
        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::MusicLibrary);
            cx.notify();
        });
        let _ = self.library_view.update(cx, |view, cx| {
            view.open_album_page(artist_name, album_name, cx);
        });
    }

    pub(super) fn open_playlist_detail(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        cx: &mut Context<Self>,
    ) {
        self.nav_channel.update(cx, |ch, cx| {
            ch.target = Some(Page::MusicLibrary);
            cx.notify();
        });
        let _ = self.library_view.update(cx, |view, cx| {
            view.open_playlist_detail(playlist_id, playlist_name, cx);
        });
    }

    pub(super) fn refresh_scrobbles_for_auth(&mut self, cx: &mut Context<Self>) {
        self.refresh_scrobbles_for_auth_inner(false, cx);
    }

    pub(super) fn refresh_scrobbles_for_auth_force(&mut self, cx: &mut Context<Self>) {
        self.refresh_scrobbles_for_auth_inner(true, cx);
    }

    fn refresh_scrobbles_for_auth_inner(&mut self, force: bool, cx: &mut Context<Self>) {
        let user = auth::load_from_disk()
            .and_then(|a| a.primary_wallet_address().map(|value| value.to_string()))
            .unwrap_or_default()
            .to_ascii_lowercase();

        if user.is_empty() {
            log::info!("[Profile] scrobble refresh skipped: no authenticated user");
            self.scrobbles_for = None;
            self.scrobbles.clear();
            self.scrobbles_error = None;
            self.scrobbles_loading = false;
            return;
        }

        if !force
            && self.scrobbles_for.as_deref() == Some(user.as_str())
            && !self.scrobbles.is_empty()
        {
            log::info!(
                "[Profile] scrobble refresh skipped: cached rows={} user={} force={}",
                self.scrobbles.len(),
                user,
                force
            );
            return;
        }

        if self.scrobbles_loading {
            log::info!(
                "[Profile] scrobble refresh skipped: already loading user={} force={}",
                user,
                force
            );
            return;
        }

        let had_cached_rows = !self.scrobbles.is_empty();
        self.scrobbles_for = Some(user.clone());
        self.scrobbles_error = None;
        self.scrobbles_loading = true;
        self.scrobbles_fetch_seq = self.scrobbles_fetch_seq.wrapping_add(1);
        let fetch_seq = self.scrobbles_fetch_seq;
        log::info!(
            "[Profile] scrobble refresh start: user={} force={} seq={}",
            user,
            force,
            fetch_seq
        );
        // Only force a re-render for the initial load. During background refresh
        // keep the current list visible to avoid flicker.
        if !had_cached_rows {
            cx.notify();
        }

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let query_user = user.clone();
            let result =
                smol::unblock(move || scrobbles_feed::fetch_scrobbles_for_user(&query_user, 100))
                    .await;

            let _ = this.update(cx, |this, cx| {
                if this.scrobbles_fetch_seq != fetch_seq {
                    return;
                }
                this.scrobbles_loading = false;
                match result {
                    Ok(rows) => {
                        log::info!(
                            "[Profile] scrobble refresh success: user={} seq={} rows={}",
                            user,
                            fetch_seq,
                            rows.len()
                        );
                        this.scrobbles = rows;
                        this.scrobbles_error = None;
                    }
                    Err(err) => {
                        log::warn!(
                            "[Profile] scrobble refresh failed: user={} seq={} err={}",
                            user,
                            fetch_seq,
                            err
                        );
                        // Keep cached scrobbles on transient refresh failure to avoid blanking UI.
                        this.scrobbles_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
