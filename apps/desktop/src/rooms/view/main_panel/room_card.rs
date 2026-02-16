use super::*;

pub(super) fn render_room_card(room: &RoomCard, theme: &Theme) -> impl IntoElement {
    let (badge_text, badge_bg, badge_fg) = badge_style(room.status);
    let kind_text = room_kind_text(room.kind);
    let is_solo = room.kind == RoomKind::DjSet;

    let avatar = |letter: char| {
        div()
            .size(px(22.))
            .rounded_full()
            .bg(theme.primary)
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_xs()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.primary_foreground)
                    .child(letter.to_string()),
            )
    };

    div()
        .v_flex()
        .gap_4()
        .p_4()
        .rounded(px(10.))
        .border_1()
        .border_color(theme.border)
        .bg(theme.sidebar)
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
                        .text_sm()
                        .text_color(theme.muted_foreground)
                        .child(kind_text),
                ),
        )
        .child(
            div()
                .text_xl()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground)
                .child(room.title.clone()),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .h_flex()
                        .items_center()
                        .gap_2()
                        .child(avatar('A'))
                        .when(!is_solo, |el| el.child(avatar('B')))
                        .child(div().text_color(theme.muted_foreground).child(if is_solo {
                            room.host_a.clone()
                        } else {
                            format!("{}  & {}", room.host_a, room.host_b)
                        })),
                )
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.primary)
                        .child(room.price_label.clone()),
                ),
        )
        .child(
            div()
                .text_sm()
                .text_color(theme.muted_foreground)
                .child(room.meta_line.clone()),
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

fn room_kind_text(kind: RoomKind) -> &'static str {
    match kind {
        RoomKind::DjSet => "Solo Room",
        RoomKind::Duet => "Duet",
        RoomKind::OpenJam => "Open Jam",
    }
}
