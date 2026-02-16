use super::super::back_bar::render_rooms_back_bar;
use super::*;

use super::room_card::render_room_card;

pub(super) fn split_rooms_into_columns(rooms: Vec<RoomCard>) -> (Vec<RoomCard>, Vec<RoomCard>) {
    let mut left_col = Vec::new();
    let mut right_col = Vec::new();

    for (idx, room) in rooms.into_iter().enumerate() {
        if idx % 2 == 0 {
            left_col.push(room);
        } else {
            right_col.push(room);
        }
    }

    (left_col, right_col)
}

pub(super) fn render_main_header(
    theme: &Theme,
    create_button: Option<AnyElement>,
    cx: &mut Context<RoomsView>,
) -> impl IntoElement {
    render_rooms_back_bar(
        theme,
        "Rooms",
        "Live duets, classes, and jam sessions",
        false,
        create_button,
        cx,
    )
}

pub(super) fn render_main_panel_create_button(
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> AnyElement {
    div()
        .id("rooms-create-btn")
        .h_flex()
        .items_center()
        .gap_2()
        .px_5()
        .py(px(10.))
        .rounded_full()
        .bg(theme.primary)
        .cursor_pointer()
        .hover({
            let hover = theme.primary_hover;
            move |s| s.bg(hover)
        })
        .on_click(cx.listener(|this, _, window, cx| {
            this.open_create_modal(window, cx);
        }))
        .child(
            gpui::svg()
                .path("icons/plus.svg")
                .size(px(14.))
                .text_color(theme.primary_foreground),
        )
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.primary_foreground)
                .child("Create Room"),
        )
        .into_any_element()
}

pub(super) fn render_tabs(
    active_tab: RoomsTab,
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> impl IntoElement {
    div()
        .h_flex()
        .gap_6()
        .border_b_1()
        .border_color(theme.border)
        .children(RoomsTab::all().into_iter().map(|tab| {
            let is_active = active_tab == tab;
            div()
                .id(SharedString::from(format!("rooms-tab-{}", tab.label())))
                .v_flex()
                .gap_2()
                .pb_2()
                .cursor_pointer()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.active_tab = tab;
                    cx.notify();
                }))
                .child(
                    div()
                        .text_sm()
                        .font_weight(if is_active {
                            FontWeight::SEMIBOLD
                        } else {
                            FontWeight::NORMAL
                        })
                        .text_color(if is_active {
                            theme.foreground
                        } else {
                            theme.muted_foreground
                        })
                        .child(tab.label()),
                )
                .child(div().h(px(2.)).w(px(40.)).rounded(px(2.)).bg(if is_active {
                    theme.primary
                } else {
                    hsla(0., 0., 0., 0.)
                }))
        }))
}

pub(super) fn render_room_columns(
    left_col: &[RoomCard],
    right_col: &[RoomCard],
    theme: &Theme,
) -> impl IntoElement {
    div()
        .h_flex()
        .items_start()
        .gap_4()
        .child(
            div()
                .v_flex()
                .flex_1()
                .gap_4()
                .children(left_col.iter().map(|room| render_room_card(room, theme))),
        )
        .child(
            div()
                .v_flex()
                .flex_1()
                .gap_4()
                .children(right_col.iter().map(|room| render_room_card(room, theme))),
        )
}
