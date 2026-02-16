use super::super::*;

pub(super) fn section_label(text: &'static str, theme: &Theme) -> impl IntoElement {
    div()
        .text_lg()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(theme.foreground)
        .child(text)
}

pub(super) fn selectable_chip(label: &'static str, active: bool, theme: &Theme) -> Div {
    div()
        .px_4()
        .py(px(8.))
        .rounded_full()
        .border_1()
        .border_color(if active { theme.primary } else { theme.border })
        .bg(if active {
            theme.secondary
        } else {
            theme.background
        })
        .text_sm()
        .font_weight(if active {
            FontWeight::SEMIBOLD
        } else {
            FontWeight::NORMAL
        })
        .text_color(if active {
            theme.foreground
        } else {
            theme.muted_foreground
        })
        .child(label)
}

pub(super) fn render_modal_input(
    input_state: &Entity<InputState>,
    theme: &Theme,
    suffix: Option<&'static str>,
) -> impl IntoElement {
    div()
        .h(px(42.))
        .w_full()
        .rounded_full()
        .border_1()
        .border_color(theme.border)
        .bg(theme.background)
        .px_4()
        .h_flex()
        .items_center()
        .gap_2()
        .child(
            div()
                .flex_1()
                .child(Input::new(input_state).appearance(false).cleanable(false)),
        )
        .when_some(suffix, |el, value| {
            el.child(
                div()
                    .text_sm()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.muted_foreground)
                    .child(value),
            )
        })
}
