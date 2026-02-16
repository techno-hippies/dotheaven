use super::*;

pub(super) fn render_room_card(
    room: &RoomCard,
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> impl IntoElement {
    let (badge_text, badge_bg, badge_fg) = badge_style(room.status);
    let room_clone = room.clone();
    let is_solo = room.kind == RoomKind::DjSet;
    let price_is_free = room.price_label.eq_ignore_ascii_case("free");

    let avatar_ring = |accent: Hsla| {
        div()
            .size(px(28.))
            .rounded_full()
            .border_2()
            .border_color(accent)
            .bg(hsla(0.0, 0.0, 0.12, 1.0))
    };

    div()
        .id(SharedString::from(format!("rooms-card-{}", room.room_id)))
        .v_flex()
        .gap_3()
        .p_4()
        .rounded(px(10.))
        .border_1()
        .border_color(theme.border)
        .bg(hsla(0.0, 0.0, 0.10, 1.0))
        .cursor_pointer()
        .hover(|style| style.bg(hsla(0.0, 0.0, 0.12, 1.0)))
        .on_click(cx.listener(move |this, _, _, cx| {
            this.open_room_card(room_clone.clone(), cx);
        }))
        .child(
            div()
                .h_flex()
                .justify_between()
                .items_center()
                .child(
                    div()
                        .h_flex()
                        .items_center()
                        .gap_1()
                        .px_2()
                        .py(px(4.))
                        .rounded_full()
                        .bg(badge_bg)
                        .child(div().size(px(6.)).rounded_full().bg(badge_fg))
                        .child(
                            div()
                                .text_xs()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(badge_fg)
                                .child(badge_text),
                        ),
                )
                .child(
                    div()
                        .h_flex()
                        .items_center()
                        .gap_1()
                        .text_xs()
                        .text_color(theme.muted_foreground)
                        .child(
                            gpui::svg()
                                .path("icons/user.svg")
                                .size(px(12.))
                                .text_color(theme.muted_foreground),
                        )
                        .child(room.listener_count.to_string()),
                ),
        )
        .child(
            div()
                .text_lg()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground)
                .child(room.title.clone()),
        )
        .child(
            div().h_flex().items_center().justify_between().child(
                div()
                    .h_flex()
                    .items_center()
                    .gap_2()
                    .child(avatar_ring(hsla(0.61, 0.84, 0.76, 1.0)))
                    .when(!is_solo, |el| {
                        el.child(avatar_ring(hsla(0.73, 0.78, 0.76, 1.0)))
                    })
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.muted_foreground)
                            .child(if is_solo {
                                room.host_a.clone()
                            } else {
                                format!("{} & {}", room.host_a, room.host_b)
                            }),
                    ),
            ),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_sm()
                        .text_color(theme.muted_foreground)
                        .child(room.meta_line.clone()),
                )
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(if price_is_free {
                            hsla(0.40, 0.86, 0.72, 1.0)
                        } else {
                            hsla(0.08, 0.84, 0.72, 1.0)
                        })
                        .child(room.price_label.clone()),
                ),
        )
}

fn badge_style(status: RoomStatus) -> (&'static str, Hsla, Hsla) {
    match status {
        RoomStatus::Created => (
            "Created",
            hsla(0.73, 0.50, 0.24, 1.0),
            hsla(0.73, 0.90, 0.80, 1.0),
        ),
        RoomStatus::Live => (
            "Live",
            hsla(0.76, 0.80, 0.30, 1.0),
            hsla(0.76, 0.95, 0.80, 1.0),
        ),
        RoomStatus::Scheduled => (
            "Scheduled",
            hsla(0.40, 0.60, 0.24, 1.0),
            hsla(0.40, 0.80, 0.78, 1.0),
        ),
        RoomStatus::Ended => (
            "Ended",
            hsla(0.11, 0.50, 0.24, 1.0),
            hsla(0.13, 0.90, 0.70, 1.0),
        ),
    }
}
