use super::*;

mod room_card;
mod sections;

impl RoomsView {
    pub(super) fn render_main_panel(&self, theme: &Theme, cx: &mut Context<Self>) -> AnyElement {
        if self.active_host_room.is_some() {
            return self.render_host_room_panel(theme, cx);
        }

        let (left_col, right_col) = sections::split_rooms_into_columns(self.filtered_rooms());

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
            .child(sections::render_room_columns(&left_col, &right_col, theme))
            .into_any_element()
    }
}
