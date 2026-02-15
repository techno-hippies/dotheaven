use super::*;
use crate::shared::ipfs;

pub(super) fn render_playlists_panel(
    view: &ProfileView,
    cx: &mut Context<ProfileView>,
) -> AnyElement {
    let playlists = view.library_view.read(cx).sidebar_playlists().to_vec();

    if playlists.is_empty() {
        return div()
            .id("profile-playlists-empty")
            .v_flex()
            .w_full()
            .py_10()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED)
                    .child("No playlists yet."),
            )
            .into_any_element();
    }

    div()
        .id("profile-playlists-panel")
        .v_flex()
        .w_full()
        .pt_1()
        .child(render_playlists_header(playlists.len()))
        .children(
            playlists
                .iter()
                .map(|pl| render_playlist_row(pl, cx).into_any_element()),
        )
        .into_any_element()
}

fn render_playlists_header(count: usize) -> impl IntoElement {
    div()
        .h_flex()
        .w_full()
        .h(px(32.))
        .px_4()
        .items_center()
        .justify_between()
        .border_b_1()
        .border_color(BORDER_SUBTLE)
        .child(
            div()
                .text_xs()
                .font_weight(FontWeight::MEDIUM)
                .text_color(TEXT_DIM)
                .child("PLAYLISTS"),
        )
        .child(
            div()
                .text_xs()
                .text_color(TEXT_DIM)
                .child(format!("{count}")),
        )
}

fn render_playlist_row(
    pl: &library::PlaylistSummary,
    cx: &mut Context<ProfileView>,
) -> impl IntoElement {
    let playlist_id = pl.id.clone();
    let playlist_name = pl.name.clone();
    let playlist_name_for_click = playlist_name.clone();
    let track_count = pl.track_count;
    let cover_cid = pl.cover_cid.clone();

    div()
        .id(ElementId::Name(
            format!("profile-playlist-row-{}", playlist_id.trim()).into(),
        ))
        .h_flex()
        .w_full()
        .h(px(64.))
        .items_center()
        .gap_3()
        .px_4()
        .border_b_1()
        .border_color(BORDER_SUBTLE)
        .cursor_pointer()
        .hover(|s| s.bg(BG_HOVER))
        .on_click(cx.listener(move |this, _, _, cx| {
            this.open_playlist_detail(playlist_id.clone(), playlist_name_for_click.clone(), cx);
        }))
        .child(render_playlist_cover(&cover_cid))
        .child(
            div()
                .v_flex()
                .flex_1()
                .min_w_0()
                .gap_1()
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_PRIMARY)
                        .truncate()
                        .child(playlist_name),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(TEXT_MUTED)
                        .child(format!("{} tracks", track_count)),
                ),
        )
}

fn render_playlist_cover(cover_cid: &Option<String>) -> impl IntoElement {
    match cover_cid
        .as_deref()
        .map(str::trim)
        .filter(|cid| !cid.is_empty())
    {
        Some(cid) => div()
            .size(px(44.))
            .rounded(px(8.))
            .overflow_hidden()
            .bg(BG_COVER_PLACEHOLDER)
            .flex_shrink_0()
            .child(
                gpui::img(ipfs::heaven_cover_image_url(cid, 128, 128, 85))
                    .size(px(44.))
                    .rounded(px(8.))
                    .object_fit(ObjectFit::Cover),
            ),
        None => div()
            .size(px(44.))
            .rounded(px(8.))
            .bg(BG_COVER_PLACEHOLDER)
            .flex_shrink_0()
            .flex()
            .items_center()
            .justify_center()
            .child(
                gpui::svg()
                    .path("icons/queue.svg")
                    .size(px(18.))
                    .text_color(TEXT_DIM),
            ),
    }
}
