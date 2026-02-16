use super::super::*;
use super::common::{render_modal_input, section_label, selectable_chip};

pub(in crate::rooms::view::modal_duet_setup) fn render_visibility_audience_section(
    view: &RoomsView,
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> Div {
    div()
        .v_flex()
        .gap_3()
        .child(section_label("Visibility & Audience", theme))
        .child(
            div()
                .h_flex()
                .gap_3()
                .child(
                    div()
                        .v_flex()
                        .flex_1()
                        .gap_2()
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.muted_foreground)
                                .child("Visibility"),
                        )
                        .child(
                            div()
                                .h_flex()
                                .gap_2()
                                .child(
                                    selectable_chip(
                                        "Unlisted",
                                        view.visibility_mode == VisibilityMode::Unlisted,
                                        theme,
                                    )
                                    .id("rooms-visibility-unlisted")
                                    .cursor_pointer()
                                    .on_click(cx.listener(
                                        |this, _, _, cx| {
                                            this.visibility_mode = VisibilityMode::Unlisted;
                                            cx.notify();
                                        },
                                    )),
                                )
                                .child(
                                    selectable_chip(
                                        "Public",
                                        view.visibility_mode == VisibilityMode::Public,
                                        theme,
                                    )
                                    .id("rooms-visibility-public")
                                    .cursor_pointer()
                                    .on_click(cx.listener(
                                        |this, _, _, cx| {
                                            this.visibility_mode = VisibilityMode::Public;
                                            cx.notify();
                                        },
                                    )),
                                ),
                        ),
                )
                .child(
                    div()
                        .v_flex()
                        .flex_1()
                        .gap_2()
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.muted_foreground)
                                .child("Audience"),
                        )
                        .child(
                            div()
                                .h_flex()
                                .gap_2()
                                .child(
                                    selectable_chip(
                                        "Ticketed",
                                        view.audience_mode == AudienceMode::Ticketed,
                                        theme,
                                    )
                                    .id("rooms-audience-ticketed")
                                    .cursor_pointer()
                                    .on_click(cx.listener(
                                        |this, _, _, cx| {
                                            this.audience_mode = AudienceMode::Ticketed;
                                            this.modal_error = None;
                                            cx.notify();
                                        },
                                    )),
                                )
                                .child(
                                    selectable_chip(
                                        "Free",
                                        view.audience_mode == AudienceMode::Free,
                                        theme,
                                    )
                                    .id("rooms-audience-free")
                                    .cursor_pointer()
                                    .on_click(cx.listener(
                                        |this, _, _, cx| {
                                            this.audience_mode = AudienceMode::Free;
                                            cx.notify();
                                        },
                                    )),
                                ),
                        ),
                ),
        )
}

pub(in crate::rooms::view::modal_duet_setup) fn render_pricing_section(
    view: &RoomsView,
    theme: &Theme,
) -> Div {
    div()
        .v_flex()
        .gap_3()
        .child(section_label("Pricing", theme))
        .child(
            div()
                .h_flex()
                .gap_3()
                .child(
                    div()
                        .v_flex()
                        .flex_1()
                        .gap_2()
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.muted_foreground)
                                .child("Live entry"),
                        )
                        .child(render_modal_input(
                            &view.live_price_input_state,
                            theme,
                            Some("USDC"),
                        )),
                )
                .child(
                    div()
                        .v_flex()
                        .flex_1()
                        .gap_2()
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.muted_foreground)
                                .child("Replay"),
                        )
                        .child(render_modal_input(
                            &view.replay_price_input_state,
                            theme,
                            Some("USDC"),
                        )),
                ),
        )
}

pub(in crate::rooms::view::modal_duet_setup) fn render_create_button(
    view: &RoomsView,
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> impl IntoElement {
    let label = match view.selected_type {
        RoomType::DjSet => "Create Solo Room",
        RoomType::Duet => "Create Duet Room",
        _ => "Create Room",
    };

    let mut create_btn = div()
        .id("rooms-create-submit")
        .mt_1()
        .h(px(46.))
        .rounded_full()
        .bg(theme.primary)
        .flex()
        .items_center()
        .justify_center()
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.primary_foreground)
                .child(if view.create_submitting {
                    "Creating..."
                } else {
                    label
                }),
        );

    if !view.create_submitting {
        create_btn = create_btn
            .cursor_pointer()
            .hover({
                let hover = theme.primary_hover;
                move |s| s.bg(hover)
            })
            .on_click(cx.listener(|this, _, _, cx| this.submit_create_paid_room(cx)));
    } else {
        create_btn = create_btn.opacity(0.8);
    }

    create_btn
}
