use super::*;

impl LibraryView {
    pub(in crate::library) fn render_playlist_share_modal(
        &self,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let playlist_name = self
            .playlist_share_modal_playlist_name
            .as_deref()
            .unwrap_or("Selected playlist");
        let track_count = self.playlist_detail_tracks.len();

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.55))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .relative()
                    .w(px(560.))
                    .max_w(px(660.))
                    .mx_4()
                    .rounded(px(14.))
                    .bg(BG_ELEVATED())
                    .border_1()
                    .border_color(BORDER_SUBTLE())
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::BOLD)
                            .text_color(TEXT_PRIMARY())
                            .child("Share Playlist"),
                    )
                    .child(div().text_sm().text_color(TEXT_MUTED()).child(format!(
                        "Grant decrypt access for {track_count} track{} in \"{}\"",
                        if track_count == 1 { "" } else { "s" },
                        playlist_name
                    )))
                    .child(
                        div()
                            .h(px(44.))
                            .rounded_full()
                            .bg(BG_HOVER())
                            .px_3()
                            .flex()
                            .items_center()
                            .child(
                                div().flex_1().child(
                                    Input::new(&self.share_wallet_input_state)
                                        .appearance(false)
                                        .cleanable(false),
                                ),
                            ),
                    )
                    .when_some(self.playlist_share_modal_error.clone(), |el: Div, err| {
                        el.child(div().text_color(hsla(0., 0.7, 0.6, 1.)).child(err))
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("playlist-share-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_playlist_share_modal(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY()).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("playlist-share-submit-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(ACCENT_BLUE())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.submit_playlist_share_modal(cx);
                                    }))
                                    .child(div().text_color(hsla(0., 0., 0.09, 1.)).child(
                                        if self.playlist_share_modal_submitting {
                                            "Sharing..."
                                        } else {
                                            "Share"
                                        },
                                    )),
                            ),
                    ),
            )
    }
}
