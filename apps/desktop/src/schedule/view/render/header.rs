use gpui::*;
use gpui_component::switch::Switch;
use gpui_component::theme::Theme;
use gpui_component::Sizable;
use gpui_component::StyledExt;

use crate::schedule::model::ScheduleScreen;
use crate::schedule::view::state::ScheduleView;

impl ScheduleView {
    pub(crate) fn render_header(&self, theme: &Theme, cx: &mut Context<Self>) -> AnyElement {
        let show_back_button = matches!(
            self.screen(),
            ScheduleScreen::Availability | ScheduleScreen::Detail
        );
        let entity = cx.entity().clone();

        let action_button = match self.screen() {
            ScheduleScreen::Upcoming => Some(super::helpers::render_pill_button(
                "Availability",
                Some("icons/calendar-blank.svg"),
                theme.secondary,
                theme.secondary_foreground,
                theme.secondary_hover,
                ("schedule-open-availability", 0u64),
                cx.listener(|this, _, _, cx| this.open_availability(cx)),
            )),
            ScheduleScreen::Availability => Some(
                div()
                    .h_flex()
                    .items_center()
                    .gap_3()
                    .child(
                        div()
                            .text_sm()
                            .line_height(px(16.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(theme.muted_foreground)
                            .child("Accepting"),
                    )
                    .child(
                        Switch::new("schedule-accepting-switch")
                            .checked(self.accepting_bookings())
                            .small()
                            .on_click(move |_, _window, cx| {
                                let _ = entity.update(cx, |this, cx| this.toggle_accepting(cx));
                            }),
                    )
                    .into_any_element(),
            ),
            ScheduleScreen::Detail => None,
        };

        self.render_standard_header(
            theme,
            self.view_title(),
            show_back_button,
            action_button,
            cx,
        )
    }

    fn render_standard_header(
        &self,
        theme: &Theme,
        title: &'static str,
        show_back_button: bool,
        right_action: Option<AnyElement>,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let mut left_cluster = div().h_flex().items_center().gap_3();

        if show_back_button {
            left_cluster = left_cluster.child(
                div()
                    .id((
                        "schedule-back-button",
                        self.selected_booking_id().unwrap_or(0),
                    ))
                    .size(px(36.))
                    .rounded(px(8.))
                    .cursor_pointer()
                    .hover(|s| s.bg(theme.secondary_hover))
                    .h_flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(|this, _, _, cx| this.open_upcoming(cx)))
                    .child(
                        gpui::svg()
                            .path("icons/arrow-left.svg")
                            .size(px(20.))
                            .text_color(theme.foreground),
                    ),
            );
        }

        left_cluster = left_cluster.child(
            div()
                .text_lg()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground)
                .truncate()
                .child(title),
        );

        let mut header_inner = div()
            .h(px(72.))
            .h_flex()
            .items_center()
            .justify_between()
            .gap_4()
            .w_full()
            .max_w(px(960.))
            .mx_auto()
            .px_6()
            .child(left_cluster);

        if let Some(action) = right_action {
            header_inner = header_inner.child(div().flex_shrink_0().child(action));
        }

        div()
            .w_full()
            .border_b_1()
            .border_color(theme.border)
            .child(header_inner)
            .into_any_element()
    }
}
