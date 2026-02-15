use super::*;
use crate::shared::ipfs;
use gpui_component::spinner::Spinner;
use gpui_component::{Sizable as _, Size};

pub(super) fn render_playlist_cover_art(
    playlist_cover_cid: Option<&str>,
    fallback_cover_paths: &[String],
    optimistic_cover_path: Option<&str>,
    cover_update_busy: bool,
) -> impl IntoElement {
    let mut cover = div()
        .size(px(220.))
        .rounded(px(10.))
        .overflow_hidden()
        .bg(BG_ELEVATED)
        .flex_shrink_0()
        .relative();

    if let Some(path) = optimistic_cover_path
        .map(str::trim)
        .filter(|path| !path.is_empty() && std::path::Path::new(path).exists())
    {
        cover = cover.child(
            gpui::img(PathBuf::from(path))
                .size_full()
                .rounded(px(10.))
                .object_fit(ObjectFit::Cover),
        );
    } else if let Some(cover_cid) = playlist_cover_cid
        .map(str::trim)
        .filter(|cid| !cid.is_empty())
    {
        cover = cover.child(
            gpui::img(ipfs::heaven_cover_image_url(cover_cid, 512, 512, 85))
                .size_full()
                .rounded(px(10.))
                .object_fit(ObjectFit::Cover),
        );
    } else if !fallback_cover_paths.is_empty() {
        cover = cover.child(render_playlist_cover_grid(fallback_cover_paths));
    } else {
        cover = cover.child(
            div()
                .size(px(220.))
                .flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/queue.svg")
                        .size(px(72.))
                        .text_color(TEXT_DIM),
                ),
        );
    }

    cover.when(cover_update_busy, |el| {
        el.child(
            div()
                .absolute()
                .top_0()
                .left_0()
                .right_0()
                .bottom_0()
                .bg(hsla(0., 0., 0., 0.45))
                .flex()
                .items_center()
                .justify_center()
                .child(Spinner::new().with_size(Size::Large).color(TEXT_PRIMARY)),
        )
    })
}

fn render_playlist_cover_grid(paths: &[String]) -> AnyElement {
    let mut slots: Vec<String> = paths
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty() && std::path::Path::new(path).exists())
        .map(str::to_string)
        .take(4)
        .collect();

    if slots.is_empty() {
        return div()
            .size(px(220.))
            .flex()
            .items_center()
            .justify_center()
            .child(
                gpui::svg()
                    .path("icons/queue.svg")
                    .size(px(72.))
                    .text_color(TEXT_DIM),
            )
            .into_any_element();
    }

    if slots.len() == 1 {
        return gpui::img(PathBuf::from(&slots[0]))
            .size_full()
            .rounded(px(10.))
            .object_fit(ObjectFit::Cover)
            .into_any_element();
    }

    let base = slots.clone();
    while slots.len() < 4 {
        let fallback_index = slots.len() % base.len();
        slots.push(base[fallback_index].clone());
    }

    div()
        .size_full()
        .v_flex()
        .gap(px(2.))
        .child(
            div()
                .h_flex()
                .flex_1()
                .gap(px(2.))
                .child(render_playlist_cover_grid_tile(&slots[0]))
                .child(render_playlist_cover_grid_tile(&slots[1])),
        )
        .child(
            div()
                .h_flex()
                .flex_1()
                .gap(px(2.))
                .child(render_playlist_cover_grid_tile(&slots[2]))
                .child(render_playlist_cover_grid_tile(&slots[3])),
        )
        .into_any_element()
}

fn render_playlist_cover_grid_tile(path: &str) -> Div {
    div()
        .flex_1()
        .h_full()
        .overflow_hidden()
        .bg(BG_HOVER)
        .child(
            gpui::img(PathBuf::from(path))
                .size_full()
                .object_fit(ObjectFit::Cover),
        )
}
