mod audio;
mod auth;
mod chat;
mod feed;
mod icons;
mod library;
mod lit_wallet;
mod load_storage;
mod music_db;
mod pages;
mod rooms;
mod scrobble;
mod settings;
mod shell;
mod theme;
mod ui;
mod voice;
mod wallet;
mod xmtp_service;

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::slider::{Slider, SliderEvent, SliderState};
use gpui_component::theme::Theme;
use gpui_component::{ActiveTheme, Root, StyledExt};

use audio::AudioHandle;
use icons::CombinedAssets;
use library::LibraryMode;
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
    rooms_view: Entity<rooms::RoomsView>,
    side_player_view: Entity<SidePlayerView>,
    wallet_view: Entity<wallet::WalletView>,
    settings_view: Entity<settings::SettingsView>,
}

impl HeavenApp {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let nav_channel = cx.new(|_| NavChannel::new());
        let feed_view = cx.new(|cx| feed::FeedView::new(cx));
        let chat_view = cx.new(|cx| chat::ChatView::new(window, cx));
        let audio = AudioHandle::new();
        let audio2 = audio.clone();
        let library_view = cx.new(|cx| library::LibraryView::new(window, audio2, cx));
        let rooms_view = cx.new(|cx| rooms::RoomsView::new(window, cx));
        let side_player_view =
            cx.new(|cx| SidePlayerView::new(audio.clone(), library_view.clone(), cx));
        let wallet_view = cx.new(|cx| wallet::WalletView::new(cx));
        let settings_view = cx.new(|cx| settings::SettingsView::new(cx));

        // Observe the nav channel for navigation events
        let ch = nav_channel.clone();
        cx.observe(&ch, |this, ch, cx| {
            if let Some(page) = ch.read(cx).target {
                this.active_page = page;
                let _ = this.library_view.update(cx, |view, cx| {
                    view.set_mode(
                        if page == Page::MusicShared {
                            LibraryMode::SharedWithMe
                        } else {
                            LibraryMode::Library
                        },
                        cx,
                    );
                });
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

        Self {
            active_page: Page::Home,
            sidebar_collapsed: false,
            nav_channel,
            feed_view,
            chat_view,
            library_view,
            rooms_view,
            side_player_view,
            wallet_view,
            settings_view,
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
                        Page::Rooms => self.rooms_view.clone().into_any_element(),
                        Page::MusicShared => self.library_view.clone().into_any_element(),
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
            // Right panel (hidden on Rooms where activity rail is in-page)
            .when(self.active_page != Page::Rooms, |el| {
                el.child(
                    div()
                        .v_flex()
                        .w(px(400.))
                        .h_full()
                        .flex_shrink_0()
                        .bg(theme.sidebar)
                        .overflow_hidden()
                        // Album player — shows current track info
                        .child(self.side_player_view.clone().into_any_element())
                        // Spacer
                        .child(div().flex_1()),
                )
            })
    }
}

struct SidePlayerView {
    audio: AudioHandle,
    library_view: Entity<library::LibraryView>,
    seek_slider: Entity<SliderState>,
    seek_scrub_in_progress: bool,
    seek_scrub_fraction: Option<f32>,
    pending_seek_position: Option<f64>,
    pending_seek_started_at: Option<std::time::Instant>,
    last_playback_duration: f64,
    last_playback_playing: bool,
    _seek_slider_subscription: Subscription,
}

impl SidePlayerView {
    fn new(
        audio: AudioHandle,
        library_view: Entity<library::LibraryView>,
        cx: &mut Context<Self>,
    ) -> Self {
        let seek_slider = cx.new(|_| {
            SliderState::new()
                .min(0.0)
                .max(1.0)
                .step(0.001)
                .default_value(0.0)
        });
        let _seek_slider_subscription = cx.subscribe(
            &seek_slider,
            |this: &mut Self, _, ev: &SliderEvent, cx| match ev {
                SliderEvent::Change(value) => {
                    this.seek_scrub_in_progress = true;
                    this.seek_scrub_fraction = Some(value.end().clamp(0.0, 1.0));
                    cx.notify();
                }
            },
        );

        let lib = library_view.clone();
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                smol::Timer::after(std::time::Duration::from_millis(200)).await;
                let should_continue = this
                    .update(cx, |_this, cx| {
                        cx.notify();
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
                let _ = lib.update(cx, |lib, cx| {
                    lib.check_auto_advance(cx);
                });
            },
        )
        .detach();

        Self {
            audio,
            library_view,
            seek_slider,
            seek_scrub_in_progress: false,
            seek_scrub_fraction: None,
            pending_seek_position: None,
            pending_seek_started_at: None,
            last_playback_duration: 0.0,
            last_playback_playing: false,
            _seek_slider_subscription,
        }
    }
}

impl Render for SidePlayerView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let playback = self.audio.read_state();
        let duration = playback.duration.unwrap_or(0.0);

        self.last_playback_duration = duration;
        self.last_playback_playing = playback.playing;

        if let Some(target) = self.pending_seek_position {
            let reached_target = (playback.position - target).abs() <= 0.35;
            let timed_out = self
                .pending_seek_started_at
                .map(|started| started.elapsed() > std::time::Duration::from_millis(1200))
                .unwrap_or(true);
            if reached_target || timed_out || duration <= 0.0 {
                self.pending_seek_position = None;
                self.pending_seek_started_at = None;
            }
        }

        let position = if self.seek_scrub_in_progress {
            self.seek_scrub_fraction
                .map(|fraction| (duration * fraction as f64).clamp(0.0, duration))
                .unwrap_or(playback.position)
        } else if let Some(target) = self.pending_seek_position {
            target.clamp(0.0, duration)
        } else {
            playback.position
        };

        let playback_fraction = if duration > 0.0 {
            (position / duration).clamp(0.0, 1.0) as f32
        } else {
            0.0
        };

        if !self.seek_scrub_in_progress {
            let current_fraction = self.seek_slider.read(cx).value().end();
            if (current_fraction - playback_fraction).abs() > 0.001 {
                self.seek_slider.update(cx, |slider, slider_cx| {
                    slider.set_value(playback_fraction, window, slider_cx);
                });
            }
            self.seek_scrub_fraction = None;
        }

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

        let is_playing = playback.playing;

        let format_time = |secs: f64| -> String {
            let s = secs as u64;
            format!("{}:{:02}", s / 60, s % 60)
        };

        // Clone handles for click handlers
        let audio_toggle = self.audio.clone();
        let lib_prev = self.library_view.clone();
        let lib_next = self.library_view.clone();

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
                        div()
                            .id("side-player-seek")
                            .w_full()
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(|this, _ev, _window, cx| {
                                    this.seek_scrub_in_progress = true;
                                    cx.notify();
                                }),
                            )
                            .capture_any_mouse_up(cx.listener(|this, _ev, _window, cx| {
                                if !this.seek_scrub_in_progress {
                                    return;
                                }
                                this.seek_scrub_in_progress = false;
                                let fraction =
                                    this.seek_scrub_fraction.take().unwrap_or_else(|| {
                                        this.seek_slider.read(cx).value().end().clamp(0.0, 1.0)
                                    });
                                if this.last_playback_duration > 0.0 {
                                    let seek_to = (this.last_playback_duration * fraction as f64)
                                        .clamp(0.0, this.last_playback_duration);
                                    this.pending_seek_position = Some(seek_to);
                                    this.pending_seek_started_at = Some(std::time::Instant::now());
                                    this.audio.seek(seek_to, this.last_playback_playing);
                                }
                                cx.notify();
                            }))
                            .child(
                                Slider::new(&self.seek_slider)
                                    .horizontal()
                                    .disabled(duration <= 0.0)
                                    .bg(hsla(0., 0., 0.98, 1.))
                                    .text_color(hsla(0., 0., 0.98, 1.)),
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
}

/// Render the large album art in the side player.
fn render_side_player_art(cover_path: &Option<String>) -> impl IntoElement {
    let container = div()
        .size(px(360.))
        .rounded(px(14.))
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
