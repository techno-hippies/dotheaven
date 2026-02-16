use chrono::{Datelike, Utc};
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{theme::Theme, StyledExt};

use crate::schedule::model::SlotStatus;
use crate::schedule::view::state::ScheduleView;

impl ScheduleView {
    pub(crate) fn render_availability_tab(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        const DAY_SHORT: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

        let week_dates = self.week_dates();
        let selected_idx = self.selected_day_idx();
        let selected_day = self.selected_day();
        let today = Utc::now().date_naive();
        let selected_day_label = selected_day.format("%A, %b %-d").to_string();

        let week_start = week_dates.first().copied().unwrap_or(today);
        let week_end = week_dates.last().copied().unwrap_or(today);
        let week_label = if week_start.month() == week_end.month() {
            format!(
                "{} {} - {} {}",
                week_start.format("%b"),
                week_start.format("%-d"),
                week_end.format("%b"),
                week_end.format("%-d, %Y"),
            )
        } else {
            format!(
                "{} {} - {} {}",
                week_start.format("%b %-d"),
                week_start.format("%Y"),
                week_end.format("%b %-d"),
                week_end.format("%Y"),
            )
        };

        let mut day_buttons: Vec<AnyElement> = Vec::with_capacity(7);
        for (idx, date) in week_dates.iter().enumerate() {
            let is_active = selected_idx == idx;
            let is_today = *date == today;
            let has_slots = self.slot_day_count(*date) > 0;

            let border_color = if is_active {
                theme.primary
            } else if is_today {
                theme.warning.opacity(0.45)
            } else {
                theme.border
            };

            let bg = if is_active {
                theme.primary
            } else {
                theme.background
            };
            let hover_bg = theme.secondary_hover;
            let click_idx = idx;

            let mut button = div()
                .id(("schedule-day-button", idx))
                .relative()
                .w_full()
                .h(px(58.))
                .v_flex()
                .items_center()
                .justify_center()
                .rounded(px(10.))
                .border_1()
                .border_color(border_color)
                .bg(bg);

            if !is_active {
                button = button
                    .cursor_pointer()
                    .hover(move |s| s.bg(hover_bg))
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.set_selected_day_idx(click_idx, cx)),
                    );
            }

            let day_label_color = if is_active {
                theme.primary_foreground
            } else {
                theme.muted_foreground
            };
            let day_number_color = if is_active {
                theme.primary_foreground
            } else if is_today {
                theme.warning
            } else {
                theme.foreground
            };
            let dot_color = if is_active {
                theme.primary_foreground
            } else {
                theme.muted_foreground
            };

            button = button
                .child(
                    div()
                        .v_flex()
                        .items_center()
                        .gap_0()
                        .child(
                            div()
                                .text_xs()
                                .line_height(px(14.))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(day_label_color)
                                .child(DAY_SHORT[idx]),
                        )
                        .child(
                            div()
                                .text_lg()
                                .line_height(px(22.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(day_number_color)
                                .child(date.format("%-d").to_string()),
                        ),
                )
                .child(
                    div()
                        .absolute()
                        .bottom(px(8.))
                        .left(px(0.))
                        .right(px(0.))
                        .h_flex()
                        .justify_center()
                        .child(div().size(px(4.)).rounded_full().bg(dot_color).opacity(
                            if has_slots {
                                if is_active {
                                    0.6
                                } else {
                                    1.0
                                }
                            } else {
                                0.0
                            },
                        )),
                );

            day_buttons.push(button.into_any_element());
        }

        let mut slot_rows: Vec<AnyElement> = Vec::with_capacity(48);
        for hour in 0_u32..24 {
            for minute in [0_u32, 30_u32] {
                let start_time = self.create_slot_time_for_day(hour, minute);
                let status = self.slot_for_start_time(start_time).map(|slot| slot.status);
                let is_booked = matches!(status, Some(SlotStatus::Booked));
                let is_open = matches!(status, Some(SlotStatus::Open));
                let disabled = is_booked || !self.accepting_bookings();
                let display_hour = (hour + 11) % 12 + 1;
                let period = if hour >= 12 { "PM" } else { "AM" };
                let time_label = format!("{display_hour}:{minute:02} {period}");

                let bg = if is_open {
                    theme.primary
                } else if is_booked {
                    theme.secondary
                } else {
                    theme.background
                };

                let border_color = if is_open { theme.primary } else { theme.border };

                let time_color = if is_open {
                    theme.primary_foreground
                } else {
                    theme.muted_foreground
                };

                let mut row = div()
                    .id(("schedule-slot", start_time as u64))
                    .w_full()
                    .h(px(56.))
                    .px_4()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .gap_3()
                    .rounded(px(12.))
                    .border_1()
                    .border_color(border_color)
                    .bg(bg)
                    .opacity(if disabled { 0.55 } else { 1.0 });

                if !disabled {
                    let hover_bg = if is_open {
                        theme.primary_hover
                    } else {
                        theme.secondary_hover
                    };
                    let hover_border = if is_open {
                        theme.primary_hover
                    } else {
                        theme.primary.opacity(0.5)
                    };

                    row =
                        row.cursor_pointer()
                            .hover(move |s: gpui::StyleRefinement| {
                                s.bg(hover_bg).border_color(hover_border)
                            })
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.toggle_slot_time(start_time, cx)
                            }));
                }

                let right = if is_open {
                    div()
                        .w(px(72.))
                        .h_flex()
                        .items_center()
                        .justify_end()
                        .child(
                            div()
                                .size(px(20.))
                                .rounded_full()
                                .bg(theme.primary_foreground.opacity(0.2))
                                .h_flex()
                                .items_center()
                                .justify_center()
                                .child(
                                    gpui::svg()
                                        .path("icons/check.svg")
                                        .size(px(14.))
                                        .text_color(theme.primary_foreground),
                                ),
                        )
                } else if is_booked {
                    div()
                        .w(px(72.))
                        .h_flex()
                        .items_center()
                        .justify_end()
                        .child(
                            div()
                                .text_sm()
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(theme.muted_foreground)
                                .child("Booked"),
                        )
                } else {
                    div()
                        .w(px(72.))
                        .h_flex()
                        .items_center()
                        .justify_end()
                        .child(
                            div()
                                .size(px(20.))
                                .rounded_full()
                                .border_1()
                                .border_color(theme.border),
                        )
                };

                slot_rows.push(
                    row.child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(time_color)
                            .child(time_label),
                    )
                    .child(right)
                    .into_any_element(),
                );
            }
        }

        div()
            .v_flex()
            .w_full()
            .gap_4()
            .when(!self.accepting_bookings(), |el| {
                el.child(
                    div()
                        .rounded(px(12.))
                        .px_4()
                        .py_3()
                        .bg(theme.warning.opacity(0.12))
                        .border_1()
                        .border_color(theme.warning.opacity(0.25))
                        .text_sm()
                        .text_color(theme.warning)
                        .child("Bookings are currently paused."),
                )
            })
            .child(super::helpers::render_base_price_card(self, theme, cx))
            .child(
                div()
                    .rounded(px(12.))
                    .p_4()
                    .border_1()
                    .border_color(theme.border)
                    .bg(theme.muted)
                    .v_flex()
                    .gap_3()
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .h_flex()
                                    .items_center()
                                    .gap_2()
                                    .child(super::helpers::render_icon_button(
                                        "icons/chevron-left.svg",
                                        theme.background,
                                        theme.foreground,
                                        theme.secondary_hover,
                                        ("schedule-shift-week", 0u64),
                                        cx.listener(|this, _, _, cx| this.shift_week(-1, cx)),
                                    ))
                                    .child(
                                        div()
                                            .text_base()
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(theme.foreground)
                                            .child(week_label),
                                    )
                                    .child(super::helpers::render_icon_button(
                                        "icons/chevron-right.svg",
                                        theme.background,
                                        theme.foreground,
                                        theme.secondary_hover,
                                        ("schedule-shift-week", 1u64),
                                        cx.listener(|this, _, _, cx| this.shift_week(1, cx)),
                                    )),
                            )
                            .child(super::helpers::render_pill_button(
                                "Today",
                                None,
                                theme.secondary,
                                theme.secondary_foreground,
                                theme.secondary_hover,
                                ("schedule-go-today", 0u64),
                                cx.listener(|this, _, _, cx| this.go_today(cx)),
                            )),
                    )
                    .child(
                        div()
                            .w_full()
                            .grid()
                            .grid_cols(7)
                            .gap_2()
                            .children(day_buttons),
                    )
                    .child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.foreground)
                            .child(selected_day_label),
                    )
                    .child(
                        div()
                            .w_full()
                            .grid()
                            .grid_cols(2)
                            .gap_2()
                            .children(slot_rows),
                    ),
            )
            .into_any_element()
    }
}
