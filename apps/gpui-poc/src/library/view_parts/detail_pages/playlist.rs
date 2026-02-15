use super::*;

mod cover;
mod header;
mod rows;

use header::render_playlist_header_row;
use rows::{render_playlist_detail_placeholder_row, render_playlist_detail_track_row};

pub(in crate::library) fn render_playlist_detail_page(
    playlist_id: String,
    playlist_name: String,
    playlist_summaries: Vec<PlaylistSummary>,
    playlist_tracks: Vec<PlaylistDetailTrack>,
    tracks: Arc<Vec<TrackRow>>,
    active_track_path: Option<String>,
    upload_busy: bool,
    cover_update_busy: bool,
    optimistic_cover_path: Option<String>,
    cover_update_error: Option<String>,
    detail_loading: bool,
    detail_error: Option<String>,
    track_list_scroll_handle: UniformListScrollHandle,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let row_count = playlist_tracks.len();
    let playlist_tracks_snapshot = Arc::new(playlist_tracks);
    let playlist_summary = playlist_summaries
        .iter()
        .find(|playlist| playlist.id.eq_ignore_ascii_case(&playlist_id))
        .cloned();
    let playlist_cover_cid = playlist_summary
        .as_ref()
        .and_then(|playlist| playlist.cover_cid.clone());
    let expected_track_count = playlist_summary
        .as_ref()
        .map(|playlist| playlist.track_count)
        .unwrap_or(row_count);
    let display_row_count = if detail_loading {
        row_count.max(expected_track_count)
    } else {
        row_count
    };
    let placeholder_count = display_row_count.saturating_sub(row_count);
    let placeholders_before_tracks = detail_loading && row_count == 1 && placeholder_count > 0;
    let mut fallback_cover_paths = Vec::<String>::new();
    let mut seen_cover_paths = HashSet::<String>::new();
    for playlist_track in playlist_tracks_snapshot.iter() {
        let Some(track_index) = playlist_track.local_track_index else {
            continue;
        };
        let Some(local_track) = tracks.get(track_index) else {
            continue;
        };
        let Some(raw_cover_path) = local_track.cover_path.as_deref() else {
            continue;
        };
        let trimmed_cover_path = raw_cover_path.trim();
        if trimmed_cover_path.is_empty() || !std::path::Path::new(trimmed_cover_path).exists() {
            continue;
        }
        let normalized = trimmed_cover_path.to_ascii_lowercase();
        if seen_cover_paths.insert(normalized) {
            fallback_cover_paths.push(trimmed_cover_path.to_string());
            if fallback_cover_paths.len() >= 4 {
                break;
            }
        }
    }
    let playable_indices = Arc::new(
        playlist_tracks_snapshot
            .iter()
            .filter_map(|track| track.local_track_index)
            .collect::<Vec<_>>(),
    );
    let tracks_snapshot = tracks.clone();
    let active_track_path_for_list = active_track_path.clone();
    let entity_for_list = entity.clone();
    let delete_entity = entity.clone();
    let playlist_id_for_delete = playlist_id.clone();
    let playlist_name_for_delete = playlist_name.clone();
    let cover_entity = entity.clone();
    let playlist_id_for_cover = playlist_id.clone();
    let playlist_name_for_cover = playlist_name.clone();
    let cover_visibility = playlist_summary
        .as_ref()
        .map(|pl| pl.visibility)
        .unwrap_or(0);
    let can_delete = playlist_summary.is_some()
        && playlist_id_for_delete
            .trim()
            .to_lowercase()
            .starts_with("0x")
        && !playlist_id_for_delete
            .trim()
            .to_lowercase()
            .starts_with("optimistic:");
    let subtitle = if detail_loading {
        "Loading playlist tracks...".to_string()
    } else if row_count == 0 {
        "No tracks in this playlist.".to_string()
    } else {
        format!("{row_count} tracks")
    };
    let cover_update_busy = cover_update_busy;
    let optimistic_cover_path_for_header = optimistic_cover_path.clone();
    let cover_btn_label = if cover_update_busy {
        "Saving..."
    } else {
        "Change Cover"
    };

    div()
        .id("library-root")
        .v_flex()
        .flex_1()
        .size_full()
        .overflow_hidden()
        .child(div().px_6().pt_5().pb_4().child(render_playlist_header_row(
            &playlist_name,
            &subtitle,
            playlist_cover_cid.as_deref(),
            &fallback_cover_paths,
            optimistic_cover_path_for_header.as_deref(),
            cover_update_busy,
        )))
        .child(
            div()
                .px_6()
                .pb_3()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .id("playlist-cover-btn")
                        .h_flex()
                        .items_center()
                        .gap(px(6.))
                        .px_4()
                        .py(px(8.))
                        .rounded_full()
                        .bg(hsla(0., 0., 1., 0.12))
                        .cursor_pointer()
                        .hover(|s| s.bg(hsla(0., 0., 1., 0.18)))
                        .when(!can_delete || cover_update_busy, |el| {
                            el.opacity(0.4).cursor_default()
                        })
                        .on_click(move |_, _, cx| {
                            if !can_delete || cover_update_busy {
                                return;
                            }
                            let _ = cover_entity.update(cx, |this, cx| {
                                this.pick_and_update_playlist_cover(
                                    playlist_id_for_cover.clone(),
                                    playlist_name_for_cover.clone(),
                                    cover_visibility,
                                    cx,
                                );
                            });
                        })
                        .child(
                            gpui::svg()
                                .path("icons/image.svg")
                                .size(px(20.))
                                .text_color(if cover_update_busy {
                                    TEXT_DIM
                                } else {
                                    TEXT_PRIMARY
                                }),
                        )
                        .child(
                            div()
                                .text_base()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(TEXT_PRIMARY)
                                .child(cover_btn_label),
                        ),
                )
                .child(
                    div()
                        .id("playlist-delete-btn")
                        .h_flex()
                        .items_center()
                        .gap(px(6.))
                        .px_4()
                        .py(px(8.))
                        .rounded_full()
                        .bg(hsla(0., 0., 1., 0.12))
                        .cursor_pointer()
                        .hover(|s| s.bg(hsla(0., 0., 1., 0.18)))
                        .when(!can_delete, |el| el.opacity(0.4).cursor_default())
                        .on_click(move |_, _, cx| {
                            if !can_delete {
                                return;
                            }
                            let _ = delete_entity.update(cx, |this, cx| {
                                this.open_delete_playlist_modal(
                                    playlist_id_for_delete.clone(),
                                    playlist_name_for_delete.clone(),
                                    cx,
                                );
                            });
                        })
                        .child(
                            gpui::svg()
                                .path("icons/x.svg")
                                .size(px(20.))
                                .text_color(hsla(0., 0.7, 0.65, 1.)),
                        )
                        .child(
                            div()
                                .text_base()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(hsla(0., 0.7, 0.65, 1.))
                                .child("Delete"),
                        ),
                ),
        )
        .when_some(cover_update_error, |el, err: String| {
            el.child(
                div()
                    .px_6()
                    .pb_2()
                    .text_sm()
                    .text_color(TEXT_AMBER)
                    .child(err),
            )
        })
        .when_some(detail_error, |el, err: String| {
            el.child(
                div()
                    .px_6()
                    .pb_3()
                    .text_sm()
                    .text_color(TEXT_AMBER)
                    .child(format!(
                        "Playlist load error: {}",
                        summarize_status_error(&err)
                    )),
            )
        })
        .child(if detail_loading && display_row_count == 0 {
            div()
                .flex_1()
                .v_flex()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY).child("Loading tracks..."))
                .into_any_element()
        } else if display_row_count == 0 {
            div()
                .flex_1()
                .v_flex()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY).child("No tracks found"))
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .child("Add tracks from the library menu to populate this playlist."),
                )
                .into_any_element()
        } else {
            div()
                .v_flex()
                .flex_1()
                .child(
                    div()
                        .px_6()
                        .pb_2()
                        .text_lg()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(TEXT_PRIMARY)
                        .child("Tracks"),
                )
                .child(render_table_header(None, false, true, cx))
                .child(
                    div()
                        .relative()
                        .flex_1()
                        .w_full()
                        .child(
                            uniform_list(
                                "playlist-detail-track-list",
                                display_row_count,
                                move |range, _window, _cx| {
                                    let mut items: Vec<AnyElement> = Vec::new();
                                    for row in range {
                                        let (display_index, track) = if placeholders_before_tracks {
                                            if row < placeholder_count {
                                                items.push(
                                                    render_playlist_detail_placeholder_row(row)
                                                        .into_any_element(),
                                                );
                                                continue;
                                            }
                                            let display_index = row;
                                            let real_index = row.saturating_sub(placeholder_count);
                                            (
                                                display_index,
                                                playlist_tracks_snapshot.get(real_index),
                                            )
                                        } else if row >= row_count {
                                            items.push(
                                                render_playlist_detail_placeholder_row(row)
                                                    .into_any_element(),
                                            );
                                            continue;
                                        } else {
                                            (row, playlist_tracks_snapshot.get(row))
                                        };
                                        let Some(track) = track else {
                                            continue;
                                        };

                                        if let Some(track_index) = track.local_track_index {
                                            if let Some(local_track) =
                                                tracks_snapshot.get(track_index)
                                            {
                                                let is_active = active_track_path_for_list
                                                    .as_deref()
                                                    == Some(local_track.file_path.as_str());
                                                items.push(
                                                    render_track_row(
                                                        local_track,
                                                        track_index,
                                                        display_index + 1,
                                                        playable_indices.clone(),
                                                        is_active,
                                                        upload_busy,
                                                        entity_for_list.clone(),
                                                        true,
                                                    )
                                                    .into_any_element(),
                                                );
                                                continue;
                                            }
                                        }

                                        items.push(
                                            render_playlist_detail_track_row(
                                                track,
                                                display_index,
                                                entity_for_list.clone(),
                                            )
                                            .into_any_element(),
                                        );
                                    }
                                    items
                                },
                            )
                            .size_full()
                            .track_scroll(track_list_scroll_handle.clone()),
                        )
                        .vertical_scrollbar(&track_list_scroll_handle),
                )
                .into_any_element()
        })
}
