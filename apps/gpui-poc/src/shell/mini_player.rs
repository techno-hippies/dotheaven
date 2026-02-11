use gpui::*;
use gpui_component::{
    button::{Button, ButtonVariants},
    Sizable, StyledExt,
};

use crate::icons::PhosphorIcon;

/// Side player panel content (right column) — matches the web app's SidePlayer.
pub fn build_side_player() -> impl IntoElement {
    div()
        .v_flex()
        .w_full()
        .gap_3()
        .p_5()
        // Album art placeholder — square (360 = 400 - 2*20 padding)
        .child(
            div()
                .size(px(360.))
                .rounded(px(8.))
                .bg(hsla(0., 0., 0.15, 1.)) // bg-elevated
                .flex()
                .items_center()
                .justify_center()
                // Music note watermark
                .child(
                    gpui::svg()
                        .path("icons/music-notes.svg")
                        .size(px(72.))
                        .text_color(hsla(0., 0., 0.25, 1.)),
                ),
        )
        // Track info
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .text_color(hsla(0., 0., 0.98, 1.)) // text-primary
                        .font_weight(FontWeight::SEMIBOLD)
                        .child("No track playing"),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.64, 1.)) // text-muted
                        .child("Unknown artist"),
                ),
        )
        // Timestamps + progress bar
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .h_flex()
                        .justify_between()
                        .child(
                            div()
                                .text_xs()
                                .text_color(hsla(0., 0., 0.64, 1.))
                                .child("0:00"),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(hsla(0., 0., 0.64, 1.))
                                .child("0:00"),
                        ),
                )
                .child(
                    div()
                        .w_full()
                        .h(px(4.))
                        .rounded_full()
                        .bg(hsla(0., 0., 0.15, 1.)), // bg-elevated
                ),
        )
        // Transport controls: Shuffle | SkipBack | Play | SkipForward | Repeat
        .child(
            div()
                .h_flex()
                .justify_center()
                .items_center()
                .gap_2()
                .child(
                    Button::new("shuffle")
                        .ghost()
                        .icon(PhosphorIcon::Shuffle)
                        .small(),
                )
                .child(
                    Button::new("prev")
                        .ghost()
                        .icon(PhosphorIcon::SkipBackFill)
                        .small(),
                )
                .child(
                    // Large play button — white bg, dark icon
                    div()
                        .size(px(40.))
                        .rounded_full()
                        .bg(hsla(0., 0., 0.98, 1.)) // white
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .child(
                            gpui::svg()
                                .path("icons/play-fill.svg")
                                .size(px(20.))
                                .text_color(hsla(0., 0., 0.09, 1.)), // dark
                        ),
                )
                .child(
                    Button::new("next")
                        .ghost()
                        .icon(PhosphorIcon::SkipForwardFill)
                        .small(),
                )
                .child(
                    Button::new("repeat")
                        .ghost()
                        .icon(PhosphorIcon::Repeat)
                        .small(),
                ),
        )
}
