mod availability;
mod detail;
mod header;
mod helpers;
mod rows;
mod upcoming;

use gpui::*;
use gpui_component::{ActiveTheme, StyledExt};

use crate::schedule::model::ScheduleScreen;
use crate::schedule::view::state::ScheduleView;

impl Render for ScheduleView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme().clone();
        let selected_booking = self.selected_booking().cloned();

        let body: AnyElement = match self.screen() {
            ScheduleScreen::Upcoming => self.render_upcoming_tab(&theme, cx).into_any_element(),
            ScheduleScreen::Detail => selected_booking
                .map(|booking| {
                    self.render_detail_tab(&booking, &theme, cx)
                        .into_any_element()
                })
                .unwrap_or_else(|| {
                    div()
                        .text_sm()
                        .text_color(theme.warning)
                        .child("Selected booking missing. Go back to upcoming.")
                        .into_any_element()
                }),
            ScheduleScreen::Availability => {
                self.render_availability_tab(&theme, cx).into_any_element()
            }
        };

        div()
            .id("schedule-root")
            .v_flex()
            .size_full()
            .bg(theme.background)
            .overflow_y_scroll()
            .child(self.render_header(&theme, cx))
            .child(
                div()
                    .w_full()
                    .pt_4()
                    .pb_8()
                    .child(div().w_full().max_w(px(960.)).mx_auto().px_6().child(body)),
            )
            .into_any_element()
    }
}
