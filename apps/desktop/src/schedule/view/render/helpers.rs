use gpui::*;
use gpui_component::{
    input::{Input, InputState},
    theme::Theme,
    StyledExt,
};

use crate::schedule::view::state::ScheduleView;

pub(crate) fn render_schedule_input(
    input_state: &Entity<InputState>,
    suffix: Option<&'static str>,
    theme: &Theme,
) -> Div {
    let mut field = div()
        .h(px(42.))
        .w_full()
        .rounded_full()
        .border_1()
        .border_color(theme.border)
        .bg(theme.background)
        .px_4()
        .h_flex()
        .gap_2()
        .items_center()
        .child(
            div()
                .flex_1()
                .child(Input::new(input_state).appearance(false).cleanable(false)),
        );

    if let Some(suffix) = suffix {
        field = field.child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.muted_foreground)
                .child(suffix),
        );
    }

    field
}

pub(crate) fn render_pill_button(
    label: &str,
    icon: Option<&'static str>,
    bg: Hsla,
    fg: Hsla,
    hover_bg: Hsla,
    button_id: impl Into<ElementId>,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    let label = label.to_string();

    let mut button = div()
        .id(button_id)
        .h_flex()
        .items_center()
        .justify_center()
        .gap_2()
        .h(px(40.))
        .px_5()
        .rounded_full()
        .bg(bg)
        .cursor_pointer()
        .hover({
            let hover_bg = hover_bg;
            move |s: gpui::StyleRefinement| s.bg(hover_bg)
        })
        .on_click(move |ev, window, cx| on_click(ev, window, cx));

    if let Some(icon_path) = icon {
        button = button.child(gpui::svg().path(icon_path).size(px(14.)).text_color(fg));
    }

    button
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(fg)
                .child(label),
        )
        .into_any_element()
}

pub(crate) fn render_icon_button(
    icon_path: &'static str,
    bg: Hsla,
    fg: Hsla,
    hover_bg: Hsla,
    button_id: impl Into<ElementId>,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    div()
        .id(button_id)
        .size(px(36.))
        .rounded(px(8.))
        .bg(bg)
        .cursor_pointer()
        .hover({
            let hover_bg = hover_bg;
            move |s: gpui::StyleRefinement| s.bg(hover_bg)
        })
        .h_flex()
        .items_center()
        .justify_center()
        .on_click(move |ev, window, cx| on_click(ev, window, cx))
        .child(gpui::svg().path(icon_path).size(px(18.)).text_color(fg))
        .into_any_element()
}

pub(crate) fn render_action_button(
    label: &str,
    accent: Hsla,
    label_color: Hsla,
    button_id: impl Into<ElementId>,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    let action_label = label.to_string();
    div()
        .id(button_id)
        .h_flex()
        .items_center()
        .justify_center()
        .h(px(36.))
        .min_w(px(96.))
        .px_4()
        .rounded_full()
        .bg(accent)
        .border_1()
        .border_color(accent)
        .hover(|s| s.opacity(0.9))
        .cursor_pointer()
        .on_click(move |ev, window, cx| on_click(ev, window, cx))
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(label_color)
                .child(action_label),
        )
        .into_any_element()
}

pub(crate) fn render_detail_kv(
    label: impl Into<SharedString>,
    value: impl Into<SharedString>,
    theme: &Theme,
) -> AnyElement {
    let label: SharedString = label.into();
    let value: SharedString = value.into();

    div()
        .h_flex()
        .items_center()
        .justify_between()
        .pt_1()
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::MEDIUM)
                .text_color(theme.muted_foreground)
                .child(label),
        )
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.foreground)
                .child(value),
        )
        .into_any_element()
}

pub(crate) fn render_base_price_card(
    view: &ScheduleView,
    theme: &Theme,
    cx: &mut Context<ScheduleView>,
) -> AnyElement {
    if view.editing_base_price() {
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
                    .text_xs()
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(theme.muted_foreground)
                    .child("Base Price"),
            )
            .child(
                div()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .gap_3()
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .w(px(120.))
                                    .flex_shrink_0()
                                    .child(render_schedule_input(
                                        view.base_price_input(),
                                        None,
                                        theme,
                                    )),
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(theme.muted_foreground)
                                    .child("aUSD"),
                            ),
                    )
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .child(render_action_button(
                                "Cancel",
                                theme.secondary,
                                theme.secondary_foreground,
                                ("schedule-cancel-base-price", 0u64),
                                cx.listener(|this, _, _, cx| this.cancel_edit_base_price(cx)),
                            ))
                            .child(render_action_button(
                                "Save",
                                theme.primary,
                                theme.primary_foreground,
                                ("schedule-save-base-price", 0u64),
                                cx.listener(|this, _, _, cx| this.set_base_price(cx)),
                            )),
                    ),
            )
            .into_any_element()
    } else {
        let base_price = view.base_price().to_string();
        div()
            .rounded(px(12.))
            .p_4()
            .border_1()
            .border_color(theme.border)
            .bg(theme.muted)
            .h_flex()
            .items_center()
            .justify_between()
            .gap_3()
            .child(
                div()
                    .v_flex()
                    .gap_1()
                    .min_w_0()
                    .child(
                        div()
                            .text_xs()
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(theme.muted_foreground)
                            .child("Base Price"),
                    )
                    .child(
                        div()
                            .h_flex()
                            .items_baseline()
                            .gap_1()
                            .child(
                                div()
                                    .text_2xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(theme.foreground)
                                    .child(base_price),
                            )
                            .child(
                                div()
                                    .text_base()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(theme.muted_foreground)
                                    .child("aUSD"),
                            ),
                    ),
            )
            .child(render_icon_button(
                "icons/pencil-simple.svg",
                theme.background,
                theme.foreground,
                theme.secondary_hover,
                ("schedule-edit-base-price", 0u64),
                cx.listener(|this, _, window, cx| this.start_edit_base_price(window, cx)),
            ))
            .into_any_element()
    }
}
