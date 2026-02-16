use super::*;

impl LibraryView {
    pub(in crate::library) fn render_delete_playlist_modal(
        &self,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let playlist_name = self
            .delete_playlist_modal_playlist_name
            .as_deref()
            .unwrap_or("Playlist")
            .to_string();
        let playlist_id = self
            .delete_playlist_modal_playlist_id
            .as_deref()
            .unwrap_or("")
            .to_string();

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
                    .w(px(540.))
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
                            .child("Delete Playlist"),
                    )
                    .child(div().text_base().text_color(TEXT_MUTED()).child(format!(
                        "This will permanently delete \"{}\" ({}).",
                        playlist_name,
                        if playlist_id.trim().is_empty() {
                            "missing id".to_string()
                        } else {
                            abbreviate_for_status(&playlist_id)
                        }
                    )))
                    .child(
                        div()
                            .text_base()
                            .text_color(TEXT_AMBER)
                            .child("This cannot be undone."),
                    )
                    .when_some(self.delete_playlist_modal_error.clone(), |el: Div, err| {
                        el.child(
                            div()
                                .text_base()
                                .text_color(hsla(0., 0.7, 0.6, 1.))
                                .child(err),
                        )
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("delete-playlist-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_delete_playlist_modal(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY()).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("delete-playlist-submit-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(hsla(0., 0.7, 0.55, 1.))
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.submit_delete_playlist_modal(cx);
                                    }))
                                    .child(div().text_color(hsla(0., 0., 0.09, 1.)).child(
                                        if self.delete_playlist_modal_submitting {
                                            "Deleting..."
                                        } else {
                                            "Delete"
                                        },
                                    )),
                            ),
                    ),
            )
    }
}
