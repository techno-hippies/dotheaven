use super::*;

mod header;

impl ChatView {
    pub(super) fn render_active_chat(
        &self,
        conv_id: String,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let is_scarlett = conv_id == SCARLETT_CONVERSATION_ID;
        let voice_supported = if is_scarlett {
            self.voice_call_supported()
        } else {
            false
        };
        let voice = if is_scarlett {
            self.voice_snapshot()
        } else {
            VoiceSnapshot::default()
        };
        let scarlett_error = if is_scarlett {
            self.voice_error
                .clone()
                .or_else(|| voice.last_error.clone())
        } else {
            None
        };
        let disappearing_message_seconds = if is_scarlett {
            0
        } else {
            self.disappearing_message_seconds_for_conversation(&conv_id)
        };
        let conv = self.conversations.iter().find(|cv| cv.id == conv_id);
        let display_name = conv
            .map(|cv| cv.peer_display_name.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        let nationality = conv.and_then(|cv| cv.peer_nationality.clone());

        div()
            .flex_1()
            .h_full()
            .v_flex()
            .overflow_hidden()
            .bg(c.background)
            .child(header::render_active_chat_header(
                self,
                &conv_id,
                c,
                cx,
                is_scarlett,
                voice_supported,
                voice,
                display_name,
                nationality,
                disappearing_message_seconds,
            ))
            // Message list (scrollable)
            .child(
                div()
                    .id("messages-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .px_4()
                    .py_3()
                    .child(
                        div().v_flex().gap_1().children(
                            self.messages
                                .iter()
                                .map(|msg| self.render_message_bubble(msg, &conv_id, c, cx)),
                        ),
                    ),
            )
            .when_some(scarlett_error, |el: Div, err| {
                if is_scarlett {
                    el.child(
                        div()
                            .px_4()
                            .py_2()
                            .text_color(hsla(0., 0.7, 0.6, 1.))
                            .child(format!("Scarlett: {}", err)),
                    )
                } else {
                    el
                }
            })
            // Message input bar
            .child(self.render_input_bar(c, cx))
    }
}
