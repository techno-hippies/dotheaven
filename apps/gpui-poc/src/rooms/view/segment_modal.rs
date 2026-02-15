use super::*;

impl RoomsView {
    pub(super) fn render_segment_modal(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let input_box = |input_state: &Entity<InputState>, suffix: Option<&'static str>| {
            div()
                .h(px(42.))
                .w_full()
                .rounded_full()
                .border_1()
                .border_color(theme.border)
                .bg(theme.background)
                .px_4()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .flex_1()
                        .child(Input::new(input_state).appearance(false).cleanable(false)),
                )
                .when_some(suffix, |el, value| {
                    el.child(
                        div()
                            .text_sm()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.muted_foreground)
                            .child(value),
                    )
                })
        };

        let section_label = |text: &'static str| {
            div()
                .text_lg()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground)
                .child(text)
        };

        let pill_button = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .h(px(36.))
                .px_4()
                .rounded_full()
                .bg(theme.primary)
                .border_1()
                .border_color(theme.primary)
                .h_flex()
                .items_center()
                .justify_center()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.primary_foreground)
                .child(label)
        };

        let secondary_button = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .h(px(36.))
                .px_4()
                .rounded_full()
                .bg(hsla(0.0, 0.0, 0.15, 0.7))
                .border_1()
                .border_color(theme.border)
                .h_flex()
                .items_center()
                .justify_center()
                .text_sm()
                .font_weight(FontWeight::MEDIUM)
                .text_color(theme.foreground)
                .child(label)
        };

        let can_search = !self.segment_search_pending;
        let can_start = !self.segment_start_pending;

        let mut search_btn = pill_button(
            "rooms-segment-search-btn",
            if self.segment_search_pending {
                "Searching..."
            } else {
                "Search"
            },
        );
        if can_search {
            search_btn = search_btn
                .cursor_pointer()
                .hover({
                    let hover = theme.primary_hover;
                    move |s| s.bg(hover)
                })
                .on_click(cx.listener(|this, _, _, cx| {
                    this.search_segment_songs(cx);
                }));
        } else {
            search_btn = search_btn.opacity(0.7);
        }

        let mut start_btn = pill_button(
            "rooms-segment-start-btn",
            if self.segment_start_pending {
                "Starting..."
            } else {
                "Start Segment"
            },
        );
        if can_start {
            start_btn = start_btn
                .cursor_pointer()
                .hover({
                    let hover = theme.primary_hover;
                    move |s| s.bg(hover)
                })
                .on_click(cx.listener(|this, _, _, cx| {
                    this.submit_start_segment(cx);
                }));
        } else {
            start_btn = start_btn.opacity(0.7);
        }

        let cancel_btn = secondary_button("rooms-segment-cancel-btn", "Cancel")
            .cursor_pointer()
            .hover(|s| s.border_color(hsla(0.0, 0.0, 0.35, 1.0)))
            .on_click(cx.listener(|this, _, _, cx| {
                this.close_segment_modal(cx);
            }));

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.65))
            .flex()
            .items_start()
            .justify_center()
            .py_6()
            .child(
                div()
                    .w(px(640.))
                    .max_h(px(720.))
                    .mx_5()
                    .rounded(px(14.))
                    .bg(theme.sidebar)
                    .border_1()
                    .border_color(theme.border)
                    .v_flex()
                    .overflow_hidden()
                    .p_5()
                    .gap_4()
                    .child(
                        div()
                            .h_flex()
                            .items_start()
                            .justify_between()
                            .child(
                                div()
                                    .v_flex()
                                    .gap_1()
                                    .child(
                                        div()
                                            .text_3xl()
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(theme.foreground)
                                            .child("New Segment"),
                                    )
                                    .child(
                                        div()
                                            .text_color(theme.muted_foreground)
                                            .child("Segment boundaries are manual (host-driven). Existing paid entitlements are grandfathered."),
                                    ),
                            )
                            .child(
                                div()
                                    .id("rooms-segment-close")
                                    .size(px(34.))
                                    .rounded_full()
                                    .bg(theme.muted)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.close_segment_modal(cx);
                                    }))
                                    .child(
                                        gpui::svg()
                                            .path("icons/x.svg")
                                            .size(px(14.))
                                            .text_color(theme.foreground),
                                    ),
                            ),
                    )
                    .child(section_label("Song (optional)",))
                    .child(
                        div()
                            .h_flex()
                            .gap_2()
                            .child(div().flex_1().child(input_box(
                                &self.segment_song_query_input_state,
                                None,
                            )))
                            .child(search_btn),
                    )
                    .when_some(self.segment_selected_song.clone(), |el, selected| {
                        let mut clear_btn = secondary_button("rooms-segment-clear-song", "Clear")
                            .cursor_pointer()
                            .hover(|s| s.border_color(hsla(0.0, 0.0, 0.35, 1.0)))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.clear_segment_song_selection(cx);
                            }));
                        clear_btn = clear_btn.h(px(32.)).px_3().text_xs();

                        el.child(
                            div()
                                .p_3()
                                .rounded(px(12.))
                                .border_1()
                                .border_color(theme.border)
                                .bg(theme.background)
                                .v_flex()
                                .gap_2()
                                .child(
                                    div()
                                        .h_flex()
                                        .items_center()
                                        .justify_between()
                                        .child(
                                            div()
                                                .v_flex()
                                                .gap_1()
                                                .child(
                                                    div()
                                                        .font_weight(FontWeight::SEMIBOLD)
                                                        .text_color(theme.foreground)
                                                        .child(format!(
                                                            "{} — {}",
                                                            selected.title,
                                                            selected.artist
                                                        )),
                                                )
                                                .child(
                                                    div()
                                                        .text_sm()
                                                        .text_color(theme.muted_foreground)
                                                        .child(format!(
                                                            "Story IP: {} | upstream: {} bps | payout: {}",
                                                            truncate_text(&selected.story_ip_id, 56),
                                                            selected.default_upstream_bps,
                                                            short_address(&selected.payout_address),
                                                        )),
                                                ),
                                        )
                                        .child(clear_btn),
                                ),
                        )
                    })
                    .when(
                        self.segment_selected_song.is_none()
                            && !self.segment_song_results.is_empty(),
                        |el| {
                            el.child(
                                div()
                                    .v_flex()
                                    .gap_2()
                                    .children(self.segment_song_results.iter().map(|song| {
                                        let song_clone = song.clone();
                                        div()
                                            .id(SharedString::from(format!(
                                                "rooms-segment-song-{}",
                                                song.song_id
                                            )))
                                            .p_3()
                                            .rounded(px(12.))
                                            .border_1()
                                            .border_color(theme.border)
                                            .bg(theme.background)
                                            .cursor_pointer()
                                            .hover(|s| s.border_color(hsla(0.73, 0.74, 0.80, 1.0)))
                                            .on_click(cx.listener(move |this, _, _, cx| {
                                                this.select_segment_song(song_clone.clone(), cx);
                                            }))
                                            .child(
                                                div()
                                                    .v_flex()
                                                    .gap_1()
                                                    .child(
                                    div()
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(theme.foreground)
                                        .child(format!(
                                            "{} — {}",
                                            song.title.as_str(),
                                            song.artist.as_str(),
                                        )),
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(theme.muted_foreground)
                                                            .child(format!(
                                                                "upstream: {} bps | payout: {}",
                                                                song.default_upstream_bps,
                                                                short_address(&song.payout_address),
                                                            )),
                                                    ),
                                            )
                                    })),
                            )
                        },
                    )
                    .child(div().border_t_1().border_color(theme.border))
                    .child(section_label("Receiver (payTo)"))
                    .child(input_box(&self.segment_pay_to_input_state, None))
                    .when_some(self.segment_modal_error.clone(), |el, error| {
                        el.child(
                            div()
                                .px_3()
                                .py_2()
                                .rounded(px(8.))
                                .bg(hsla(0.0, 0.52, 0.22, 0.35))
                                .text_sm()
                                .text_color(hsla(0.0, 0.90, 0.74, 1.0))
                                .child(error),
                        )
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(cancel_btn)
                            .child(start_btn),
                    ),
            )
    }
}
