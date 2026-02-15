use super::*;

pub(super) fn render_side_player_art(cover_path: &Option<String>) -> impl IntoElement {
    let container = div()
        .size(px(360.))
        .rounded(px(14.))
        .overflow_hidden()
        .bg(hsla(0., 0., 0.15, 1.));

    match cover_path {
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => container.child(
            gpui::img(std::path::PathBuf::from(path))
                .size(px(360.))
                .rounded(px(14.))
                .object_fit(ObjectFit::Cover),
        ),
        _ => container.flex().items_center().justify_center().child(
            gpui::svg()
                .path("icons/music-notes.svg")
                .size(px(72.))
                .text_color(hsla(0., 0., 0.25, 1.)),
        ),
    }
}
