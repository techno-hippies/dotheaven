mod audio;
mod auth;
mod chat;
mod feed;
mod icons;
mod library;
mod lit_wallet;
mod music_db;
mod pages;
mod scrobble;
mod settings;
mod shell;
mod synapse_sidecar;
mod theme;
mod ui;
mod voice;
mod wallet;
mod xmtp_service;

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::theme::Theme;
use gpui_component::{ActiveTheme, Root, StyledExt};

use audio::AudioHandle;
use icons::CombinedAssets;
use pages::Page;
use shell::app_sidebar::{build_sidebar, NavChannel};
use theme::apply_heaven_theme;

// ---------------------------------------------------------------------------
// Zoom actions — Cmd+Plus / Cmd+Minus / Cmd+0
// ---------------------------------------------------------------------------

actions!(heaven, [ZoomIn, ZoomOut, ZoomReset]);

const DEFAULT_FONT_SIZE: f32 = 18.0; // comfortable default for native app
const MIN_FONT_SIZE: f32 = 13.0; // ~80% of 16
const MAX_FONT_SIZE: f32 = 26.0; // ~140% of 18

fn register_zoom_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("cmd-=", ZoomIn, None),
        KeyBinding::new("cmd-+", ZoomIn, None),
        KeyBinding::new("cmd--", ZoomOut, None),
        KeyBinding::new("cmd-0", ZoomReset, None),
    ]);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

struct HeavenApp {
    active_page: Page,
    sidebar_collapsed: bool,
    nav_channel: Entity<NavChannel>,
    feed_view: Entity<feed::FeedView>,
    chat_view: Entity<chat::ChatView>,
    library_view: Entity<library::LibraryView>,
    wallet_view: Entity<wallet::WalletView>,
    settings_view: Entity<settings::SettingsView>,
    audio: AudioHandle,
}

impl HeavenApp {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let nav_channel = cx.new(|_| NavChannel::new());
        let feed_view = cx.new(|cx| feed::FeedView::new(cx));
        let chat_view = cx.new(|cx| chat::ChatView::new(window, cx));
        let audio = AudioHandle::new();
        let audio2 = audio.clone();
        let library_view = cx.new(|cx| library::LibraryView::new(audio2, cx));
        let wallet_view = cx.new(|cx| wallet::WalletView::new(cx));
        let settings_view = cx.new(|cx| settings::SettingsView::new(cx));

        // Observe the nav channel for navigation events
        let ch = nav_channel.clone();
        cx.observe(&ch, |this, ch, cx| {
            if let Some(page) = ch.read(cx).target {
                this.active_page = page;
                ch.update(cx, |ch, cx| {
                    ch.target = None;
                    cx.notify();
                });
                cx.notify();
            }
        })
        .detach();

        // Re-render when auth state changes
        cx.observe_global::<auth::AuthState>(|_this, cx| {
            cx.notify();
        })
        .detach();

        // Poll playback state every 200ms to update side player progress + auto-advance
        let lib = library_view.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            loop {
                smol::Timer::after(std::time::Duration::from_millis(200)).await;
                let should_continue = this
                    .update(cx, |_this, cx| {
                        cx.notify();
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
                // Check auto-advance on library view
                let _ = lib.update(cx, |lib, cx| {
                    lib.check_auto_advance(cx);
                });
            }
        })
        .detach();

        Self {
            active_page: Page::Home,
            sidebar_collapsed: false,
            nav_channel,
            feed_view,
            chat_view,
            library_view,
            wallet_view,
            settings_view,
            audio,
        }
    }

    // -- Zoom handlers --

    fn handle_zoom_in(&mut self, _: &ZoomIn, window: &mut Window, cx: &mut Context<Self>) {
        let theme = Theme::global_mut(cx);
        let cur: f32 = theme.font_size.into();
        let new_size = (cur * 1.1).min(MAX_FONT_SIZE);
        theme.font_size = px(new_size);
        window.set_rem_size(theme.font_size);
        cx.notify();
    }

    fn handle_zoom_out(&mut self, _: &ZoomOut, window: &mut Window, cx: &mut Context<Self>) {
        let theme = Theme::global_mut(cx);
        let cur: f32 = theme.font_size.into();
        let new_size = (cur / 1.1).max(MIN_FONT_SIZE);
        theme.font_size = px(new_size);
        window.set_rem_size(theme.font_size);
        cx.notify();
    }

    fn handle_zoom_reset(&mut self, _: &ZoomReset, window: &mut Window, cx: &mut Context<Self>) {
        let theme = Theme::global_mut(cx);
        theme.font_size = px(DEFAULT_FONT_SIZE);
        window.set_rem_size(theme.font_size);
        cx.notify();
    }
}

impl Render for HeavenApp {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();

        // Read current playback state for side player
        let playback = self.audio.read_state();

        div()
            .id("heaven-app")
            .key_context("HeavenApp")
            .on_action(cx.listener(Self::handle_zoom_in))
            .on_action(cx.listener(Self::handle_zoom_out))
            .on_action(cx.listener(Self::handle_zoom_reset))
            .h_flex()
            .size_full()
            .bg(theme.background)
            // Left sidebar — Sidebar component sets its own width (255px)
            .child(build_sidebar(
                self.active_page,
                self.sidebar_collapsed,
                self.nav_channel.clone(),
                cx,
            ))
            // Main content (center — flex)
            .child(
                div()
                    .v_flex()
                    .flex_1()
                    .h_full()
                    .min_w_0()
                    .overflow_hidden()
                    // Chat manages its own panel backgrounds; other pages use page bg
                    .when(self.active_page != Page::Messages, |el| {
                        el.bg(theme.background)
                    })
                    .child(match self.active_page {
                        Page::Home => self.feed_view.clone().into_any_element(),
                        Page::Messages => self.chat_view.clone().into_any_element(),
                        Page::MusicLibrary => self.library_view.clone().into_any_element(),
                        Page::Wallet => self.wallet_view.clone().into_any_element(),
                        Page::Settings => self.settings_view.clone().into_any_element(),
                        _ => div()
                            .id("main-content")
                            .flex_1()
                            .size_full()
                            .overflow_y_scroll()
                            .child(self.active_page.render_placeholder())
                            .into_any_element(),
                    }),
            )
            // Right panel (400px) — search bar above album player
            .child(
                div()
                    .v_flex()
                    .w(px(400.))
                    .h_full()
                    .flex_shrink_0()
                    .bg(theme.sidebar)
                    .overflow_hidden()
                    // Search bar at the very top
                    .child(
                        div().h_flex().px_5().py_3().child(
                            div()
                                .h_flex()
                                .w_full()
                                .px_3()
                                .py(px(8.))
                                .rounded_full()
                                .bg(theme.background)
                                .items_center()
                                .gap_2()
                                .child(
                                    gpui::svg()
                                        .path("icons/magnifying-glass.svg")
                                        .size(px(16.))
                                        .text_color(hsla(0., 0., 0.64, 1.)),
                                )
                                .child(div().text_color(hsla(0., 0., 0.45, 1.)).child("Search...")),
                        ),
                    )
                    // Album player — shows current track info
                    .child(build_side_player_with_state(
                        &playback,
                        &self.audio,
                        &self.library_view,
                    ))
                    // Spacer
                    .child(div().flex_1()),
            )
    }
}

/// Side player that reflects current playback state.
fn build_side_player_with_state(
    playback: &audio::PlaybackState,
    audio: &AudioHandle,
    library_view: &Entity<library::LibraryView>,
) -> impl IntoElement {
    let track_name = playback
        .track_path
        .as_ref()
        .and_then(|p| {
            std::path::Path::new(p)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "No track playing".to_string());

    let artist = playback
        .artist
        .clone()
        .unwrap_or_else(|| "Unknown artist".to_string());

    let position = playback.position;
    let duration = playback.duration.unwrap_or(0.0);
    let is_playing = playback.playing;

    let format_time = |secs: f64| -> String {
        let s = secs as u64;
        format!("{}:{:02}", s / 60, s % 60)
    };

    let progress_pct = if duration > 0.0 {
        ((position / duration) * 100.0).min(100.0) as f32
    } else {
        0.0
    };

    // Clone handles for click handlers
    let audio_toggle = audio.clone();
    let lib_prev = library_view.clone();
    let lib_next = library_view.clone();

    div()
        .v_flex()
        .w_full()
        .gap_3()
        .p_5()
        // Album art — show cover image if available, else placeholder
        .child(render_side_player_art(&playback.cover_path))
        // Track info
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .text_color(hsla(0., 0., 0.98, 1.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(track_name),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.64, 1.))
                        .child(artist),
                ),
        )
        // Progress bar + timestamps
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .h_flex()
                        .justify_between()
                        .child(
                            div()
                                .text_xs()
                                .text_color(hsla(0., 0., 0.64, 1.))
                                .child(format_time(position)),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(hsla(0., 0., 0.64, 1.))
                                .child(format_time(duration)),
                        ),
                )
                .child(
                    // Progress track
                    div()
                        .w_full()
                        .h(px(4.))
                        .rounded_full()
                        .bg(hsla(0., 0., 0.15, 1.))
                        .child(
                            div()
                                .h_full()
                                .rounded_full()
                                .bg(hsla(0., 0., 0.98, 1.))
                                .w(DefiniteLength::Fraction(progress_pct / 100.0)),
                        ),
                ),
        )
        // Transport controls
        .child(
            div()
                .h_flex()
                .justify_center()
                .items_center()
                .gap_2()
                .child(
                    gpui::svg()
                        .path("icons/shuffle.svg")
                        .size(px(18.))
                        .text_color(hsla(0., 0., 0.64, 1.))
                        .cursor_pointer(),
                )
                .child(
                    div()
                        .id("skip-back-btn")
                        .cursor_pointer()
                        .on_click(move |_, _, cx| {
                            lib_prev.update(cx, |lib, cx| {
                                lib.play_prev(cx);
                            });
                        })
                        .child(
                            gpui::svg()
                                .path("icons/skip-back-fill.svg")
                                .size(px(20.))
                                .text_color(hsla(0., 0., 0.98, 1.)),
                        ),
                )
                .child(
                    // Play/Pause toggle
                    div()
                        .id("play-pause-btn")
                        .size(px(40.))
                        .rounded_full()
                        .bg(hsla(0., 0., 0.98, 1.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .on_click(move |_, _, _cx| {
                            if is_playing {
                                audio_toggle.pause();
                            } else {
                                audio_toggle.resume();
                            }
                        })
                        .child(
                            gpui::svg()
                                .path(if is_playing {
                                    "icons/pause-fill.svg"
                                } else {
                                    "icons/play-fill.svg"
                                })
                                .size(px(20.))
                                .text_color(hsla(0., 0., 0.09, 1.)),
                        ),
                )
                .child(
                    div()
                        .id("skip-fwd-btn")
                        .cursor_pointer()
                        .on_click(move |_, _, cx| {
                            lib_next.update(cx, |lib, cx| {
                                lib.play_next(cx);
                            });
                        })
                        .child(
                            gpui::svg()
                                .path("icons/skip-forward-fill.svg")
                                .size(px(20.))
                                .text_color(hsla(0., 0., 0.98, 1.)),
                        ),
                )
                .child(
                    gpui::svg()
                        .path("icons/repeat.svg")
                        .size(px(18.))
                        .text_color(hsla(0., 0., 0.64, 1.))
                        .cursor_pointer(),
                ),
        )
}

/// Render the large album art in the side player.
fn render_side_player_art(cover_path: &Option<String>) -> impl IntoElement {
    let container = div()
        .size(px(360.))
        .rounded(px(8.))
        .overflow_hidden()
        .bg(hsla(0., 0., 0.15, 1.));

    match cover_path {
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => container.child(
            gpui::img(std::path::PathBuf::from(path))
                .size(px(360.))
                .object_fit(ObjectFit::Cover),
        ),
        _ => container.flex().items_center().justify_center().child(
            gpui::svg()
                .path("icons/music-notes.svg")
                .size(px(72.))
                .text_color(hsla(0., 0., 0.25, 1.)),
        ),
    }
}

fn main() {
    dotenvy::dotenv().ok();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let app = Application::new().with_assets(CombinedAssets);

    app.run(move |cx| {
        gpui_component::init(cx);
        apply_heaven_theme(cx);
        register_zoom_keys(cx);

        // Set comfortable default font size (18px — larger than web's 16px)
        Theme::global_mut(cx).font_size = px(DEFAULT_FONT_SIZE);

        // Initialize auth state — load persisted session from disk
        let mut initial_auth = auth::AuthState::default();
        if let Some(persisted) = auth::load_from_disk() {
            auth::log_persisted_auth("App startup", &persisted);
            initial_auth.persisted = Some(persisted);
        }
        cx.set_global(initial_auth);

        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1400.), px(900.)),
                    cx,
                ))),
                ..Default::default()
            },
            |window, cx| {
                window.set_rem_size(px(DEFAULT_FONT_SIZE));
                let view = cx.new(|cx| HeavenApp::new(window, cx));
                cx.new(|cx| Root::new(view, window, cx))
            },
        )
        .unwrap();
    });
}
