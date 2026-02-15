use super::*;

mod back_bar;
mod host;
mod host_actions;
mod main_panel;
mod modal;
mod modal_duet_setup;
mod segment_modal;

impl Render for RoomsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.refresh_native_bridge_running_state();
        self.maybe_poll_active_room_broadcast_health(cx);

        let theme = cx.theme().clone();

        div()
            .id("rooms-root")
            .relative()
            .size_full()
            .bg(theme.background)
            .child(self.render_main_panel(&theme, cx))
            .when(self.create_modal_open, |el| {
                el.child(self.render_create_modal(&theme, cx))
            })
            .when(self.segment_modal_open, |el| {
                el.child(self.render_segment_modal(&theme, cx))
            })
    }
}
