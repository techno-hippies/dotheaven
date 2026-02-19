use gpui::*;
use gpui_component::{theme::Theme, StyledExt};

use crate::schedule::model::{BookingStatus, SlotRow, SlotStatus};
use crate::schedule::view::state::ScheduleView;

impl ScheduleView {
    pub(crate) fn render_booking_status(&self, theme: &Theme, status: BookingStatus) -> AnyElement {
        let (label, text_color, bg_color) = match status {
            BookingStatus::Live => ("LIVE", theme.foreground, theme.success),
            BookingStatus::Upcoming => ("UPCOMING", theme.foreground, theme.primary),
            BookingStatus::Completed => {
                ("COMPLETED", theme.success_foreground, theme.secondary_hover)
            }
            BookingStatus::Cancelled => ("CANCELLED", theme.danger_foreground, theme.danger),
        };
        div()
            .px_3()
            .py_1()
            .rounded(px(999.))
            .bg(bg_color)
            .child(
                div()
                    .text_xs()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(text_color)
                    .child(label),
            )
            .into_any_element()
    }

    pub(crate) fn render_slot_status(&self, theme: &Theme, status: SlotStatus) -> AnyElement {
        let (label, text_color, bg_color) = match status {
            SlotStatus::Open => ("OPEN", theme.success_foreground, theme.success),
            SlotStatus::Booked => ("BOOKED", theme.warning_foreground, theme.warning),
            SlotStatus::Cancelled => ("CANCELLED", theme.danger_foreground, theme.danger),
            SlotStatus::Settled => ("SETTLED", theme.muted_foreground, theme.muted),
        };
        div()
            .px_3()
            .py_1()
            .rounded(px(999.))
            .bg(bg_color)
            .child(
                div()
                    .text_xs()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(text_color)
                    .child(label),
            )
            .into_any_element()
    }

    pub(crate) fn render_booking_card(
        &self,
        booking: &crate::schedule::model::BookingRow,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let booking_id = booking.id;
        let row_status = match booking.status {
            BookingStatus::Live => "Live",
            BookingStatus::Upcoming => "Upcoming",
            BookingStatus::Completed => "Completed",
            BookingStatus::Cancelled => "Cancelled",
        };

        div()
            .id(("schedule-booking", booking_id))
            .rounded(px(12.))
            .p_4()
            .bg(theme.muted)
            .border_1()
            .border_color(theme.border)
            .cursor_pointer()
            .hover(|s| s.bg(theme.secondary_hover))
            .on_click(cx.listener(move |this, _, _, cx| this.open_booking_detail(booking_id, cx)))
            .h_flex()
            .justify_between()
            .items_center()
            .child(
                div()
                    .v_flex()
                    .gap_2()
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.muted_foreground)
                            .child(format!(
                                "{row_status} • {} • {} mins",
                                booking.start_label, booking.duration_mins
                            )),
                    )
                    .child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.foreground)
                            .child(format!("{} — {}", booking.peer_name, booking.peer_address)),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(theme.muted_foreground)
                            .child(if booking.is_host { "Hosting" } else { "Guest" }),
                    ),
            )
            .child(self.render_booking_status(theme, booking.status))
            .into_any_element()
    }

    pub(crate) fn render_slot_row(
        &self,
        slot: &SlotRow,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        use crate::schedule::view::render::helpers;

        let slot_id = slot.id;
        let guest_label = slot
            .guest_name
            .clone()
            .map(|name| format!(" with {name}"))
            .unwrap_or_else(|| " • open for bookings".to_string());

        div()
            .rounded(px(10.))
            .p_3()
            .border_1()
            .border_color(theme.border)
            .bg(theme.background)
            .h_flex()
            .items_center()
            .justify_between()
            .mt_2()
            .child(
                div()
                    .v_flex()
                    .gap_1()
                    .child(div().text_sm().text_color(theme.foreground).child(format!(
                        "{} ({} mins) {}",
                        slot.start_label, slot.duration_mins, guest_label
                    )))
                    .child(
                        div()
                            .text_xs()
                            .text_color(theme.muted_foreground)
                            .child(format!("Price: ${}", slot.price_usd)),
                    ),
            )
            .child(
                div()
                    .h_flex()
                    .items_center()
                    .gap_2()
                    .child(self.render_slot_status(theme, slot.status))
                    .child(helpers::render_action_button(
                        "Remove",
                        theme.danger,
                        theme.danger_foreground,
                        ("schedule-remove-slot", slot_id),
                        cx.listener(move |this, _, _, cx| this.remove_slot(slot_id, cx)),
                    )),
            )
            .into_any_element()
    }
}
