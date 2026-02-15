use super::*;

pub(super) fn render_scarlett_controls(
    c: &Colors,
    cx: &mut Context<ChatView>,
    voice: VoiceSnapshot,
) -> Div {
    div()
        .h_flex()
        .items_center()
        .gap_2()
        .when(voice.state == VoiceState::Connected, |row| {
            row.child(
                div()
                    .id("scarlett-mute-btn")
                    .px_3()
                    .h(px(32.))
                    .rounded_full()
                    .bg(if voice.is_muted {
                        hsla(0., 0.55, 0.26, 1.)
                    } else {
                        c.elevated
                    })
                    .cursor_pointer()
                    .hover(|s| s.bg(hsla(0., 0., 0.23, 1.)))
                    .flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(|this, _, _window, cx| {
                        this.toggle_scarlett_mute(cx);
                    }))
                    .child(if voice.is_muted { "Unmute" } else { "Mute" }),
            )
            .child(
                div()
                    .id("scarlett-end-btn")
                    .px_3()
                    .h(px(32.))
                    .rounded_full()
                    .bg(hsla(0., 0.58, 0.28, 1.))
                    .cursor_pointer()
                    .hover(|s| s.bg(hsla(0., 0.65, 0.34, 1.)))
                    .flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(|this, _, _window, cx| {
                        this.end_scarlett_call(cx);
                    }))
                    .child("End"),
            )
        })
        .when(voice.state == VoiceState::Connecting, |row| {
            row.child(
                div()
                    .px_3()
                    .h(px(32.))
                    .rounded_full()
                    .bg(c.elevated)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child("Starting..."),
            )
            .child(
                div()
                    .id("scarlett-cancel-btn")
                    .px_3()
                    .h(px(32.))
                    .rounded_full()
                    .bg(hsla(0., 0.58, 0.28, 1.))
                    .cursor_pointer()
                    .hover(|s| s.bg(hsla(0., 0.65, 0.34, 1.)))
                    .flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(|this, _, _window, cx| {
                        this.end_scarlett_call(cx);
                    }))
                    .child("Cancel"),
            )
        })
        .when(
            voice.state != VoiceState::Connected && voice.state != VoiceState::Connecting,
            |row| {
                row.child(
                    div()
                        .id("scarlett-start-btn")
                        .px_3()
                        .h(px(32.))
                        .rounded_full()
                        .bg(c.primary)
                        .cursor_pointer()
                        .hover(|s| s.bg(c.primary_hover))
                        .flex()
                        .items_center()
                        .justify_center()
                        .on_click(cx.listener(|this, _, _window, cx| {
                            this.start_scarlett_call(cx);
                        }))
                        .child("Call"),
                )
            },
        )
}
