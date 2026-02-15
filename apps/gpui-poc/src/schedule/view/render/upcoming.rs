use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::theme::Theme;
use gpui_component::StyledExt;

use crate::schedule::view::state::ScheduleView;

impl ScheduleView {
    pub(crate) fn render_upcoming_tab(&self, theme: &Theme, cx: &mut Context<Self>) -> AnyElement {
        let bookings = self
            .upcoming_bookings()
            .iter()
            .map(|booking| self.render_booking_card(booking, theme, cx))
            .collect::<Vec<_>>();

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
                            .child("Upcoming Sessions"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.muted_foreground)
                            .child("Review scheduled sessions and join when live"),
                    ),
            )
            .when(self.upcoming_bookings().is_empty(), |el: Div| {
                el.child(
                    div()
                        .px_4()
                        .py_5()
                        .rounded(px(12.))
                        .bg(theme.muted)
                        .border_1()
                        .border_color(theme.border)
                        .child(
                            div().text_sm().text_color(theme.muted_foreground).child(
                                "No sessions yet. Add availability slots to build a schedule.",
                            ),
                        ),
                )
            })
            .children(bookings)
            .into_any_element()
    }
}
