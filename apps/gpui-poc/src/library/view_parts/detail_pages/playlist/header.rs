use super::*;

use super::cover::render_playlist_cover_art;

pub(super) fn render_playlist_header_row(
    title: &str,
    subtitle: &str,
    playlist_cover_cid: Option<&str>,
    fallback_cover_paths: &[String],
    optimistic_cover_path: Option<&str>,
    cover_update_busy: bool,
) -> impl IntoElement {
    div()
        .h_flex()
        .items_end()
        .gap_6()
        .child(render_playlist_cover_art(
            playlist_cover_cid,
            fallback_cover_paths,
            optimistic_cover_path,
            cover_update_busy,
        ))
        .child(
            div()
                .v_flex()
                .gap_2()
                .pb_1()
                .min_w_0()
                .child(
                    div()
                        .text_xs()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_DIM)
                        .child("PLAYLIST"),
                )
                .child(
                    div()
                        .text_3xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .truncate()
                        .child(title.to_string()),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_SECONDARY)
                        .child(subtitle.to_string()),
                ),
        )
}
