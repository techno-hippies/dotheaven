use super::*;

pub(in crate::library) fn render_album_detail_page(
    artist: String,
    album: String,
    tracks: Arc<Vec<TrackRow>>,
    active_track_path: Option<String>,
    upload_busy: bool,
    _detail_loading: bool,
    _detail_error: Option<String>,
    cloud_stats: Option<AlbumCloudStats>,
    track_list_scroll_handle: UniformListScrollHandle,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let artist_display = cloud_stats
        .as_ref()
        .map(|stats| sanitize_detail_value(stats.artist.clone(), "Unknown Artist"))
        .unwrap_or_else(|| sanitize_detail_value(artist.clone(), "Unknown Artist"));
    let album_display = cloud_stats
        .as_ref()
        .map(|stats| sanitize_detail_value(stats.title.clone(), "Unknown Album"))
        .unwrap_or_else(|| sanitize_detail_value(album.clone(), "Unknown Album"));
    let artist_key = normalize_lookup_key(&artist_display);
    let album_key = normalize_lookup_key(&album);
    let mut album_indices: Vec<usize> = tracks
        .iter()
        .enumerate()
        .filter(|(_, track)| {
            normalize_lookup_key(&track.artist) == artist_key
                && normalize_lookup_key(&track.album) == album_key
        })
        .map(|(index, _)| index)
        .collect();

    let track_scrobbles = cloud_stats
        .as_ref()
        .map(|stats| stats.track_scrobbles.clone())
        .unwrap_or_default();
    album_indices.sort_unstable_by(|a, b| {
        let scrobble_cmp = track_scrobbles
            .get(&tracks[*b].id)
            .unwrap_or(&0)
            .cmp(track_scrobbles.get(&tracks[*a].id).unwrap_or(&0));
        if scrobble_cmp != Ordering::Equal {
            return scrobble_cmp;
        }
        cmp_case_insensitive(&tracks[*a].title, &tracks[*b].title)
            .then_with(|| tracks[*a].file_path.cmp(&tracks[*b].file_path))
    });

    let total_duration_sec: u64 = album_indices
        .iter()
        .map(|index| parse_duration_seconds(&tracks[*index].duration))
        .sum();
    let subtitle = if album_indices.is_empty() {
        format!("by {}", artist_display)
    } else {
        format!(
            "by {} • {} tracks • {} total",
            artist_display,
            album_indices.len(),
            format_compact_duration(total_duration_sec)
        )
    };

    let local_album_cover_path = album_indices.iter().find_map(|index| {
        tracks
            .get(*index)
            .and_then(|track| track.cover_path.as_ref())
            .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
            .cloned()
    });
    let hero_cover_path = local_album_cover_path.or_else(|| {
        cloud_stats
            .as_ref()
            .and_then(|stats| stats.image_path.clone())
    });

    let row_count = album_indices.len();
    let row_indices = Arc::new(album_indices);
    let tracks_snapshot = tracks.clone();
    let row_indices_for_list = row_indices.clone();
    let active_track_path_for_list = active_track_path.clone();
    let entity_for_list = entity.clone();

    div()
        .id("library-root")
        .v_flex()
        .flex_1()
        .size_full()
        .overflow_hidden()
        .child(render_back_bar(
            "Album",
            "album-detail-back",
            entity.clone(),
        ))
        .child(div().px_6().pt_5().pb_4().child(render_album_header_row(
            &album_display,
            &subtitle,
            &hero_cover_path,
        )))
        .child(if row_count == 0 {
            div()
                .flex_1()
                .v_flex()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY()).child("No tracks found"))
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_MUTED())
                        .child("This album has no tracks in your local library."),
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
                        .text_color(TEXT_PRIMARY())
                        .child("Top tracks"),
                )
                .child(render_table_header(None, false, true, cx))
                .child(
                    div()
                        .relative()
                        .flex_1()
                        .w_full()
                        .child(
                            uniform_list(
                                "album-detail-track-list",
                                row_count,
                                move |range, _window, _cx| {
                                    let mut items = Vec::new();
                                    for row in range {
                                        let Some(track_index) =
                                            row_indices_for_list.get(row).copied()
                                        else {
                                            continue;
                                        };
                                        if let Some(track) = tracks_snapshot.get(track_index) {
                                            let is_active = active_track_path_for_list.as_deref()
                                                == Some(track.file_path.as_str());
                                            items.push(render_track_row(
                                                track,
                                                track_index,
                                                row + 1,
                                                row_indices_for_list.clone(),
                                                is_active,
                                                upload_busy,
                                                entity_for_list.clone(),
                                                true,
                                            ));
                                        }
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

fn render_album_header_row(
    title: &str,
    subtitle: &str,
    cover_path: &Option<String>,
) -> impl IntoElement {
    div()
        .h_flex()
        .items_end()
        .gap_6()
        .child(render_album_cover_art(cover_path))
        .child(
            div()
                .v_flex()
                .gap_2()
                .pb_1()
                .min_w_0()
                .child(
                    div()
                        .text_xs()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_DIM())
                        .child("ALBUM"),
                )
                .child(
                    div()
                        .text_3xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY())
                        .truncate()
                        .child(title.to_string()),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_SECONDARY())
                        .child(subtitle.to_string()),
                ),
        )
}

fn render_album_cover_art(cover_path: &Option<String>) -> impl IntoElement {
    let cover = div()
        .size(px(220.))
        .rounded(px(10.))
        .overflow_hidden()
        .bg(BG_ELEVATED())
        .flex_shrink_0();

    match cover_path {
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => cover.child(
            gpui::img(PathBuf::from(path))
                .size_full()
                .rounded(px(10.))
                .object_fit(ObjectFit::Cover),
        ),
        _ => cover.child(
            div()
                .size(px(220.))
                .flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/vinyl-record.svg")
                        .size(px(72.))
                        .text_color(TEXT_DIM()),
                ),
        ),
    }
}
