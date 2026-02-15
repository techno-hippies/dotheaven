use super::*;

impl ChatView {
    pub(super) fn render_empty_state(&self, c: &Colors) -> impl IntoElement {
        div()
            .flex_1()
            .h_full()
            .bg(c.background)
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .v_flex()
                    .items_center()
                    .gap_3()
                    .child(
                        div()
                            .size(px(64.))
                            .rounded_full()
                            .bg(c.elevated)
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(
                                gpui::svg()
                                    .path("icons/chat-circle.svg")
                                    .size(px(32.))
                                    .text_color(c.muted_fg),
                            ),
                    )
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .text_color(c.foreground)
                            .child("Start Conversation"),
                    )
                    .child(
                        div()
                            .text_color(c.muted_fg)
                            .child("Messages are e2e encrypted over XMTP."),
                    ),
            )
    }
}
