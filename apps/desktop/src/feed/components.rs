use super::*;

// =============================================================================
// Live rooms row — 120x180 portrait cards, no container bg
// Matches LiveRoomsRow: w-[120px] h-[180px] rounded-xl
// =============================================================================

pub(super) fn render_rooms_row() -> impl IntoElement {
    div()
        .h_flex()
        .gap(px(10.))
        .px_1()
        .py_3()
        // "Your room" — create card
        .child(render_room_card("Your room", true))
        // Placeholder rooms to fill the row
        .child(render_room_card("alice", false))
        .child(render_room_card("bob", false))
        .child(render_room_card("carol", false))
        .child(render_room_card("dave", false))
}

fn render_room_card(label: &str, is_create: bool) -> impl IntoElement {
    // 120x180 portrait card matching web's LiveRoomsRow
    div()
        .w(px(120.))
        .h(px(180.))
        .rounded(px(12.))
        .bg(BG_ELEVATED())
        .flex_shrink_0()
        .cursor_pointer()
        .relative()
        // Center content: + icon or avatar
        .child(
            div()
                .absolute()
                .top_0()
                .left_0()
                .size_full()
                .flex()
                .items_center()
                .justify_center()
                .child(if is_create {
                    // Blue + circle
                    div()
                        .size(px(40.))
                        .rounded_full()
                        .bg(ACCENT_BLUE())
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/plus.svg")
                                .size(px(20.))
                                .text_color(hsla(0., 0., 0.09, 1.)),
                        )
                        .into_any_element()
                } else {
                    // User avatar
                    div()
                        .size(px(40.))
                        .rounded_full()
                        .bg(hsla(0., 0., 0.25, 1.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/user.svg")
                                .size(px(18.))
                                .text_color(TEXT_DIM()),
                        )
                        .into_any_element()
                }),
        )
        // Bottom label
        .child(
            div()
                .absolute()
                .bottom_0()
                .left_0()
                .right_0()
                .p(px(10.))
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(TEXT_PRIMARY())
                        .child(label.to_string()),
                ),
        )
}

// =============================================================================
// Compose box
// =============================================================================

pub(super) fn render_compose_box() -> impl IntoElement {
    div()
        .w_full()
        .rounded(px(12.))
        .bg(BG_SURFACE())
        .v_flex()
        // Top: avatar + placeholder text
        .child(
            div()
                .h_flex()
                .gap_3()
                .px_4()
                .pt_4()
                .pb_2()
                .child(
                    div()
                        .size(px(40.))
                        .rounded_full()
                        .bg(BG_ELEVATED())
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/user.svg")
                                .size(px(18.))
                                .text_color(TEXT_DIM()),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .py_2()
                        .text_color(TEXT_DIM())
                        .child("What's on your mind?"),
                ),
        )
        // Bottom: action icons + Post button
        .child(
            div()
                .h_flex()
                .items_center()
                .justify_between()
                .px_4()
                .pb_3()
                .pt_1()
                .child(
                    div()
                        .h_flex()
                        .gap_3()
                        .child(
                            gpui::svg()
                                .path("icons/image.svg")
                                .size(px(20.))
                                .text_color(TEXT_MUTED())
                                .cursor_pointer(),
                        )
                        .child(
                            gpui::svg()
                                .path("icons/music-notes.svg")
                                .size(px(20.))
                                .text_color(TEXT_MUTED())
                                .cursor_pointer(),
                        ),
                )
                .child(
                    div()
                        .px_5()
                        .py(px(6.))
                        .rounded_full()
                        .bg(ACCENT_BLUE())
                        .cursor_pointer()
                        .child(
                            div()
                                .text_sm()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(hsla(0., 0., 0.09, 1.))
                                .child("Post"),
                        ),
                ),
        )
}

// =============================================================================
// Post card
// =============================================================================

pub(super) fn render_post_card(post: &FeedPost) -> impl IntoElement {
    div()
        .w_full()
        .rounded(px(12.))
        .bg(BG_SURFACE())
        .p_4()
        .v_flex()
        .gap_2()
        // Header: avatar + name + time + dots
        .child(
            div()
                .h_flex()
                .gap_3()
                .items_center()
                .child(
                    div()
                        .size(px(40.))
                        .rounded_full()
                        .bg(BG_ELEVATED())
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/user.svg")
                                .size(px(18.))
                                .text_color(TEXT_DIM()),
                        ),
                )
                .child(
                    div()
                        .h_flex()
                        .flex_1()
                        .items_center()
                        .gap(px(6.))
                        .child(
                            div()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(TEXT_PRIMARY())
                                .child(post.author_display.clone()),
                        )
                        .child(div().text_color(TEXT_DIM()).child("·"))
                        .child(
                            div()
                                .text_sm()
                                .text_color(TEXT_MUTED())
                                .child(post.time_ago.clone()),
                        ),
                )
                .child(
                    gpui::svg()
                        .path("icons/dots-three.svg")
                        .size(px(20.))
                        .text_color(TEXT_MUTED())
                        .cursor_pointer(),
                ),
        )
        // Post text
        .child(div().text_color(TEXT_SECONDARY()).child(post.text.clone()))
        // Engagement bar — 5 items equally spaced across full width
        .child(render_engagement_bar(post))
}

// =============================================================================
// Engagement bar — 5 items, justify-between, full width
// Matches web: Comment · Repost · Like · Globe · Share
// =============================================================================

fn render_engagement_bar(post: &FeedPost) -> impl IntoElement {
    div()
        .h_flex()
        .w_full()
        .pt_2()
        .justify_between()
        // 1. Comment
        .child(engagement_item(
            "icons/chat-circle.svg",
            &post.comment_count.to_string(),
        ))
        // 2. Repost
        .child(engagement_item("icons/share-fat.svg", "0"))
        // 3. Like
        .child(engagement_item(
            "icons/heart.svg",
            &post.like_count.to_string(),
        ))
        // 4. Globe (translate)
        .child(
            div().rounded_full().p(px(6.)).cursor_pointer().child(
                gpui::svg()
                    .path("icons/globe.svg")
                    .size(px(20.))
                    .text_color(TEXT_MUTED()),
            ),
        )
        // 5. Share
        .child(
            div().rounded_full().p(px(6.)).cursor_pointer().child(
                gpui::svg()
                    .path("icons/share-network.svg")
                    .size(px(20.))
                    .text_color(TEXT_MUTED()),
            ),
        )
}

fn engagement_item(icon_path: &'static str, count: &str) -> impl IntoElement {
    div()
        .h_flex()
        .items_center()
        .gap(px(6.))
        .rounded_full()
        .p(px(6.))
        .cursor_pointer()
        .text_color(TEXT_MUTED())
        .child(
            gpui::svg()
                .path(icon_path)
                .size(px(20.))
                .text_color(TEXT_MUTED()),
        )
        .child(div().text_sm().child(count.to_string()))
}
