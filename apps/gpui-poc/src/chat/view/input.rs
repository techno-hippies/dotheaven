use super::*;

impl ChatView {
    pub(super) fn render_input_bar(&self, c: &Colors, cx: &mut Context<Self>) -> impl IntoElement {
        let sending_disabled = self.ai_sending && self.is_scarlett_active();
        let send_bg = if sending_disabled {
            c.elevated
        } else {
            c.primary
        };
        let send_fg = c.primary_fg;
        let send_hover = c.primary_hover;

        div()
            .h_flex()
            .w_full()
            .items_center()
            .gap_2()
            .px_4()
            .py_3()
            .border_t_1()
            .border_color(c.border)
            .flex_shrink_0()
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(40.))
                    .rounded_full()
                    .bg(c.elevated)
                    .px_3()
                    .flex()
                    .items_center()
                    .child(
                        div().flex_1().child(
                            Input::new(&self.input_state)
                                .appearance(false)
                                .cleanable(false),
                        ),
                    ),
            )
            .child(
                div()
                    .id("send-btn")
                    .size(px(36.))
                    .rounded_full()
                    .bg(send_bg)
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(!sending_disabled, |el| {
                        el.cursor_pointer()
                            .hover(move |s| s.bg(send_hover))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.handle_send_message(window, cx);
                            }))
                    })
                    .child(if sending_disabled {
                        div().text_color(c.muted_fg).child("...")
                    } else {
                        div().child(
                            gpui::svg()
                                .path("icons/paper-plane-right.svg")
                                .size(px(20.))
                                .text_color(send_fg),
                        )
                    }),
            )
    }
}
