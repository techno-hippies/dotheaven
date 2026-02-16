use super::*;
use crate::ui::tooltip_for_text;
use gpui_component::StyledExt;

fn sort_indicator(
    sort_state: Option<LibrarySortState>,
    field: LibrarySortField,
) -> Option<&'static str> {
    match sort_state {
        Some(state) if state.field == field => Some(match state.direction {
            LibrarySortDirection::Asc => "▲",
            LibrarySortDirection::Desc => "▼",
        }),
        _ => None,
    }
}

pub(in crate::library) fn render_table_header(
    sort_state: Option<LibrarySortState>,
    sortable: bool,
    is_detail_view: bool,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let artist_width = if is_detail_view {
        DETAIL_ARTIST_COLUMN_WIDTH
    } else {
        ARTIST_COLUMN_WIDTH
    };
    let album_min_width = if is_detail_view {
        DETAIL_ALBUM_COLUMN_WIDTH
    } else {
        ALBUM_COLUMN_WIDTH
    };

    let title_cell = {
        let cell = div()
            .w(px(TITLE_COLUMN_WIDTH))
            .flex_none()
            .min_w_0()
            .h_flex()
            .items_center()
            .gap_1()
            .child("TITLE")
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Title),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED()).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-title")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY()))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Title, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let artist_cell = {
        let cell = div()
            .w(px(artist_width))
            .pl_4()
            .mr_3()
            .min_w_0()
            .overflow_hidden()
            .truncate()
            .h_flex()
            .items_center()
            .gap_1()
            .child("ARTIST")
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Artist),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED()).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-artist")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY()))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Artist, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let album_cell = {
        let cell = div()
            .min_w(px(album_min_width))
            .pl_4()
            .flex_1()
            .min_w_0()
            .overflow_hidden()
            .truncate()
            .h_flex()
            .items_center()
            .gap_1()
            .child("ALBUM")
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Album),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED()).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-album")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY()))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Album, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let duration_cell = {
        let cell = div()
            .w(px(52.))
            .h_flex()
            .items_center()
            .justify_end()
            .gap_1()
            .child(
                gpui::svg()
                    .path("icons/clock.svg")
                    .size(px(14.))
                    .text_color(TEXT_DIM()),
            )
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Duration),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED()).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-duration")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY()))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Duration, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let storage_cell = {
        let cell = div()
            .id("library-storage-header")
            .w(px(36.))
            .h_flex()
            .items_center()
            .justify_center()
            .gap_1()
            .child(
                gpui::svg()
                    .path("icons/database.svg")
                    .size(px(14.))
                    .text_color(TEXT_DIM()),
            )
            .tooltip(tooltip_for_text("Storage status"))
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Storage),
                |el, arrow| el.child(div().text_xs().text_color(TEXT_MUTED()).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-storage")
                .cursor_pointer()
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Storage, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    div()
        .h_flex()
        .w_full()
        .h(px(HEADER_HEIGHT))
        .px_4()
        .items_center()
        .border_b_1()
        .border_color(BORDER_SUBTLE())
        .text_xs()
        .text_color(TEXT_DIM())
        .font_weight(FontWeight::MEDIUM)
        .child(div().w(px(48.)).child("#"))
        .child(title_cell)
        .child(artist_cell)
        .child(album_cell)
        // Storage status column header
        .child(storage_cell)
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(duration_cell)
                // Spacer matching the three-dot column
                .child(div().w(px(36.))),
        )
}
