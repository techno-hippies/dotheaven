use super::*;

pub(in crate::library) fn render_library_search_bar(
    input_state: &Entity<InputState>,
    search_query: &str,
    filtered_count: usize,
    total_count: usize,
) -> impl IntoElement {
    let result_label = if search_query.trim().is_empty() {
        format!("{} tracks", total_count)
    } else if filtered_count == 0 {
        "No results".to_string()
    } else {
        format!("{} results", filtered_count)
    };

    div()
        .h_flex()
        .w_full()
        .items_center()
        .gap_3()
        .child(
            div()
                .h(px(36.))
                .flex_1()
                .rounded_full()
                .bg(BG_ELEVATED())
                .px_3()
                .flex()
                .items_center()
                .gap_2()
                .child(
                    gpui::svg()
                        .path("icons/magnifying-glass.svg")
                        .size(px(14.))
                        .text_color(TEXT_DIM()),
                )
                .child(
                    div()
                        .flex_1()
                        .child(Input::new(input_state).appearance(false).cleanable(false)),
                ),
        )
        .child(div().text_sm().text_color(TEXT_MUTED()).child(result_label))
}
