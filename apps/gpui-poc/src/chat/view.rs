use super::*;

mod compose;
mod conversation_list;
mod input;
mod messages;
mod panel;

impl Render for ChatView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let c = Colors::from_theme(cx.theme());

        div()
            .id("chat-root")
            .relative()
            .h_flex()
            .size_full()
            .child(self.render_conversation_list(&c, cx))
            .child(self.render_chat_panel(&c, cx))
            .when(self.compose_open, |el| {
                el.child(self.render_compose_modal(&c, cx))
            })
    }
}
