use super::*;

mod album;
mod artist;
mod playlist;

pub(in crate::library) fn render_library_detail_page(
    route: LibraryDetailRoute,
    tracks: Arc<Vec<TrackRow>>,
    playlists: Vec<PlaylistSummary>,
    playlist_tracks: Vec<PlaylistDetailTrack>,
    active_track_path: Option<String>,
    upload_busy: bool,
    detail_loading: bool,
    detail_error: Option<String>,
    playlist_cover_update_busy: bool,
    playlist_cover_update_playlist_id: Option<String>,
    playlist_cover_update_optimistic_path: Option<String>,
    playlist_cover_update_error: Option<String>,
    artist_cloud_stats: Option<ArtistCloudStats>,
    album_cloud_stats: Option<AlbumCloudStats>,
    artist_track_list_scroll_handle: UniformListScrollHandle,
    album_track_list_scroll_handle: UniformListScrollHandle,
    playlist_track_list_scroll_handle: UniformListScrollHandle,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    match route {
        LibraryDetailRoute::Root => div().into_any_element(),
        LibraryDetailRoute::Artist { artist } => render_artist_detail_page(
            artist,
            tracks,
            active_track_path,
            upload_busy,
            detail_loading,
            detail_error,
            artist_cloud_stats,
            artist_track_list_scroll_handle,
            entity,
            cx,
        )
        .into_any_element(),
        LibraryDetailRoute::Album { artist, album } => render_album_detail_page(
            artist,
            album,
            tracks,
            active_track_path,
            upload_busy,
            detail_loading,
            detail_error,
            album_cloud_stats,
            album_track_list_scroll_handle,
            entity,
            cx,
        )
        .into_any_element(),
        LibraryDetailRoute::Playlist {
            playlist_name,
            playlist_id,
        } => {
            let cover_update_matches = playlist_cover_update_playlist_id
                .as_deref()
                .is_some_and(|id| id.eq_ignore_ascii_case(&playlist_id));
            let cover_update_busy_for_page = playlist_cover_update_busy && cover_update_matches;
            let optimistic_cover_path = if cover_update_matches {
                playlist_cover_update_optimistic_path
            } else {
                None
            };
            let cover_update_error = if cover_update_matches {
                playlist_cover_update_error
            } else {
                None
            };

            render_playlist_detail_page(
                playlist_id,
                playlist_name,
                playlists,
                playlist_tracks,
                tracks,
                active_track_path,
                upload_busy,
                cover_update_busy_for_page,
                optimistic_cover_path,
                cover_update_error,
                detail_loading,
                detail_error,
                playlist_track_list_scroll_handle,
                entity,
                cx,
            )
        }
        .into_any_element(),
    }
}

fn render_back_bar(
    page_title: &str,
    back_button_id: &'static str,
    entity: Entity<LibraryView>,
) -> Div {
    div()
        .w_full()
        .h(px(72.))
        .px_6()
        .h_flex()
        .items_center()
        .gap_4()
        .border_b_1()
        .border_color(BORDER_SUBTLE())
        .child(
            div()
                .id(back_button_id)
                .size(px(36.))
                .rounded(px(8.))
                .cursor_pointer()
                .flex()
                .items_center()
                .justify_center()
                .hover(|s| s.bg(BG_HIGHLIGHT()))
                .on_click(move |_, _, cx| {
                    let _ = entity.update(cx, |this, cx| {
                        this.navigate_back_from_detail(cx);
                    });
                })
                .child(
                    gpui::svg()
                        .path("icons/arrow-left.svg")
                        .size(px(24.))
                        .text_color(TEXT_PRIMARY()),
                ),
        )
        .child(
            div()
                .text_lg()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(TEXT_PRIMARY())
                .child(page_title.to_string()),
        )
}

pub(in crate::library) use album::*;
pub(in crate::library) use artist::*;
pub(in crate::library) use playlist::*;
