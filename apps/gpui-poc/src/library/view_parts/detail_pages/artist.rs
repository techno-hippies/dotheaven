use super::*;
use crate::ui::tooltip_for_text;
use gpui_component::StyledExt;

pub(in crate::library) fn render_artist_detail_page(
    artist: String,
    tracks: Arc<Vec<TrackRow>>,
    active_track_path: Option<String>,
    upload_busy: bool,
    _detail_loading: bool,
    _detail_error: Option<String>,
    cloud_stats: Option<ArtistCloudStats>,
    track_list_scroll_handle: UniformListScrollHandle,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let artist_key = normalize_lookup_key(&artist);
    let cloud_title = cloud_stats
        .as_ref()
        .map(|stats| sanitize_detail_value(stats.title.clone(), "Unknown Artist"));
    let artist_display = cloud_title.unwrap_or_else(|| artist.clone());
    let mut artist_indices: Vec<usize> = tracks
        .iter()
        .enumerate()
        .filter(|(_, track)| normalize_lookup_key(&track.artist) == artist_key)
        .map(|(index, _)| index)
        .collect();

    let track_scrobbles = cloud_stats
        .as_ref()
        .map(|stats| stats.track_scrobbles.clone())
        .unwrap_or_default();
    artist_indices.sort_unstable_by(|a, b| {
        let scrobble_cmp = track_scrobbles
            .get(&tracks[*b].id)
            .unwrap_or(&0)
            .cmp(track_scrobbles.get(&tracks[*a].id).unwrap_or(&0));
        if scrobble_cmp != Ordering::Equal {
            return scrobble_cmp;
        }
        cmp_case_insensitive(&tracks[*a].album, &tracks[*b].album)
            .then_with(|| cmp_case_insensitive(&tracks[*a].title, &tracks[*b].title))
            .then_with(|| tracks[*a].file_path.cmp(&tracks[*b].file_path))
    });

    let album_count = artist_indices
        .iter()
        .filter_map(|index| {
            let album = tracks[*index].album.trim();
            if album.is_empty() {
                None
            } else {
                Some(normalize_lookup_key(album))
            }
        })
        .collect::<HashSet<_>>()
        .len();
    let total_duration_sec: u64 = artist_indices
        .iter()
        .map(|index| parse_duration_seconds(&tracks[*index].duration))
        .sum();
    let subtitle = if artist_indices.is_empty() {
        "No tracks by this artist in your library yet.".to_string()
    } else {
        format!(
            "{} tracks • {} albums • {} total",
            artist_indices.len(),
            album_count,
            format_compact_duration(total_duration_sec)
        )
    };

    let cloud_artist_cover_path = cloud_stats
        .as_ref()
        .and_then(|stats| stats.image_path.clone());
    let local_artist_cover_path = artist_indices.iter().find_map(|index| {
        tracks
            .get(*index)
            .and_then(|track| track.cover_path.as_ref())
            .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
            .cloned()
    });
    let hero_cover_path = cloud_artist_cover_path.or(local_artist_cover_path);

    let row_count = artist_indices.len();
    let row_indices = Arc::new(artist_indices);
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
            "Artist",
            "artist-detail-back",
            entity.clone(),
        ))
        .child(div().px_6().pt_5().pb_4().child(render_artist_header_row(
            &artist_display,
            &subtitle,
            &hero_cover_path,
            &artist_display,
            entity.clone(),
        )))
        .child(if row_count == 0 {
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
                        .child("Scan or rescan your folder to populate artist pages."),
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
                        .child("Popular"),
                )
                .child(render_table_header(None, false, true, cx))
                .child(
                    div()
                        .relative()
                        .flex_1()
                        .w_full()
                        .child(
                            uniform_list(
                                "artist-detail-track-list",
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

fn render_artist_header_row(
    title: &str,
    subtitle: &str,
    cover_path: &Option<String>,
    artist_name: &str,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    div()
        .h_flex()
        .items_end()
        .gap_6()
        .child(render_artist_cover_art(cover_path))
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
                        .text_color(TEXT_DIM)
                        .child("ARTIST"),
                )
                .child(
                    div()
                        .text_3xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .truncate()
                        .child(title.to_string()),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_SECONDARY)
                        .child(subtitle.to_string()),
                )
                .child(render_artist_link_icon_row(artist_name, entity)),
        )
}

fn render_artist_cover_art(cover_path: &Option<String>) -> impl IntoElement {
    let cover = div()
        .size(px(220.))
        .rounded(px(10.))
        .overflow_hidden()
        .bg(BG_ELEVATED)
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
                        .text_color(TEXT_DIM),
                ),
        ),
    }
}

fn render_artist_link_icon_row(artist_name: &str, entity: Entity<LibraryView>) -> impl IntoElement {
    let encoded = urlencoding::encode(artist_name).into_owned();
    let musicbrainz_url =
        format!("https://musicbrainz.org/search?query={encoded}&type=artist&method=indexed");
    let discogs_url = format!("https://www.discogs.com/search/?q={encoded}&type=artist");
    let web_search_url = format!("https://duckduckgo.com/?q={encoded}%20artist");

    div()
        .h_flex()
        .items_center()
        .gap_2()
        .child(render_artist_link_icon(
            "icons/globe.svg",
            "artist-link-globe",
            "Open MusicBrainz artist search",
            &musicbrainz_url,
            entity.clone(),
        ))
        .child(render_artist_link_icon(
            "icons/database.svg",
            "artist-link-db",
            "Open Discogs artist search",
            &discogs_url,
            entity.clone(),
        ))
        .child(render_artist_link_icon(
            "icons/share-fat.svg",
            "artist-link-share",
            "Search artist on the web",
            &web_search_url,
            entity,
        ))
}

fn render_artist_link_icon(
    icon_path: &'static str,
    id: &'static str,
    tooltip_text: &'static str,
    url: &str,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    let url_for_open = url.to_string();
    div()
        .id(id)
        .size(px(26.))
        .rounded_full()
        .bg(hsla(0., 0., 0., 0.35))
        .h_flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .hover(|s| s.bg(hsla(0., 0., 0., 0.6)))
        .tooltip(tooltip_for_text(tooltip_text))
        .on_click(move |_, _, cx| {
            if let Err(err) = open::that(&url_for_open) {
                let _ = entity.update(cx, |this, cx| {
                    this.set_status_message(format!("Failed to open link: {err}"), cx);
                });
            }
        })
        .child(
            gpui::svg()
                .path(icon_path)
                .size(px(14.))
                .text_color(TEXT_SECONDARY),
        )
}
