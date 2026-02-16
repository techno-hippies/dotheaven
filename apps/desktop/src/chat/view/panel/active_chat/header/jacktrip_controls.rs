use super::*;

pub(super) fn render_jacktrip_controls(
    conv_id: &str,
    c: &Colors,
    cx: &mut Context<ChatView>,
    handoff: SessionHandoffState,
) -> Div {
    let conv_id_for_desktop = conv_id.to_string();
    let conv_id_for_web = conv_id.to_string();
    let conv_id_for_invite = conv_id.to_string();

    div()
        .h_flex()
        .items_center()
        .gap_2()
        .child(
            div()
                .id("jacktrip-send-invite-btn")
                .px_3()
                .h(px(32.))
                .rounded_full()
                .bg(c.elevated)
                .cursor_pointer()
                .hover(|s| s.bg(hsla(0., 0., 0.23, 1.)))
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(move |this, _, _window, cx| {
                    this.send_jacktrip_invite(conv_id_for_invite.clone(), cx);
                }))
                .child("Invite"),
        )
        .child(
            div()
                .id("jacktrip-open-desktop-btn")
                .px_3()
                .h(px(32.))
                .rounded_full()
                .bg(if handoff.opening {
                    c.elevated
                } else {
                    c.primary
                })
                .cursor_pointer()
                .when(!handoff.opening, |button| {
                    button.hover(|s| s.bg(c.primary_hover))
                })
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(move |this, _, _window, cx| {
                    this.open_jacktrip_desktop_handoff(conv_id_for_desktop.clone(), cx);
                }))
                .child(if handoff.opening {
                    "Opening..."
                } else {
                    "Open JackTrip"
                }),
        )
        .child(
            div()
                .id("jacktrip-open-web-btn")
                .px_3()
                .h(px(32.))
                .rounded_full()
                .bg(c.elevated)
                .cursor_pointer()
                .hover(|s| s.bg(hsla(0., 0., 0.23, 1.)))
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(move |this, _, _window, cx| {
                    this.open_jacktrip_web_handoff(conv_id_for_web.clone(), cx);
                }))
                .child("Open Web"),
        )
}
