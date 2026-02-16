use super::*;

impl ChatView {
    pub(super) fn render_compose_modal(
        &self,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let start_bg = c.primary;
        let start_fg = c.primary_fg;

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.55))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .relative()
                    .w(px(520.))
                    .max_w(px(620.))
                    .mx_4()
                    .rounded(px(14.))
                    .bg(c.surface)
                    .border_1()
                    .border_color(c.border)
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .child(
                        div().h_flex().items_start().pr_12().child(
                            div()
                                .v_flex()
                                .gap_1()
                                .child(
                                    div()
                                        .text_lg()
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(c.foreground)
                                        .child("New Message"),
                                )
                                .child(div().text_color(c.muted_fg).child(
                                    "Enter a wallet address, Heaven username, or ENS name.",
                                )),
                        ),
                    )
                    .child(
                        div()
                            .id("compose-close-btn")
                            .absolute()
                            .top(px(14.))
                            .right(px(14.))
                            .size(px(36.))
                            .rounded_full()
                            .bg(c.elevated)
                            .cursor_pointer()
                            .flex()
                            .items_center()
                            .justify_center()
                            .on_click(cx.listener(|this, _, _window, cx| {
                                this.close_compose_modal(cx);
                            }))
                            .child(
                                gpui::svg()
                                    .path("icons/x.svg")
                                    .size(px(15.))
                                    .text_color(c.foreground),
                            ),
                    )
                    .child(
                        div()
                            .h(px(44.))
                            .rounded_full()
                            .bg(c.elevated)
                            .px_3()
                            .flex()
                            .items_center()
                            .child(
                                div().flex_1().child(
                                    Input::new(&self.compose_input_state)
                                        .appearance(false)
                                        .cleanable(false),
                                ),
                            ),
                    )
                    .when_some(self.compose_error.clone(), |el: Div, err| {
                        el.child(div().text_color(hsla(0., 0.7, 0.6, 1.)).child(err))
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("compose-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(c.elevated)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_compose_modal(cx);
                                    }))
                                    .child(div().text_color(c.foreground).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("compose-start-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(start_bg)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.handle_compose_submit(cx);
                                    }))
                                    .child(div().text_color(start_fg).child(
                                        if self.compose_submitting {
                                            "Starting..."
                                        } else {
                                            "Start Chat"
                                        },
                                    )),
                            ),
                    ),
            )
    }
}
