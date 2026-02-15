//! Social feed — fetches posts from dotheaven-activity subgraph,
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

const BG_SURFACE: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.11,
    a: 1.,
};
const BG_ELEVATED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.15,
    a: 1.,
};
const TEXT_PRIMARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.98,
    a: 1.,
};
const TEXT_SECONDARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.83,
    a: 1.,
};
const TEXT_MUTED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.64,
    a: 1.,
};
const TEXT_DIM: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.45,
    a: 1.,
};
const ACCENT_BLUE: Hsla = Hsla {
    h: 0.62,
    s: 0.93,
    l: 0.76,
    a: 1.,
};

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
                .child(div().text_color(TEXT_MUTED).child("Loading feed..."));
        }

        if let Some(err) = &self.error {
            return container.items_center().justify_center().child(
                div()
                    .v_flex()
                    .items_center()
                    .gap_2()
                    .child(div().text_color(TEXT_MUTED).child("Failed to load feed"))
                    .child(div().text_xs().text_color(TEXT_DIM).child(err.clone())),
            );
        }

        if self.posts.is_empty() {
            return container
                .items_center()
                .justify_center()
                .child(div().text_color(TEXT_MUTED).child("No posts yet"));
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
