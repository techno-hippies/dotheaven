use super::FeedPost;
use crate::shared::ipfs;
use serde::Deserialize;
use std::env;

const DEFAULT_MUSIC_SOCIAL_SUBGRAPH: &str =
    "https://graph.dotheaven.org/subgraphs/name/dotheaven/music-social-tempo";

fn music_social_subgraph_url() -> String {
    env::var("SUBGRAPH_MUSIC_SOCIAL_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            env::var("SUBGRAPH_BASE_URL")
                .ok()
                .map(|value| value.trim().trim_end_matches('/').to_string())
                .filter(|value| !value.is_empty())
                .map(|base| format!("{base}/subgraphs/name/dotheaven/music-social-tempo"))
        })
        .unwrap_or_else(|| DEFAULT_MUSIC_SOCIAL_SUBGRAPH.to_string())
}

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

pub(super) async fn fetch_posts() -> Result<Vec<FeedPost>, String> {
    let gql_posts = smol::unblock(|| {
        let subgraph_url = music_social_subgraph_url();
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
        let resp: SubgraphResponse = ureq::post(&subgraph_url)
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
            .map(|url| ipfs::resolve_ipfs_url(&url));

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
        ipfs::resolve_ipfs_url(&format!("ipfs://{cid}"))
    } else if uri.starts_with("ipfs://") {
        ipfs::resolve_ipfs_url(uri)
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
