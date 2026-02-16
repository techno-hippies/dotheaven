use super::*;

mod room_card;
mod sections;

impl RoomsView {
    pub(super) fn render_main_panel(&self, theme: &Theme, cx: &mut Context<Self>) -> AnyElement {
        if self.active_host_room.is_some() {
            return self.render_host_room_panel(theme, cx);
        }

        let filtered_rooms = self.filtered_rooms();
        let show_loading_state = self.rooms_loading && filtered_rooms.is_empty();
        let (left_col, right_col) = sections::split_rooms_into_columns(filtered_rooms);
        let room_columns = if show_loading_state {
            None
        } else {
            Some(sections::render_room_columns(&left_col, &right_col, theme, cx).into_any_element())
        };

        div()
            .v_flex()
            .flex_1()
            .h_full()
            .overflow_y_scrollbar()
            .px_6()
            .py_6()
            .gap_5()
            .child(sections::render_main_header(
                theme,
                Some(sections::render_main_panel_create_button(theme, cx)),
                cx,
            ))
            .child(sections::render_tabs(self.active_tab, theme, cx))
            .when(show_loading_state, |el| {
                el.child(
                    div()
                        .w_full()
                        .h(px(220.))
                        .v_flex()
                        .items_center()
                        .justify_center()
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.muted_foreground)
                                .child("Loading rooms..."),
                        ),
                )
            })
            .when_some(self.rooms_error.clone(), |el, err| {
                el.child(
                    div()
                        .px_3()
                        .py_2()
                        .rounded(px(8.))
                        .bg(hsla(0.02, 0.60, 0.20, 0.35))
                        .text_sm()
                        .text_color(hsla(0.02, 0.92, 0.78, 1.0))
                        .child(format!("Room refresh issue: {}", truncate_text(&err, 140))),
                )
            })
            .when_some(room_columns, |el, columns| el.child(columns))
            .into_any_element()
    }
}
