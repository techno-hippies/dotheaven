use super::*;

/// Render a 40x40 album art thumbnail. Shows cover image if available, else a music note icon.
pub(super) fn render_album_art_thumbnail(cover_path: &Option<String>) -> impl IntoElement {
    let container = div()
        .size(px(40.))
        .rounded(px(6.))
        .bg(BG_ELEVATED())
        .flex_shrink_0()
        .overflow_hidden();

    match cover_path {
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => container.child(
            gpui::img(PathBuf::from(path))
                .size(px(40.))
                .rounded(px(6.))
                .object_fit(ObjectFit::Cover),
        ),
        _ => container.flex().items_center().justify_center().child(
            gpui::svg()
                .path("icons/music-note.svg")
                .size(px(16.))
                .text_color(TEXT_DIM()),
        ),
    }
}
