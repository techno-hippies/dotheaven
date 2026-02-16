use super::*;

impl ChatView {
    pub(super) fn render_conversation_list(
        &self,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        div()
            .v_flex()
            .w(px(360.))
            .h_full()
            .flex_shrink_0()
            .bg(c.surface)
            .border_r_1()
            .border_color(c.border)
            .overflow_hidden()
            // Header
            .child(
                div()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .px_4()
                    .py_3()
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .text_color(c.foreground)
                            .child("Messages"),
                    )
                    .child(
                        div()
                            .id("compose-btn")
                            .size(px(36.))
                            .rounded_full()
                            .bg(c.elevated)
                            .cursor_pointer()
                            .hover(|s| s.bg(hsla(0., 0., 0.19, 1.)))
                            .flex()
                            .items_center()
                            .justify_center()
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.open_compose_modal(window, cx);
                            }))
                            .child(
                                gpui::svg()
                                    .path("icons/pencil-simple.svg")
                                    .size(px(20.))
                                    .text_color(c.foreground),
                            ),
                    ),
            )
            // Status indicator
            .when(self.connecting, |el| {
                let muted = c.muted_fg;
                el.child(
                    div()
                        .px_4()
                        .py_2()
                        .text_color(muted)
                        .child("Connecting to XMTP..."),
                )
            })
            .when_some(self.connect_error.clone(), |el: Div, err| {
                el.child(
                    div()
                        .px_4()
                        .py_2()
                        .text_color(hsla(0., 0.7, 0.6, 1.)) // red-ish
                        .child(format!("Error: {}", &err[..err.len().min(60)])),
                )
            })
            // Scrollable conversation list
            .child(
                div()
                    .id("conv-list-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .children(
                        self.conversations
                            .iter()
                            .enumerate()
                            .map(|(i, conv)| self.render_conversation_row(conv, i, c, cx)),
                    ),
            )
    }

    fn render_conversation_row(
        &self,
        conv: &ConversationItem,
        index: usize,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let is_active = self.active_conversation_id.as_ref() == Some(&conv.id);
        let conv_id = conv.id.clone();
        let hover_bg = c.highlight_hover;
        let active_bg = c.highlight;

        div()
            .id(ElementId::NamedInteger("conv-row".into(), index as u64))
            .h_flex()
            .w_full()
            .gap_3()
            .px_3()
            .py(px(10.))
            .cursor_pointer()
            .when(is_active, move |el| el.bg(active_bg))
            .hover(move |s| s.bg(hover_bg))
            .on_click(cx.listener(move |this, _, _window, cx| {
                this.select_conversation(conv_id.clone(), cx);
            }))
            .child(render_avatar_with_flag(
                44.0,
                conv.peer_nationality.as_deref(),
                c,
            ))
            .child(
                div()
                    .v_flex()
                    .flex_1()
                    .min_w_0()
                    .gap(px(2.))
                    .child(
                        div()
                            .h_flex()
                            .justify_between()
                            .gap_2()
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(c.foreground)
                                    .truncate()
                                    .child(conv.peer_display_name.clone()),
                            )
                            .child(
                                div()
                                    .text_color(c.muted_fg)
                                    .flex_shrink_0()
                                    .child(format_relative_time(conv.last_message_at)),
                            ),
                    )
                    .child(
                        div().text_color(c.muted_fg).truncate().child(
                            conv.last_message
                                .as_deref()
                                .map(normalize_preview_text)
                                .unwrap_or_else(|| "No messages yet".to_string()),
                        ),
                    ),
            )
            .when(conv.unread, |el| {
                let blue = c.primary;
                el.child(div().size(px(10.)).rounded_full().bg(blue).flex_shrink_0())
            })
    }
}
