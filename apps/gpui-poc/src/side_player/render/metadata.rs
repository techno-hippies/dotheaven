use super::*;
use crate::pages::Page;
use crate::shell::app_sidebar::NavChannel;

const SIDE_PLAYER_METADATA_WIDTH: f32 = 360.0;

pub(super) fn render_track_metadata(
    track_name: String,
    artist: String,
    album: Option<String>,
    library_view: Entity<library::LibraryView>,
    nav_channel: Entity<NavChannel>,
) -> impl IntoElement {
    let artist_link_entity = library_view.clone();
    let album_link_entity = library_view;
    let artist_nav_entity = nav_channel.clone();
    let album_nav_entity = nav_channel;
    let artist_name_for_artist_link = artist.clone();
    let artist_name_for_album_link = artist.clone();
    let side_artist_hover_group: SharedString = "side-player-artist-link-group".into();
    let side_album_hover_group: SharedString = "side-player-album-link-group".into();

    div()
        .v_flex()
        .w(px(SIDE_PLAYER_METADATA_WIDTH))
        .min_w_0()
        .gap_1()
        .child(
            div()
                .w_full()
                .min_w_0()
                .overflow_hidden()
                .truncate()
                .text_lg()
                .text_color(hsla(0., 0., 0.98, 1.))
                .font_weight(FontWeight::SEMIBOLD)
                .child(track_name),
        )
        .child(
            div()
                .w_full()
                .v_flex()
                .gap_1()
                .min_w_0()
                .child(
                    div()
                        .id("side-player-artist-link")
                        .w_full()
                        .min_w_0()
                        .overflow_hidden()
                        .group(side_artist_hover_group.clone())
                        .text_sm()
                        .cursor_pointer()
                        .on_click(move |_, _, cx| {
                            let _ = artist_link_entity.update(cx, |lib, cx| {
                                lib.open_artist_page(artist_name_for_artist_link.clone(), cx);
                            });
                            artist_nav_entity.update(cx, |ch, cx| {
                                ch.target = Some(Page::MusicLibrary);
                                cx.notify();
                            });
                        })
                        .child(
                            div()
                                .truncate()
                                .text_color(hsla(0., 0., 0.64, 1.))
                                .group_hover(side_artist_hover_group, |s| {
                                    s.text_color(hsla(0., 0., 0.78, 1.))
                                        .text_decoration_2()
                                        .text_decoration_color(hsla(0., 0., 0.78, 1.))
                                })
                                .child(artist),
                        ),
                )
                .when_some(album, |el: Div, album_name: String| {
                    let album_name_for_click = album_name.clone();
                    el.child(
                        div()
                            .id("side-player-album-link")
                            .w_full()
                            .min_w_0()
                            .overflow_hidden()
                            .group(side_album_hover_group.clone())
                            .text_sm()
                            .cursor_pointer()
                            .on_click(move |_, _, cx| {
                                let _ = album_link_entity.update(cx, |lib, cx| {
                                    lib.open_album_page(
                                        artist_name_for_album_link.clone(),
                                        album_name_for_click.clone(),
                                        cx,
                                    );
                                });
                                album_nav_entity.update(cx, |ch, cx| {
                                    ch.target = Some(Page::MusicLibrary);
                                    cx.notify();
                                });
                            })
                            .child(
                                div()
                                    .truncate()
                                    .text_color(hsla(0., 0., 0.64, 1.))
                                    .group_hover(side_album_hover_group, |s| {
                                        s.text_color(hsla(0., 0., 0.78, 1.))
                                            .text_decoration_2()
                                            .text_decoration_color(hsla(0., 0., 0.78, 1.))
                                    })
                                    .child(album_name),
                            ),
                    )
                }),
        )
}
