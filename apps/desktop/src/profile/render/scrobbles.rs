use super::*;
use crate::shared::ipfs;
use crate::ui::overflow_menu::track_row_overflow_menu;
use gpui_component::menu::PopupMenuItem;

pub(super) fn render_scrobble_timeline(
    scrobbles: &[ProfileScrobbleRow],
    entity: Entity<ProfileView>,
) -> impl IntoElement {
    div()
        .v_flex()
        .w_full()
        .pt_1()
        .child(render_scrobble_header())
        .children(
            scrobbles
                .iter()
                .enumerate()
                .map(|(index, row)| render_scrobble_row(index, row, entity.clone())),
        )
}

fn render_scrobble_header() -> impl IntoElement {
    div()
        .h_flex()
        .w_full()
        .h(px(SCROBBLE_HEADER_HEIGHT))
        .px_4()
        .items_center()
        .border_b_1()
        .border_color(BORDER_SUBTLE())
        .text_xs()
        .text_color(TEXT_DIM())
        .font_weight(FontWeight::MEDIUM)
        .child(div().w(px(48.)).child("#"))
        .child(div().w(px(SCROBBLE_TITLE_COLUMN_WIDTH)).child("TRACK"))
        .child(
            div()
                .min_w(px(SCROBBLE_ARTIST_COLUMN_WIDTH))
                .flex_1()
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .truncate()
                .child("ARTIST"),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(SCROBBLE_TIME_COLUMN_WIDTH))
                        .h_flex()
                        .items_center()
                        .justify_end()
                        .child("PLAYED"),
                )
                .child(div().w(px(36.))),
        )
}

fn render_scrobble_row(
    index: usize,
    row: &ProfileScrobbleRow,
    entity: Entity<ProfileView>,
) -> impl IntoElement {
    // Stable key so list updates (new scrobble inserted) don't recreate every row.
    let stable_key = match row.track_id.as_deref() {
        Some(id) if !id.trim().is_empty() => format!("{}:{}", row.played_at_sec, id.trim()),
        _ => format!("{}:{}", row.played_at_sec, index),
    };
    let row_group: SharedString = format!("profile-scrobble-row-group-{stable_key}").into();
    let title_color = TEXT_PRIMARY();

    let hover_group_for_menu = row_group.clone();
    let menu_profile_entity = entity;

    let artist_name = row.artist.clone();
    let album_name = row.album.clone();

    div()
        .id(ElementId::Name(
            format!("profile-scrobble-row-{stable_key}").into(),
        ))
        .group(row_group)
        .h_flex()
        .w_full()
        .h(px(SCROBBLE_ROW_HEIGHT))
        .items_center()
        .gap(px(0.))
        .px_4()
        .border_b_1()
        .border_color(BORDER_SUBTLE())
        .child(
            div().h_flex().items_center().w(px(48.)).child(
                div()
                    .text_sm()
                    .text_color(TEXT_DIM())
                    .child(format!("{}", index + 1)),
            ),
        )
        .child(
            div()
                .h_flex()
                .w(px(SCROBBLE_TITLE_COLUMN_WIDTH))
                .flex_none()
                .min_w_0()
                .gap_3()
                .items_center()
                .overflow_hidden()
                .child(render_scrobble_cover(&row.cover_cid))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .text_sm()
                        .truncate()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(title_color)
                        .child(row.title.clone()),
                ),
        )
        .child(
            div()
                .min_w(px(SCROBBLE_ARTIST_COLUMN_WIDTH))
                .flex_1()
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_SECONDARY())
                .truncate()
                .child(row.artist.clone()),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(SCROBBLE_TIME_COLUMN_WIDTH))
                        .text_sm()
                        .text_color(TEXT_MUTED())
                        .h_flex()
                        .justify_end()
                        .child(row.played_ago.clone()),
                )
                .child(track_row_overflow_menu(
                    ("profile-scrobble-dots", index),
                    hover_group_for_menu,
                    true,
                    move |menu, _window, _cx| {
                        let artist_for_profile = artist_name.clone();
                        let artist_for_album = artist_name.clone();
                        let album_for_profile = album_name.clone();

                        menu.item(PopupMenuItem::new("Go to artist").on_click({
                            let menu_profile_entity = menu_profile_entity.clone();
                            move |_, _, cx| {
                                let _ = menu_profile_entity.update(cx, |this, cx| {
                                    this.open_scrobble_artist(artist_for_profile.clone(), cx);
                                });
                            }
                        }))
                        .item(
                            PopupMenuItem::new("Go to album").on_click({
                                let menu_profile_entity = menu_profile_entity.clone();
                                move |_, _, cx| {
                                    let _ = menu_profile_entity.update(cx, |this, cx| {
                                        this.open_scrobble_album(
                                            artist_for_album.clone(),
                                            album_for_profile.clone(),
                                            cx,
                                        );
                                    });
                                }
                            }),
                        )
                    },
                )),
        )
}

fn render_scrobble_cover(cover_cid: &Option<String>) -> impl IntoElement {
    match cover_cid.as_deref() {
        Some(cid) => div()
            .size(px(40.))
            .rounded(px(6.))
            .overflow_hidden()
            .bg(BG_COVER_PLACEHOLDER)
            .flex_shrink_0()
            .child(
                gpui::img(ipfs::heaven_cover_image_url(cid, 96, 96, 80))
                    .size(px(40.))
                    .rounded(px(6.))
                    .object_fit(ObjectFit::Cover),
            ),
        None => div()
            .size(px(40.))
            .rounded(px(6.))
            .bg(BG_COVER_PLACEHOLDER)
            .flex_shrink_0()
            .flex()
            .items_center()
            .justify_center()
            .child(
                gpui::svg()
                    .path("icons/music-note.svg")
                    .size(px(16.))
                    .text_color(TEXT_DIM()),
            ),
    }
}
