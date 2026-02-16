use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::theme::Theme;
use gpui_component::{ActiveTheme, StyledExt};

use crate::audio::AudioHandle;
use crate::library::LibraryMode;
use crate::pages::Page;
use crate::shell::app_sidebar::{build_sidebar, NavChannel};
use crate::side_player::SidePlayerView;
use crate::status_center::render_status_overlay;
use crate::{
    auth, chat, discover, library, profile, rooms, schedule, settings, status_center, wallet,
};

actions!(heaven, [ZoomIn, ZoomOut, ZoomReset]);

pub(crate) const DEFAULT_FONT_SIZE: f32 = 18.0; // comfortable default for native app
const MIN_FONT_SIZE: f32 = 13.0; // ~80% of 16
const MAX_FONT_SIZE: f32 = 26.0; // ~140% of 18

pub(crate) fn register_zoom_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("cmd-=", ZoomIn, None),
        KeyBinding::new("cmd-+", ZoomIn, None),
        KeyBinding::new("cmd--", ZoomOut, None),
        KeyBinding::new("cmd-0", ZoomReset, None),
    ]);
}

pub(crate) struct HeavenApp {
    active_page: Page,
    sidebar_collapsed: bool,
    nav_channel: Entity<NavChannel>,
    discover_view: Entity<discover::DiscoverView>,
    chat_view: Entity<chat::ChatView>,
    library_view: Entity<library::LibraryView>,
    rooms_view: Entity<rooms::RoomsView>,
    profile_view: Entity<profile::ProfileView>,
    side_player_view: Entity<SidePlayerView>,
    wallet_view: Entity<wallet::WalletView>,
    schedule_view: Entity<schedule::ScheduleView>,
    settings_view: Entity<settings::SettingsView>,
}

impl HeavenApp {
    pub(crate) fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let nav_channel = cx.new(|_| NavChannel::new());
        let chat_view = cx.new(|cx| chat::ChatView::new(window, cx));
        let audio = AudioHandle::new();
        let audio2 = audio.clone();
        let library_view = cx.new(|cx| library::LibraryView::new(window, audio2, cx));
        let nav_for_discover = nav_channel.clone();
        let lib_for_discover = library_view.clone();
        let discover_view = cx.new(|cx| {
            discover::DiscoverView::new(nav_for_discover.clone(), lib_for_discover.clone(), cx)
        });
        let rooms_view = cx.new(|cx| rooms::RoomsView::new(window, cx));
        let profile_view = cx.new(|cx| {
            profile::ProfileView::new(
                nav_channel.clone(),
                chat_view.clone(),
                library_view.clone(),
                cx,
            )
        });
        let side_player_view = cx.new(|cx| {
            SidePlayerView::new(audio.clone(), library_view.clone(), nav_channel.clone(), cx)
        });
        let wallet_view = cx.new(|cx| wallet::WalletView::new(cx));
        let schedule_view = cx.new(|cx| schedule::ScheduleView::new(window, cx));
        let settings_view = cx.new(|cx| settings::SettingsView::new(window, cx));

        // Observe the nav channel for navigation events.
        let ch = nav_channel.clone();
        cx.observe(&ch, |this, ch, cx| {
            if let Some(page) = ch.read(cx).target {
                let leaving_rooms = this.active_page == Page::Rooms && page != Page::Rooms;
                if leaving_rooms {
                    let _ = this.rooms_view.update(cx, |view, cx| {
                        view.dismiss_transient_ui(cx);
                    });
                }
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

        // Re-render when auth state changes.
        cx.observe_global::<auth::AuthState>(|_this, cx| {
            cx.notify();
        })
        .detach();

        // Re-render when global status changes.
        cx.observe_global::<status_center::StatusCenter>(|_this, cx| {
            cx.notify();
        })
        .detach();

        // Sweep auto-expiring status entries.
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                smol::Timer::after(std::time::Duration::from_millis(1000)).await;
                let should_continue = this
                    .update(cx, |_this, cx| {
                        let mut changed = false;
                        cx.update_global::<status_center::StatusCenter, _>(|status, _| {
                            changed = status.sweep_expired();
                        });
                        if changed {
                            cx.notify();
                        }
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
            },
        )
        .detach();

        Self {
            active_page: Page::Home,
            sidebar_collapsed: false,
            nav_channel,
            discover_view,
            chat_view,
            library_view,
            rooms_view,
            profile_view,
            side_player_view,
            wallet_view,
            schedule_view,
            settings_view,
        }
    }

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
            .relative()
            .h_flex()
            .size_full()
            .bg(theme.background)
            .child(build_sidebar(
                self.active_page,
                self.sidebar_collapsed,
                self.nav_channel.clone(),
                &self.library_view,
                cx,
            ))
            .child(
                div()
                    .id("main-center-panel")
                    .relative()
                    .v_flex()
                    .flex_1()
                    .h_full()
                    .min_w_0()
                    .overflow_hidden()
                    .when(self.active_page != Page::Messages, |el| {
                        el.bg(theme.background)
                    })
                    .child(match self.active_page {
                        Page::Home | Page::MusicDiscover => {
                            self.discover_view.clone().into_any_element()
                        }
                        Page::Messages => self.chat_view.clone().into_any_element(),
                        Page::MusicLibrary => self.library_view.clone().into_any_element(),
                        Page::Rooms => self.rooms_view.clone().into_any_element(),
                        Page::Profile => self.profile_view.clone().into_any_element(),
                        Page::MusicShared => self.library_view.clone().into_any_element(),
                        Page::Wallet => self.wallet_view.clone().into_any_element(),
                        Page::Schedule => self.schedule_view.clone().into_any_element(),
                        Page::Settings => self.settings_view.clone().into_any_element(),
                        _ => div()
                            .id("main-content")
                            .flex_1()
                            .size_full()
                            .overflow_y_scroll()
                            .child(self.active_page.render_placeholder())
                            .into_any_element(),
                    })
                    .when_some(render_status_overlay(cx), |el, overlay| el.child(overlay)),
            )
            .child(
                div()
                    .v_flex()
                    .w(px(400.))
                    .h_full()
                    .flex_shrink_0()
                    .bg(theme.sidebar)
                    .overflow_hidden()
                    .child(self.side_player_view.clone().into_any_element())
                    .child(div().flex_1()),
            )
    }
}
