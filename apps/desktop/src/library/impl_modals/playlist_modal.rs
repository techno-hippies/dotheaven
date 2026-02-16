use super::*;
use std::path::Path;

impl LibraryView {
    pub(in crate::library) fn render_playlist_modal(
        &self,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let track_title = self
            .playlist_modal_track_index
            .and_then(|i| self.tracks.get(i))
            .map(|t| t.title.clone())
            .unwrap_or_else(|| "Selected track".to_string());
        let picked_cover_file = self
            .playlist_modal_cover_image_path
            .as_deref()
            .and_then(|path| Path::new(path).file_name())
            .and_then(|name| name.to_str())
            .map(str::to_string);
        let cover_hint = if let Some(file_name) = picked_cover_file.as_deref() {
            format!("Custom cover: {file_name}")
        } else {
            "Cover art: from selected track (or choose custom image)".to_string()
        };

        let mut playlists_list = div().v_flex().gap_2();
        if self.playlist_modal_loading {
            playlists_list = playlists_list.child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED())
                    .child("Loading your playlists..."),
            );
        } else if self.playlist_modal_playlists.is_empty() {
            playlists_list = playlists_list.child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED())
                    .child("No playlists yet. Enter a name below to create one."),
            );
        } else {
            for playlist in &self.playlist_modal_playlists {
                let playlist_id = playlist.id.clone();
                let playlist_id_for_click = playlist_id.clone();
                let is_pending = self
                    .pending_playlist_mutations
                    .iter()
                    .any(|mutation| mutation.playlist_id.eq_ignore_ascii_case(&playlist_id));
                let row_info = if is_pending {
                    format!("{} track(s) • syncing...", playlist.track_count)
                } else {
                    format!("{} track(s) • click to add", playlist.track_count)
                };
                let is_selected = self
                    .playlist_modal_selected_playlist_id
                    .as_deref()
                    .map(|v| v.eq_ignore_ascii_case(&playlist_id))
                    .unwrap_or(false);
                let row_bg = if is_selected {
                    BG_HOVER()
                } else {
                    hsla(0., 0., 0., 0.)
                };
                playlists_list = playlists_list.child(
                    div()
                        .id(ElementId::Name(
                            format!("playlist-select-{}", playlist_id).into(),
                        ))
                        .h_flex()
                        .items_center()
                        .justify_between()
                        .gap_3()
                        .px_3()
                        .py_2()
                        .rounded(px(8.))
                        .bg(row_bg)
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _, _window, cx| {
                            this.playlist_modal_selected_playlist_id =
                                Some(playlist_id_for_click.clone());
                            this.playlist_modal_error = None;
                            this.submit_playlist_modal(cx);
                        }))
                        .child(
                            div()
                                .v_flex()
                                .min_w_0()
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(TEXT_PRIMARY())
                                        .truncate()
                                        .child(playlist.name.clone()),
                                )
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(TEXT_MUTED())
                                        .truncate()
                                        .child(row_info),
                                ),
                        )
                        .child(div().text_xs().text_color(TEXT_DIM()).child(
                            match playlist.visibility {
                                0 => "Public",
                                1 => "Unlisted",
                                2 => "Private",
                                _ => "Custom",
                            },
                        )),
                );
            }
        }

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
                    .w(px(620.))
                    .max_w(px(700.))
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
                            .child("Add To Playlist"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED())
                            .child(format!("Selected track: \"{}\"", track_title)),
                    )
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .flex_1()
                                    .h(px(40.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .px_3()
                                    .flex()
                                    .items_center()
                                    .child(
                                        Input::new(&self.playlist_name_input_state)
                                            .appearance(false)
                                            .cleanable(false),
                                    ),
                            )
                            .child(
                                div()
                                    .id("playlist-modal-refresh-btn")
                                    .px_3()
                                    .h(px(36.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.fetch_playlists_for_modal(cx);
                                    }))
                                    .child(
                                        div().text_sm().text_color(TEXT_PRIMARY()).child("Refresh"),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .id("playlist-modal-pick-cover-btn")
                                    .px_3()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.pick_playlist_modal_cover_image(cx);
                                    }))
                                    .child(
                                        div()
                                            .text_sm()
                                            .text_color(TEXT_PRIMARY())
                                            .child("Choose Cover"),
                                    ),
                            )
                            .when(picked_cover_file.is_some(), |el| {
                                el.child(
                                    div()
                                        .id("playlist-modal-clear-cover-btn")
                                        .px_3()
                                        .h(px(34.))
                                        .rounded_full()
                                        .bg(BG_HOVER())
                                        .cursor_pointer()
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .on_click(cx.listener(|this, _, _window, cx| {
                                            this.clear_playlist_modal_cover_image(cx);
                                        }))
                                        .child(
                                            div()
                                                .text_sm()
                                                .text_color(TEXT_PRIMARY())
                                                .child("Clear"),
                                        ),
                                )
                            })
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(TEXT_MUTED())
                                    .truncate()
                                    .child(cover_hint),
                            ),
                    )
                    .child(
                        div()
                            .max_h(px(220.))
                            .overflow_hidden()
                            .child(playlists_list),
                    )
                    .when_some(self.playlist_modal_error.clone(), |el: Div, err| {
                        el.child(div().text_color(hsla(0., 0.7, 0.6, 1.)).child(err))
                    })
                    .when(self.playlist_modal_needs_reauth, |el| {
                        el.child(
                            div().h_flex().items_center().justify_end().child(
                                div()
                                    .id("playlist-modal-reauth-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(ACCENT_BLUE())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.trigger_playlist_modal_reauth(cx);
                                    }))
                                    .child(div().text_color(hsla(0., 0., 0.09, 1.)).child(
                                        if self.playlist_modal_reauth_busy {
                                            "Signing in..."
                                        } else {
                                            "Sign in again"
                                        },
                                    )),
                            ),
                        )
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("playlist-modal-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_playlist_modal(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY()).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("playlist-modal-create-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER())
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.submit_playlist_modal_create(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY()).child(
                                        if self.playlist_modal_submitting {
                                            "Working..."
                                        } else {
                                            "Create"
                                        },
                                    )),
                            ),
                    ),
            )
    }
}
