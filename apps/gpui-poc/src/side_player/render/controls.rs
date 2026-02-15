use super::*;

pub(super) fn render_transport_controls(
    is_playing: bool,
    audio: AudioHandle,
    library_view: Entity<library::LibraryView>,
) -> impl IntoElement {
    let lib_prev = library_view.clone();
    let lib_next = library_view;

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
                        audio.pause();
                    } else {
                        audio.resume();
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
        )
}
