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
    render_rooms_back_bar(theme, "Rooms", "", false, create_button, cx)
}

pub(super) fn render_main_panel_create_button(
    _theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> AnyElement {
    div()
        .id("rooms-create-btn")
        .h_flex()
        .items_center()
        .gap_2()
        .px_5()
        .py(px(9.))
        .rounded_full()
        .bg(hsla(0.61, 0.72, 0.75, 1.0))
        .cursor_pointer()
        .hover(|s| s.bg(hsla(0.61, 0.72, 0.78, 1.0)))
        .on_click(cx.listener(|this, _, window, cx| {
            this.open_create_modal(window, cx);
        }))
        .child(
            gpui::svg()
                .path("icons/plus.svg")
                .size(px(14.))
                .text_color(hsla(0.63, 0.20, 0.22, 1.0)),
        )
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(hsla(0.63, 0.20, 0.22, 1.0))
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
        .gap_5()
        .border_b_1()
        .border_color(theme.border)
        .children(RoomsTab::all().into_iter().map(|tab| {
            let is_active = active_tab == tab;
            div()
                .id(SharedString::from(format!("rooms-tab-{}", tab.label())))
                .v_flex()
                .gap_1()
                .pb_0p5()
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
                            FontWeight::MEDIUM
                        })
                        .text_color(if is_active {
                            theme.foreground
                        } else {
                            theme.muted_foreground
                        })
                        .child(tab.label()),
                )
                .child(div().h(px(2.)).w(px(78.)).rounded(px(2.)).bg(if is_active {
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
    cx: &mut Context<RoomsView>,
) -> impl IntoElement {
    if left_col.is_empty() && right_col.is_empty() {
        return div()
            .w_full()
            .h(px(220.))
            .v_flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_sm()
                    .text_color(theme.muted_foreground)
                    .child("No rooms found right now."),
            );
    }

    let left_cards: Vec<AnyElement> = left_col
        .iter()
        .map(|room| render_room_card(room, theme, cx).into_any_element())
        .collect();
    let right_cards: Vec<AnyElement> = right_col
        .iter()
        .map(|room| render_room_card(room, theme, cx).into_any_element())
        .collect();

    div()
        .h_flex()
        .items_start()
        .gap_4()
        .child(div().v_flex().flex_1().gap_4().children(left_cards))
        .child(div().v_flex().flex_1().gap_4().children(right_cards))
}
