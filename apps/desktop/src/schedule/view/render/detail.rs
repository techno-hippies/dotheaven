use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{theme::Theme, StyledExt};

use crate::schedule::model::BookingRow;
use crate::schedule::view::state::ScheduleView;

impl ScheduleView {
    pub(crate) fn render_detail_tab(
        &self,
        booking: &BookingRow,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let partner_label = if booking.is_host {
            format!("You are hosting {}", booking.peer_name)
        } else {
            format!("You are guesting with {}", booking.peer_name)
        };

        let action_rows = if self.is_in_call() {
            vec![
                super::helpers::render_action_button(
                    "Leave Session",
                    theme.danger,
                    theme.danger_foreground,
                    ("schedule-leave-session", booking.id),
                    cx.listener(|this, _, _, cx| this.leave_session(cx)),
                ),
                super::helpers::render_action_button(
                    "Cancel Booking",
                    theme.warning,
                    theme.warning_foreground,
                    ("schedule-cancel-booking", booking.id),
                    cx.listener(|this, _, _, cx| this.cancel_selected_booking(cx)),
                ),
            ]
        } else {
            vec![
                super::helpers::render_action_button(
                    "Join Session",
                    theme.success,
                    theme.success_foreground,
                    ("schedule-join-session", booking.id),
                    cx.listener(|this, _, _, cx| this.join_session(cx)),
                ),
                super::helpers::render_action_button(
                    "Cancel Booking",
                    theme.warning,
                    theme.warning_foreground,
                    ("schedule-cancel-booking", booking.id.saturating_add(1)),
                    cx.listener(|this, _, _, cx| this.cancel_selected_booking(cx)),
                ),
            ]
        };

        div()
            .v_flex()
            .w_full()
            .gap_4()
            .child(
                div()
                    .v_flex()
                    .gap_2()
                    .child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.foreground)
                            .child("Booking Details"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.muted_foreground)
                            .child(partner_label),
                    ),
            )
            .child(
                div()
                    .rounded(px(12.))
                    .p_4()
                    .border_1()
                    .border_color(theme.border)
                    .bg(theme.muted)
                    .v_flex()
                    .gap_3()
                    .child(super::helpers::render_detail_kv(
                        "Peer",
                        booking.peer_name.to_string(),
                        theme,
                    ))
                    .child(super::helpers::render_detail_kv(
                        "Wallet",
                        booking.peer_address.to_string(),
                        theme,
                    ))
                    .child(super::helpers::render_detail_kv(
                        "Starts",
                        booking.start_label.to_string(),
                        theme,
                    ))
                    .child(super::helpers::render_detail_kv(
                        "Duration",
                        format!("{} minutes", booking.duration_mins),
                        theme,
                    ))
                    .child(super::helpers::render_detail_kv(
                        "TX hash",
                        booking.tx_hash.to_string(),
                        theme,
                    ))
                    .child(super::helpers::render_detail_kv(
                        "Cancel cutoff",
                        format!("{} minutes before", booking.cancel_cutoff_mins),
                        theme,
                    ))
                    .child(super::helpers::render_detail_kv(
                        "Price",
                        format!("{} ETH", booking.price_eth),
                        theme,
                    ))
                    .child(div().h_flex().gap_2().pt_2().children(action_rows))
                    .when(self.is_in_call(), |el: Div| {
                        el.child(
                            div()
                                .rounded(px(10.))
                                .px_4()
                                .py_3()
                                .bg(theme.secondary)
                                .border_1()
                                .border_color(theme.border)
                                .h_flex()
                                .justify_between()
                                .items_center()
                                .child(
                                    div()
                                        .h_flex()
                                        .items_center()
                                        .gap_2()
                                        .child(div().size(px(8.)).rounded_full().bg(theme.success))
                                        .child(
                                            div()
                                                .text_sm()
                                                .text_color(theme.foreground)
                                                .child("Connected"),
                                        )
                                        .child(
                                            div()
                                                .text_sm()
                                                .text_color(theme.muted_foreground)
                                                .child("Peer connected"),
                                        ),
                                )
                                .child(super::helpers::render_action_button(
                                    if self.is_muted() { "Unmute" } else { "Mute" },
                                    theme.primary,
                                    theme.primary_foreground,
                                    ("schedule-toggle-mute", booking.id),
                                    cx.listener(|this, _, _, cx| this.toggle_mute(cx)),
                                )),
                        )
                    }),
            )
            .into_any_element()
    }
}
