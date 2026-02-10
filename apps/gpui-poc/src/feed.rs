//! Social feed — fetches posts from dotheaven-activity subgraph,
//! resolves IPFS metadata, and renders a scrollable post list.

use gpui::*;
use gpui_component::StyledExt;
use serde::Deserialize;

const ACTIVITY_SUBGRAPH: &str = "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn";

const IPFS_GATEWAY: &str = "https://heaven.myfilebase.com/ipfs/";

// =============================================================================
// Subgraph types
// =============================================================================

#[derive(Debug, Deserialize)]
struct SubgraphResponse {
    data: Option<SubgraphData>,
}

#[derive(Debug, Deserialize)]
struct SubgraphData {
    posts: Vec<PostGql>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostGql {
    id: String,
    creator: String,
    content_type: i32,
    metadata_uri: String,
    ipfs_hash: Option<String>,
    #[allow(dead_code)]
    is_adult: bool,
    like_count: i32,
    comment_count: i32,
    block_timestamp: String,
}

/// IPFS metadata stored per post
#[derive(Debug, Deserialize, Default)]
struct IpfsMetadata {
    text: Option<String>,
    description: Option<String>,
    #[allow(dead_code)]
    language: Option<String>,
    image: Option<String>,
    #[serde(rename = "mediaUrl")]
    media_url: Option<String>,
}

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
// Fetching
// =============================================================================

async fn fetch_posts() -> Result<Vec<FeedPost>, String> {
    let gql_posts = smol::unblock(|| {
        let query = r#"{
            posts(
                orderBy: blockTimestamp
                orderDirection: desc
                first: 30
            ) {
                id
                creator
                contentType
                metadataUri
                ipfsHash
                isAdult
                likeCount
                commentCount
                blockTimestamp
            }
        }"#;

        let body = serde_json::json!({ "query": query });
        let resp: SubgraphResponse = ureq::post(ACTIVITY_SUBGRAPH)
            .send_json(&body)
            .map_err(|e| format!("Request failed: {}", e))?
            .body_mut()
            .read_json()
            .map_err(|e| format!("Parse failed: {}", e))?;

        Ok::<_, String>(resp.data.map(|d| d.posts).unwrap_or_default())
    })
    .await?;

    let mut handles = Vec::new();
    for post in &gql_posts {
        let cid = post.ipfs_hash.clone();
        let uri = post.metadata_uri.clone();
        handles.push(smol::unblock(move || {
            fetch_ipfs_metadata_sync(cid.as_deref(), &uri)
        }));
    }

    let mut feed_posts = Vec::new();
    for (i, handle) in handles.into_iter().enumerate() {
        let meta = handle.await;
        let post = &gql_posts[i];

        let text = if post.content_type == 0 {
            meta.text.unwrap_or_default()
        } else {
            meta.description.unwrap_or_default()
        };

        let photo_url = meta
            .image
            .or(meta.media_url)
            .map(|url| resolve_ipfs_url(&url));

        let author_display = shorten_address(&post.creator);
        let time_ago = format_time_ago(&post.block_timestamp);

        feed_posts.push(FeedPost {
            author_display,
            text,
            photo_url,
            like_count: post.like_count,
            comment_count: post.comment_count,
            time_ago,
        });
    }

    Ok(feed_posts)
}

fn fetch_ipfs_metadata_sync(cid: Option<&str>, uri: &str) -> IpfsMetadata {
    let url = if let Some(cid) = cid {
        format!("{}{}", IPFS_GATEWAY, cid)
    } else if uri.starts_with("ipfs://") {
        format!("{}{}", IPFS_GATEWAY, &uri[7..])
    } else if uri.starts_with("http") {
        uri.to_string()
    } else {
        return IpfsMetadata::default();
    };

    match ureq::get(&url).call() {
        Ok(mut resp) => resp.body_mut().read_json().unwrap_or_default(),
        Err(_) => IpfsMetadata::default(),
    }
}

fn resolve_ipfs_url(url: &str) -> String {
    if url.starts_with("ipfs://") {
        format!("{}{}", IPFS_GATEWAY, &url[7..])
    } else {
        url.to_string()
    }
}

fn shorten_address(addr: &str) -> String {
    if addr.len() > 10 {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    } else {
        addr.to_string()
    }
}

fn format_time_ago(timestamp_str: &str) -> String {
    let ts: i64 = timestamp_str.parse().unwrap_or(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let diff = now - ts;

    if diff < 60 {
        "just now".to_string()
    } else if diff < 3600 {
        format!("{}m ago", diff / 60)
    } else if diff < 86400 {
        format!("{}h ago", diff / 3600)
    } else {
        format!("{}d ago", diff / 86400)
    }
}

// =============================================================================
// Colors
// =============================================================================

const BG_SURFACE: Hsla = Hsla { h: 0., s: 0., l: 0.11, a: 1. };
const BG_ELEVATED: Hsla = Hsla { h: 0., s: 0., l: 0.15, a: 1. };
const TEXT_PRIMARY: Hsla = Hsla { h: 0., s: 0., l: 0.98, a: 1. };
const TEXT_SECONDARY: Hsla = Hsla { h: 0., s: 0., l: 0.83, a: 1. };
const TEXT_MUTED: Hsla = Hsla { h: 0., s: 0., l: 0.64, a: 1. };
const TEXT_DIM: Hsla = Hsla { h: 0., s: 0., l: 0.45, a: 1. };
const ACCENT_BLUE: Hsla = Hsla { h: 0.62, s: 0.93, l: 0.76, a: 1. };

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
        cx.spawn(async |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            match fetch_posts().await {
                Ok(posts) => {
                    let _ = this.update(cx, |this, cx| {
                        this.posts = posts;
                        this.loading = false;
                        cx.notify();
                    });
                }
                Err(e) => {
                    log::error!("Feed fetch failed: {}", e);
                    let _ = this.update(cx, |this, cx| {
                        this.error = Some(e);
                        this.loading = false;
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
            return container
                .items_center()
                .justify_center()
                .child(
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
                .child(render_rooms_row())
                .child(render_compose_box())
                .children(self.posts.iter().map(render_post_card)),
        )
    }
}

// =============================================================================
// Live rooms row — 120x180 portrait cards, no container bg
// Matches LiveRoomsRow: w-[120px] h-[180px] rounded-xl
// =============================================================================

fn render_rooms_row() -> impl IntoElement {
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
        .bg(BG_ELEVATED)
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
                        .bg(ACCENT_BLUE)
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
                                .text_color(TEXT_DIM),
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
                        .text_color(TEXT_PRIMARY)
                        .child(label.to_string()),
                ),
        )
}

// =============================================================================
// Compose box
// =============================================================================

fn render_compose_box() -> impl IntoElement {
    div()
        .w_full()
        .rounded(px(12.))
        .bg(BG_SURFACE)
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
                        .bg(BG_ELEVATED)
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/user.svg")
                                .size(px(18.))
                                .text_color(TEXT_DIM),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .py_2()
                        .text_color(TEXT_DIM)
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
                                .text_color(TEXT_MUTED)
                                .cursor_pointer(),
                        )
                        .child(
                            gpui::svg()
                                .path("icons/music-notes.svg")
                                .size(px(20.))
                                .text_color(TEXT_MUTED)
                                .cursor_pointer(),
                        ),
                )
                .child(
                    div()
                        .px_5()
                        .py(px(6.))
                        .rounded_full()
                        .bg(ACCENT_BLUE)
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

fn render_post_card(post: &FeedPost) -> impl IntoElement {
    div()
        .w_full()
        .rounded(px(12.))
        .bg(BG_SURFACE)
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
                        .bg(BG_ELEVATED)
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/user.svg")
                                .size(px(18.))
                                .text_color(TEXT_DIM),
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
                                .text_color(TEXT_PRIMARY)
                                .child(post.author_display.clone()),
                        )
                        .child(div().text_color(TEXT_DIM).child("·"))
                        .child(
                            div()
                                .text_sm()
                                .text_color(TEXT_MUTED)
                                .child(post.time_ago.clone()),
                        ),
                )
                .child(
                    gpui::svg()
                        .path("icons/dots-three.svg")
                        .size(px(20.))
                        .text_color(TEXT_MUTED)
                        .cursor_pointer(),
                ),
        )
        // Post text
        .child(
            div()
                .text_color(TEXT_SECONDARY)
                .child(post.text.clone()),
        )
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
        .child(engagement_item("icons/chat-circle.svg", &post.comment_count.to_string()))
        // 2. Repost
        .child(engagement_item("icons/share-fat.svg", "0"))
        // 3. Like
        .child(engagement_item("icons/heart.svg", &post.like_count.to_string()))
        // 4. Globe (translate)
        .child(
            div()
                .rounded_full()
                .p(px(6.))
                .cursor_pointer()
                .child(
                    gpui::svg()
                        .path("icons/globe.svg")
                        .size(px(20.))
                        .text_color(TEXT_MUTED),
                ),
        )
        // 5. Share
        .child(
            div()
                .rounded_full()
                .p(px(6.))
                .cursor_pointer()
                .child(
                    gpui::svg()
                        .path("icons/share-network.svg")
                        .size(px(20.))
                        .text_color(TEXT_MUTED),
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
        .text_color(TEXT_MUTED)
        .child(
            gpui::svg()
                .path(icon_path)
                .size(px(20.))
                .text_color(TEXT_MUTED),
        )
        .child(
            div()
                .text_sm()
                .child(count.to_string()),
        )
}
