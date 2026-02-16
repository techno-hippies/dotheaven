use super::*;

impl Render for LibraryView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.mode == LibraryMode::SharedWithMe {
            let entity = cx.entity().clone();
            return render_shared_with_me_page(
                self.shared_records.clone(),
                self.shared_play_busy,
                self.shared_track_list_scroll_handle.clone(),
                entity,
                cx,
            )
            .into_any_element();
        }

        let container = div()
            .id("library-root")
            .v_flex()
            .flex_1()
            .size_full()
            .overflow_hidden();

        // No folder selected — empty state
        if self.folder.is_none() && !self.loading {
            return container
                .items_center()
                .justify_center()
                .child(
                    div()
                        .v_flex()
                        .items_center()
                        .gap_4()
                        .child(
                            gpui::svg()
                                .path("icons/music-notes.svg")
                                .size(px(64.))
                                .text_color(TEXT_DIM()),
                        )
                        .child(
                            div()
                                .text_xl()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(TEXT_PRIMARY())
                                .child("Your Library"),
                        )
                        .child(
                            div()
                                .text_color(TEXT_MUTED())
                                .child("Select a folder to start playing your music"),
                        )
                        .child(
                            div()
                                .id("browse-btn")
                                .h_flex()
                                .items_center()
                                .gap_2()
                                .px_5()
                                .py(px(10.))
                                .rounded_full()
                                .bg(ACCENT_BLUE())
                                .cursor_pointer()
                                .on_click(cx.listener(|this, _, _window, cx| {
                                    this.browse_folder(cx);
                                }))
                                .child(
                                    gpui::svg()
                                        .path("icons/folder-open.svg")
                                        .size(px(18.))
                                        .text_color(hsla(0., 0., 0.09, 1.)),
                                )
                                .child(
                                    div()
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(hsla(0., 0., 0.09, 1.))
                                        .child("Choose Folder"),
                                ),
                        ),
                )
                .into_any_element();
        }

        if let Some(err) = &self.error {
            return container
                .items_center()
                .justify_center()
                .child(
                    div()
                        .v_flex()
                        .items_center()
                        .gap_2()
                        .child(div().text_color(TEXT_MUTED()).child("Error"))
                        .child(div().text_xs().text_color(TEXT_DIM()).child(err.clone())),
                )
                .into_any_element();
        }

        let detail_route = self.detail_route.clone();
        if !matches!(detail_route, LibraryDetailRoute::Root) {
            return container
                .child(render_library_detail_page(
                    detail_route,
                    self.tracks.clone(),
                    self.sidebar_playlists.clone(),
                    self.playlist_detail_tracks.clone(),
                    self.active_track_path.clone(),
                    self.upload_busy,
                    self.detail_loading,
                    self.detail_error.clone(),
                    self.playlist_cover_update_busy,
                    self.playlist_cover_update_playlist_id.clone(),
                    self.playlist_cover_update_optimistic_path.clone(),
                    self.playlist_cover_update_error.clone(),
                    self.artist_cloud_stats.clone(),
                    self.album_cloud_stats.clone(),
                    self.artist_detail_track_list_scroll_handle.clone(),
                    self.album_detail_track_list_scroll_handle.clone(),
                    self.playlist_detail_track_list_scroll_handle.clone(),
                    cx.entity().clone(),
                    cx,
                ))
                .when(self.playlist_modal_open, |el| {
                    el.child(self.render_playlist_modal(cx))
                })
                .when(self.share_modal_open, |el| {
                    el.child(self.render_share_modal(cx))
                })
                .when(self.playlist_share_modal_open, |el| {
                    el.child(self.render_playlist_share_modal(cx))
                })
                .when(self.delete_playlist_modal_open, |el| {
                    el.child(self.render_delete_playlist_modal(cx))
                })
                .into_any_element();
        }

        let folder_display = self
            .folder
            .as_deref()
            .and_then(|f| f.rsplit('/').next())
            .unwrap_or("Library")
            .to_string();

        let count = self.total_count;
        let loaded = self.tracks.len();
        let scanning = self.scanning;
        let scan_progress = self.scan_progress.clone();
        let loading = self.loading;
        let active_track_path = self.active_track_path.clone();
        let total_rows = self.filtered_indices.len();
        let upload_busy = self.upload_busy;
        let storage_balance = self.storage_balance.clone();
        let storage_monthly = self.storage_monthly.clone();
        let storage_days = self.storage_days;
        let storage_loading = self.storage_loading;
        let add_funds_busy = self.add_funds_busy;
        let sort_state = self.sort_state;
        let search_query = self.search_query.clone();
        let filtered_count = self.filtered_indices.len();
        let track_list_scroll_handle = self.track_list_scroll_handle.clone();

        // Clone snapshots + entity handle for the list closure
        let tracks_snapshot = self.tracks.clone();
        let filtered_indices_snapshot = self.filtered_indices.clone();
        let entity = cx.entity().clone();

        container
            // Hero header
            .child(render_hero(
                &folder_display,
                count,
                loaded,
                scanning,
                loading,
                scan_progress.as_ref(),
                storage_balance.as_deref(),
                storage_monthly.as_deref(),
                storage_days,
                storage_loading,
                add_funds_busy,
                cx,
            ))
            .child(div().px_6().py_2().child(render_library_search_bar(
                &self.library_search_input_state,
                &search_query,
                filtered_count,
                loaded,
            )))
            // Column header (fixed at top of track area)
            .child(render_table_header(sort_state, true, false, cx))
            .child(if total_rows == 0 && !search_query.trim().is_empty() {
                div()
                    .flex_1()
                    .v_flex()
                    .items_center()
                    .justify_center()
                    .gap_2()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(TEXT_PRIMARY())
                            .child("No matching tracks"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED())
                            .child("Try a different title, artist, or album."),
                    )
                    .into_any_element()
            } else {
                // Virtualized track rows
                div()
                    .relative()
                    .flex_1()
                    .w_full()
                    .child(
                        uniform_list("track-list", total_rows, move |range, _window, _cx| {
                            let mut items = Vec::new();
                            for row in range {
                                let Some(track_index) = filtered_indices_snapshot.get(row).copied()
                                else {
                                    continue;
                                };
                                if let Some(track) = tracks_snapshot.get(track_index) {
                                    let is_active = active_track_path.as_deref()
                                        == Some(track.file_path.as_str());
                                    let ent = entity.clone();
                                    items.push(render_track_row(
                                        track,
                                        track_index,
                                        row + 1,
                                        filtered_indices_snapshot.clone(),
                                        is_active,
                                        upload_busy,
                                        ent,
                                        false,
                                    ));
                                }
                            }
                            items
                        })
                        .size_full()
                        .track_scroll(track_list_scroll_handle.clone()),
                    )
                    .vertical_scrollbar(&track_list_scroll_handle)
                    .into_any_element()
            })
            .when(self.playlist_modal_open, |el| {
                el.child(self.render_playlist_modal(cx))
            })
            .when(self.share_modal_open, |el| {
                el.child(self.render_share_modal(cx))
            })
            .when(self.playlist_share_modal_open, |el| {
                el.child(self.render_playlist_share_modal(cx))
            })
            .when(self.delete_playlist_modal_open, |el| {
                el.child(self.render_delete_playlist_modal(cx))
            })
            .into_any_element()
    }
}
