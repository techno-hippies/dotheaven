use super::*;
use gpui_component::scroll::ScrollableElement;

pub(super) fn render_lyrics_panel(
    lyrics_state: &LyricsFetchState,
    playback_position_sec: f64,
    lyrics_scroll_handle: &ScrollHandle,
    active_synced_idx: Option<usize>,
) -> impl IntoElement {
    let mut panel = div()
        .v_flex()
        .gap_2()
        .pt_3()
        .mt_1()
        .border_t_1()
        .border_color(hsla(0., 0., 0.21, 1.))
        .child(
            div().h_flex().items_center().justify_between().child(
                div()
                    .text_sm()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(hsla(0., 0., 0.90, 1.))
                    .child("Lyrics"),
            ),
        );

    match lyrics_state {
        LyricsFetchState::Idle => {}
        LyricsFetchState::Loading => {}
        LyricsFetchState::Error(err) => {
            panel = panel
                .child(render_source_badge("Lyrics lookup error"))
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0.10, 0.85, 0.72, 1.))
                        .child(short_error(err)),
                );
        }
        LyricsFetchState::Ready(lyrics) => {
            if lyrics.source == crate::lyrics::LyricsSource::NoMatch {
                panel = panel.child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.58, 1.))
                        .child("No lyrics found."),
                );
            } else if !lyrics.has_any_lyrics() {
                panel = panel.child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.58, 1.))
                        .child("Instrumental"),
                );
            } else if !lyrics.synced_lines.is_empty() {
                let active_idx = active_synced_idx
                    .or_else(|| active_synced_index(&lyrics.synced_lines, playback_position_sec));
                panel = panel.child(render_synced_lyrics(
                    &lyrics.synced_lines,
                    active_idx,
                    lyrics_scroll_handle,
                ));
            } else if let Some(plain) = lyrics.plain_lyrics.as_deref() {
                panel = panel.child(render_plain_lyrics(plain, lyrics_scroll_handle));
            }
        }
    }

    panel
}

fn render_source_badge(label: &str) -> impl IntoElement {
    div().h_flex().items_center().gap_1().child(
        div()
            .px_2()
            .py(px(3.))
            .rounded_full()
            .bg(hsla(0., 0., 0.22, 1.))
            .text_xs()
            .text_color(hsla(0., 0., 0.82, 1.))
            .child(label.to_string()),
    )
}

fn render_synced_lyrics(
    lines: &[crate::lyrics::LyricsLine],
    active_idx: Option<usize>,
    scroll_handle: &ScrollHandle,
) -> impl IntoElement {
    let mut list = div()
        .id("side-player-synced-lyrics-list")
        .v_flex()
        .gap_1()
        .max_h(px(280.))
        .w_full()
        .min_w_0()
        .overflow_y_scroll()
        .track_scroll(scroll_handle);

    for (idx, line) in lines.iter().enumerate() {
        let is_active = active_idx == Some(idx);
        let text_color = if is_active {
            hsla(0., 0., 0.96, 1.)
        } else {
            hsla(0., 0., 0.64, 1.)
        };
        let bg = if is_active {
            hsla(0.62, 0.60, 0.44, 0.50)
        } else {
            hsla(0., 0., 0., 0.)
        };
        list = list.child(
            div()
                .w_full()
                .min_w_0()
                .px_2()
                .py(px(3.))
                .rounded(px(6.))
                .bg(bg)
                .child(div().min_w_0().text_sm().text_color(text_color).child(
                    if line.text.trim().is_empty() {
                        " ".to_string()
                    } else {
                        line.text.clone()
                    },
                )),
        );
    }

    list.vertical_scrollbar(scroll_handle)
}

fn render_plain_lyrics(text: &str, scroll_handle: &ScrollHandle) -> impl IntoElement {
    let mut body = div()
        .id("side-player-plain-lyrics-list")
        .v_flex()
        .gap_1()
        .max_h(px(280.))
        .overflow_y_scroll()
        .track_scroll(scroll_handle);
    for line in text.lines() {
        body = body.child(
            div()
                .w_full()
                .min_w_0()
                .text_sm()
                .text_color(hsla(0., 0., 0.68, 1.))
                .child(if line.trim().is_empty() {
                    " ".to_string()
                } else {
                    line.to_string()
                }),
        );
    }
    body.vertical_scrollbar(scroll_handle)
}

pub(super) fn active_synced_index(
    lines: &[crate::lyrics::LyricsLine],
    playback_position_sec: f64,
) -> Option<usize> {
    if lines.is_empty() {
        return None;
    }

    let adjusted_position = playback_position_sec + 0.02;
    if adjusted_position < lines[0].start_sec {
        return Some(0);
    }

    let mut active = 0usize;
    for (idx, line) in lines.iter().enumerate().skip(1) {
        if line.start_sec <= adjusted_position {
            active = idx;
        } else {
            break;
        }
    }
    Some(active)
}

fn short_error(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.len() <= 140 {
        return trimmed.to_string();
    }
    format!("{}...", &trimmed[..140])
}
