//! Social feed — fetches posts from dotheaven music-social subgraph,
//! resolves IPFS metadata, and renders a scrollable post list.

use gpui::*;
use gpui_component::StyledExt;

mod components;
mod fetch;

// =============================================================================
// Display types
// =============================================================================

#[derive(Debug, Clone)]
pub struct FeedPost {
    pub author_display: String,
    pub text: String,
    #[allow(dead_code)]
    pub photo_url: Option<String>,
    pub like_count: i32,
    pub comment_count: i32,
    pub time_ago: String,
}

// =============================================================================
// Colors
// =============================================================================

use crate::app_colors;

macro_rules! define_color_fns {
    ($($name:ident => $field:ident),* $(,)?) => {
        $(
            #[allow(non_snake_case)]
            fn $name() -> Hsla { app_colors::colors().$field }
        )*
    };
}

define_color_fns! {
    BG_SURFACE => bg_surface,
    BG_ELEVATED => bg_elevated,
    TEXT_PRIMARY => text_primary,
    TEXT_SECONDARY => text_secondary,
    TEXT_MUTED => text_muted,
    TEXT_DIM => text_dim,
    ACCENT_BLUE => accent_blue,
}


// =============================================================================
// Feed view
// =============================================================================

pub struct FeedView {
    posts: Vec<FeedPost>,
    loading: bool,
    error: Option<String>,
}

impl FeedView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_progress("feed.load", "Loading feed...", None);
        });
        cx.spawn(async |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            match fetch::fetch_posts().await {
                Ok(posts) => {
                    let _ = this.update(cx, |this, cx| {
                        this.posts = posts;
                        this.loading = false;
                        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
                            status.publish_success("feed.load", "Feed loaded.");
                        });
                        cx.notify();
                    });
                }
                Err(e) => {
                    log::error!("Feed fetch failed: {}", e);
                    let _ = this.update(cx, |this, cx| {
                        this.error = Some(e.clone());
                        this.loading = false;
                        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
                            status.publish_error("feed.load", format!("Feed load failed: {e}"));
                        });
                        cx.notify();
                    });
                }
            }
        })
        .detach();

        Self {
            posts: Vec::new(),
            loading: true,
            error: None,
        }
    }
}

impl Render for FeedView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let container = div()
            .id("feed-scroll")
            .v_flex()
            .flex_1()
            .size_full()
            .overflow_y_scroll()
            .px_6()
            .py_4();

        if self.loading {
            return container
                .items_center()
                .justify_center()
                .child(div().text_color(TEXT_MUTED()).child("Loading feed..."));
        }

        if let Some(err) = &self.error {
            return container.items_center().justify_center().child(
                div()
                    .v_flex()
                    .items_center()
                    .gap_2()
                    .child(div().text_color(TEXT_MUTED()).child("Failed to load feed"))
                    .child(div().text_xs().text_color(TEXT_DIM()).child(err.clone())),
            );
        }

        if self.posts.is_empty() {
            return container
                .items_center()
                .justify_center()
                .child(div().text_color(TEXT_MUTED()).child("No posts yet"));
        }

        container.child(
            div()
                .v_flex()
                .w_full()
                .max_w(px(720.))
                .mx_auto()
                .gap_3()
                .child(components::render_rooms_row())
                .child(components::render_compose_box())
                .children(self.posts.iter().map(components::render_post_card)),
        )
    }
}
