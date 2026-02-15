use super::*;

impl ChatView {
    pub(super) fn render_message_bubble(
        &self,
        msg: &ChatMessage,
        conversation_id: &str,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let Some(invite) = parse_jacktrip_invite(&msg.content) else {
            return render_plain_message_bubble(msg, c).into_any_element();
        };

        let bubble_bg = if msg.is_own {
            Hsla {
                h: c.primary.h,
                s: c.primary.s * 0.4,
                l: 0.22,
                a: 1.,
            }
        } else {
            c.elevated
        };
        let time_str = format_ns_to_time(msg.sent_at_ns);
        let conv_id = conversation_id.to_string();
        let invite_for_join = invite.clone();

        let card = div()
            .max_w(DefiniteLength::Fraction(0.8))
            .v_flex()
            .gap_2()
            .child(
                div()
                    .px_4()
                    .py_3()
                    .rounded(px(16.))
                    .bg(bubble_bg)
                    .v_flex()
                    .gap_2()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(c.foreground)
                            .child("JackTrip Room Invite"),
                    )
                    .child(
                        div()
                            .text_color(c.muted_fg)
                            .child(format!("Host: {}", invite.host_display)),
                    )
                    .child(
                        div()
                            .text_color(c.muted_fg)
                            .child(format!("Room: {}", invite.room_id)),
                    )
                    .child(
                        div().h_flex().items_center().gap_2().child(
                            div()
                                .id(ElementId::NamedInteger(
                                    "jacktrip-join-invite-btn".into(),
                                    (msg.sent_at_ns.max(0) as u64) ^ 0xA11CE,
                                ))
                                .px_3()
                                .h(px(30.))
                                .rounded_full()
                                .bg(c.primary)
                                .cursor_pointer()
                                .hover(|s| s.bg(c.primary_hover))
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(cx.listener(move |this, _, _window, cx| {
                                    this.join_jacktrip_invite(
                                        conv_id.clone(),
                                        invite_for_join.clone(),
                                        cx,
                                    );
                                }))
                                .child("Join in JackTrip"),
                        ),
                    ),
            )
            .child(
                div()
                    .text_color(c.muted_fg)
                    .text_size(px(12.))
                    .child(time_str),
            );

        div()
            .w_full()
            .h_flex()
            .py(px(2.))
            .when(msg.is_own, |el| el.justify_end())
            .when(!msg.is_own, |el| el.justify_start())
            .child(card)
            .into_any_element()
    }
}

fn render_plain_message_bubble(msg: &ChatMessage, c: &Colors) -> impl IntoElement {
    let time_str = format_ns_to_time(msg.sent_at_ns);
    let own_bubble_bg = Hsla {
        h: c.primary.h,
        s: c.primary.s * 0.4,
        l: 0.22,
        a: 1.,
    };
    let bubble_bg = if msg.is_own {
        own_bubble_bg
    } else {
        c.elevated
    };

    let bubble = div()
        .max_w(DefiniteLength::Fraction(0.7))
        .v_flex()
        .gap(px(2.))
        .child(
            div()
                .px_4()
                .py_2()
                .rounded(px(16.))
                .bg(bubble_bg)
                .child(div().text_color(c.foreground).child(msg.content.clone())),
        )
        .child(
            div()
                .text_color(c.muted_fg)
                .text_size(px(12.))
                .child(time_str),
        );

    div()
        .w_full()
        .h_flex()
        .py(px(2.))
        .when(msg.is_own, |el| el.justify_end())
        .when(!msg.is_own, |el| el.justify_start())
        .child(bubble)
}
