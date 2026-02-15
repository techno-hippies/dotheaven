use super::*;

pub(super) fn render_playlist_detail_placeholder_row(index: usize) -> impl IntoElement {
    let shimmer_bg = hsla(0., 0., 1., 0.08);
    let shimmer_bar = |w: f32| div().h(px(12.)).w(px(w)).rounded(px(4.)).bg(shimmer_bg);

    div()
        .id(ElementId::Name(
            format!("playlist-track-placeholder-{index}").into(),
        ))
        .h_flex()
        .w_full()
        .h(px(ROW_HEIGHT))
        .px_4()
        .items_center()
        .cursor_default()
        .bg(if index % 2 == 0 {
            hsla(0., 0., 0., 0.)
        } else {
            BG_HIGHLIGHT
        })
        .child(
            div()
                .w(px(48.))
                .text_sm()
                .text_color(TEXT_DIM)
                .child(format!("{}", index + 1)),
        )
        .child(
            div()
                .h_flex()
                .w(px(TITLE_COLUMN_WIDTH))
                .flex_none()
                .min_w_0()
                .gap_3()
                .items_center()
                .child(div().size(px(40.)).rounded(px(6.)).bg(BG_ELEVATED))
                .child(
                    div()
                        .v_flex()
                        .gap(px(6.))
                        .child(shimmer_bar(210.))
                        .child(shimmer_bar(120.)),
                ),
        )
        .child(
            div()
                .w(px(DETAIL_ARTIST_COLUMN_WIDTH))
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .child(shimmer_bar(140.)),
        )
        .child(
            div()
                .pl_4()
                .min_w(px(DETAIL_ALBUM_COLUMN_WIDTH))
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .child(shimmer_bar(180.)),
        )
        // storage status col
        .child(div().w(px(36.)))
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(52.))
                        .h_flex()
                        .justify_end()
                        .child(shimmer_bar(36.)),
                )
                .child(div().w(px(36.))),
        )
}

pub(super) fn render_playlist_detail_track_row(
    track: &PlaylistDetailTrack,
    index: usize,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    let track_id_for_log = track.track_id.clone();
    let title_for_status = track.title.clone();
    let title_for_log = track.title.clone();
    let artist_for_log = track.artist.clone();
    let album_for_log = track.album.clone();
    div()
        .id(ElementId::Name(format!("playlist-track-{index}").into()))
        .h_flex()
        .w_full()
        .h(px(ROW_HEIGHT))
        .px_4()
        .items_center()
        .cursor_pointer()
        .bg(if index % 2 == 0 {
            Hsla {
                h: 0.,
                s: 0.,
                l: 0.,
                a: 0.,
            }
        } else {
            BG_HIGHLIGHT
        })
        .hover(|s| s.bg(BG_HOVER))
        .on_click(move |ev, _window, cx| {
            let is_double = match ev {
                ClickEvent::Mouse(m) => m.down.click_count == 2,
                _ => false,
            };
            let is_mouse = matches!(ev, ClickEvent::Mouse(_));
            if !is_mouse {
                return;
            }
            let _ = entity.update(cx, |this, cx| {
                if is_double {
                    log::warn!(
                        "[Library] playlist detail row double-click has no local mapping: trackId={}, title='{}', artist='{}', album='{}'",
                        track_id_for_log,
                        title_for_log,
                        artist_for_log,
                        album_for_log,
                    );
                }
                this.set_status_message(
                    format!(
                        "\"{}\" isn't in your local library yet, so playback is unavailable.",
                        title_for_status
                    ),
                    cx,
                );
            });
        })
        .child(
            div()
                .w(px(48.))
                .text_sm()
                .text_color(TEXT_DIM)
                .child(format!("{}", index + 1)),
        )
        .child(
            div()
                .h_flex()
                .w(px(TITLE_COLUMN_WIDTH))
                .flex_none()
                .min_w_0()
                .gap_3()
                .items_center()
                .child(
                    div()
                        .size(px(40.))
                        .rounded(px(6.))
                        .bg(BG_ELEVATED)
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/music-note.svg")
                                .size(px(16.))
                                .text_color(TEXT_DIM),
                        ),
                )
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_PRIMARY)
                        .truncate()
                        .child(track.title.clone()),
                ),
        )
        .child(
            div()
                .w(px(DETAIL_ARTIST_COLUMN_WIDTH))
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_SECONDARY)
                .truncate()
                .child(track.artist.clone()),
        )
        .child(
            div()
                .pl_4()
                .min_w(px(DETAIL_ALBUM_COLUMN_WIDTH))
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_MUTED)
                .truncate()
                .child(track.album.clone()),
        )
        .child(
            // Storage status icon (matches library table layout).
            render_storage_status_icon(track.storage_status),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(52.))
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .h_flex()
                        .justify_end()
                        .child(track.duration.clone()),
                )
                // Spacer for overflow-menu column parity with main library rows.
                .child(div().w(px(36.))),
        )
}
