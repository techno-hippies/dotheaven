use super::*;
use gpui_component::scroll::ScrollableElement;
use gpui_component::StyledExt;

mod playlists;
mod scrobbles;

impl Render for ProfileView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let entity = cx.entity().clone();

        div()
            .id("profile-root")
            .v_flex()
            .size_full()
            .bg(BG_PAGE())
            .child(
                div()
                    .id("profile-scroll")
                    .flex_1()
                    .w_full()
                    .overflow_y_scroll()
                    .track_scroll(&self.scroll_handle)
                    .pb_8()
                    .child(render_banner())
                    .child(
                        div()
                            .v_flex()
                            .w_full()
                            .px_6()
                            .pt(px(88.))
                            .pb_4()
                            .gap_4()
                            .child(render_identity_row(self, cx))
                            .child(render_bio_and_stats())
                            .child(render_tabs(self.active_tab, cx))
                            .child(match self.active_tab {
                                ProfileTab::Scrobbles => render_scrobbles_panel(self, entity, cx),
                                ProfileTab::Playlists => {
                                    playlists::render_playlists_panel(self, cx)
                                }
                                ProfileTab::Rooms | ProfileTab::Music | ProfileTab::About => {
                                    div().h(px(260.)).w_full().into_any_element()
                                }
                            }),
                    )
                    .vertical_scrollbar(&self.scroll_handle),
            )
    }
}

fn render_banner() -> impl IntoElement {
    div()
        .relative()
        .w_full()
        .h(px(220.))
        .child(
            div()
                .absolute()
                .top_0()
                .left_0()
                .right_0()
                .bottom_0()
                .overflow_hidden()
                .bg(BG_BANNER)
                .child(
                    div()
                        .absolute()
                        .top(px(-120.))
                        .left(px(-80.))
                        .size(px(300.))
                        .rounded_full()
                        .bg(BG_BANNER_GLOW_A),
                )
                .child(
                    div()
                        .absolute()
                        .top(px(-120.))
                        .right(px(-120.))
                        .size(px(340.))
                        .rounded_full()
                        .bg(BG_BANNER_GLOW_B),
                )
                .child(
                    div()
                        .absolute()
                        .top(px(10.))
                        .left(px(280.))
                        .size(px(260.))
                        .rounded_full()
                        .bg(BG_BANNER_GLOW_C),
                )
                .child(
                    div()
                        .absolute()
                        .top_0()
                        .left_0()
                        .right_0()
                        .bottom_0()
                        .bg(hsla(0., 0., 0., 0.35)),
                ),
        )
        .child(
            div()
                .absolute()
                .left(px(26.))
                .bottom(px(-56.))
                .size(px(116.))
                .rounded_full()
                .border_3()
                .border_color(BG_PAGE())
                .bg(BG_AVATAR)
                .flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/user.svg")
                        .size(px(52.))
                        .text_color(TEXT_DIM()),
                ),
        )
}

fn render_identity_row(view: &ProfileView, cx: &mut Context<ProfileView>) -> impl IntoElement {
    div()
        .h_flex()
        .w_full()
        .items_start()
        .justify_between()
        .gap_4()
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .text_2xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY())
                        .child(PROFILE_DISPLAY_NAME),
                )
                .child(div().text_sm().text_color(TEXT_MUTED()).child(PROFILE_HANDLE)),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_3()
                .child(render_follow_button(view.is_following, cx))
                .child(render_message_button(cx)),
        )
}

fn render_follow_button(is_following: bool, cx: &mut Context<ProfileView>) -> impl IntoElement {
    let bg = if is_following {
        BG_SURFACE()
    } else {
        ACCENT_BLUE()
    };
    let text = if is_following { "Following" } else { "Follow" };
    let text_color = if is_following { TEXT_PRIMARY() } else { BG_PAGE() };

    div()
        .id("profile-follow-button")
        .h(px(42.))
        .min_w(px(128.))
        .px_6()
        .rounded_full()
        .cursor_pointer()
        .bg(bg)
        .hover(move |s| {
            if is_following {
                s.bg(BG_HOVER())
            } else {
                s.bg(ACCENT_BLUE_HOVER)
            }
        })
        .on_click(cx.listener(|this, _, _, cx| {
            this.is_following = !this.is_following;
            cx.notify();
        }))
        .flex()
        .items_center()
        .justify_center()
        .child(
            div()
                .text_base()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(text_color)
                .child(text),
        )
}

fn render_message_button(cx: &mut Context<ProfileView>) -> impl IntoElement {
    div()
        .id("profile-message-button")
        .h(px(42.))
        .min_w(px(128.))
        .px_6()
        .rounded_full()
        .border_1()
        .border_color(BORDER_SUBTLE())
        .cursor_pointer()
        .hover(|s| s.bg(BG_HOVER()))
        .on_click(cx.listener(|this, _, window, cx| {
            this.open_message_compose(window, cx);
            cx.notify();
        }))
        .flex()
        .items_center()
        .justify_center()
        .child(
            div()
                .text_base()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(TEXT_PRIMARY())
                .child("Message"),
        )
}

fn render_bio_and_stats() -> impl IntoElement {
    div()
        .v_flex()
        .gap_3()
        .child(
            div()
                .text_color(TEXT_SECONDARY())
                .max_w(px(760.))
                .child(PROFILE_BIO),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_5()
                .child(follow_count(PROFILE_FOLLOWERS, "followers"))
                .child(follow_count(PROFILE_FOLLOWING, "following")),
        )
}

fn follow_count(value: usize, label: &'static str) -> impl IntoElement {
    div()
        .h_flex()
        .items_center()
        .gap_1()
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(TEXT_PRIMARY())
                .child(value.to_string()),
        )
        .child(div().text_color(TEXT_MUTED()).child(label))
}

fn render_tabs(active_tab: ProfileTab, cx: &mut Context<ProfileView>) -> impl IntoElement {
    div()
        .relative()
        .w_full()
        .h(px(70.))
        .child(
            div()
                .absolute()
                .left_0()
                .right_0()
                .bottom_0()
                .h(px(2.))
                .bg(BORDER_SUBTLE()),
        )
        .child(
            div()
                .h_flex()
                .h_full()
                .justify_start()
                .children(ProfileTab::all().into_iter().map(|tab| {
                    let is_active = active_tab == tab;
                    div()
                        .id(SharedString::from(format!(
                            "profile-tab-{}",
                            tab.label().to_lowercase()
                        )))
                        .h_full()
                        .w(px(170.))
                        .v_flex()
                        .items_center()
                        .justify_end()
                        .gap_2()
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.active_tab = tab;
                            cx.notify();
                        }))
                        .child(
                            div()
                                .text_sm()
                                .font_weight(if is_active {
                                    FontWeight::SEMIBOLD
                                } else {
                                    FontWeight::MEDIUM
                                })
                                .text_color(if is_active { TEXT_PRIMARY() } else { TEXT_MUTED() })
                                .child(tab.label()),
                        )
                        .child(
                            div()
                                .h(px(2.))
                                .w(px(tab.indicator_width() + 24.))
                                .rounded(px(2.))
                                .bg(if is_active {
                                    ACCENT_BLUE()
                                } else {
                                    hsla(0., 0., 0., 0.)
                                }),
                        )
                })),
        )
}

fn render_scrobbles_panel(
    view: &ProfileView,
    entity: Entity<ProfileView>,
    cx: &mut Context<ProfileView>,
) -> AnyElement {
    if view.scrobbles.is_empty() {
        if view.scrobbles_loading {
            return div()
                .v_flex()
                .w_full()
                .py_10()
                .items_center()
                .justify_center()
                .child(div().text_color(TEXT_MUTED()).child("Loading scrobbles..."))
                .into_any_element();
        }

        if let Some(err) = &view.scrobbles_error {
            return div()
                .v_flex()
                .w_full()
                .py_8()
                .items_center()
                .justify_center()
                .gap_3()
                        .child(
                            div()
                                .text_sm()
                                .text_color(TEXT_MUTED())
                                .child(format!("Failed to load scrobbles: {err}")),
                        )
                .child(
                    div()
                        .id("profile-scrobbles-retry")
                        .h(px(36.))
                        .px_4()
                        .rounded(px(8.))
                        .border_1()
                        .border_color(BORDER_SUBTLE())
                        .cursor_pointer()
                        .hover(|s| s.bg(BG_HOVER()))
                        .on_click(cx.listener(|this, _, _window, cx| {
                            this.refresh_scrobbles_for_auth_force(cx);
                            cx.notify();
                        }))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            div()
                                .text_sm()
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(TEXT_PRIMARY())
                                .child("Retry"),
                        ),
                )
                .into_any_element();
        }

        return div()
            .v_flex()
            .w_full()
            .py_10()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED())
                    .child("No scrobbles yet."),
            )
            .into_any_element();
    }

    scrobbles::render_scrobble_timeline(&view.scrobbles, entity).into_any_element()
}
