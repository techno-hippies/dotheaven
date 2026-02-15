use super::*;

const BACK_BAR_ID: &str = "rooms-host-back";

pub(super) fn render_rooms_back_bar(
    theme: &Theme,
    title: &str,
    subtitle: &str,
    show_back_button: bool,
    right_action: Option<AnyElement>,
    cx: &mut Context<RoomsView>,
) -> Div {
    let mut left_cluster = div().h_flex().items_center().gap_3();

    if show_back_button {
        left_cluster = left_cluster.child(
            div()
                .id(BACK_BAR_ID)
                .h_flex()
                .items_center()
                .gap(px(6.))
                .px_3()
                .py(px(7.))
                .rounded_full()
                .bg(hsla(0.0, 0.0, 0.12, 1.0))
                .cursor_pointer()
                .hover(|s| s.bg(hsla(0.0, 0.0, 0.14, 1.0)))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.close_host_room_view(cx);
                }))
                .child(
                    gpui::svg()
                        .path("icons/arrow-left.svg")
                        .size(px(14.))
                        .text_color(theme.foreground),
                )
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(theme.foreground)
                        .child("Back"),
                ),
        );
    }

    let title_cluster = div()
        .v_flex()
        .gap_1()
        .child(
            div()
                .text_3xl()
                .font_weight(FontWeight::BOLD)
                .text_color(theme.foreground)
                .child(title.to_string()),
        )
        .child(
            div()
                .text_color(theme.muted_foreground)
                .child(subtitle.to_string()),
        );
    left_cluster = left_cluster.child(title_cluster);

    let mut top_row = div()
        .h_flex()
        .items_start()
        .justify_between()
        .child(left_cluster);
    if let Some(right_action) = right_action {
        top_row = top_row.child(right_action);
    }

    div().w_full().child(top_row)
}
