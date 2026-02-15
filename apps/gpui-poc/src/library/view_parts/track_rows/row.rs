use super::album_art::render_album_art_thumbnail;
use super::*;

// Track row — used by uniform_list, receives entity handle for click dispatch.
pub(in crate::library) fn render_track_row(
    track: &TrackRow,
    track_index: usize,
    row_number: usize,
    playback_context_indices: Arc<Vec<usize>>,
    is_active: bool,
    upload_busy: bool,
    entity: Entity<LibraryView>,
    detail_layout: bool,
) -> impl IntoElement {
    let row_id = ElementId::Name(format!("track-{}", track_index).into());
    let group_name: SharedString = format!("track-row-{}", track_index).into();
    let title_color = if is_active { ACCENT_BLUE } else { TEXT_PRIMARY };
    let row_bg = if is_active {
        BG_HIGHLIGHT
    } else {
        Hsla {
            h: 0.,
            s: 0.,
            l: 0.,
            a: 0.,
        }
    };

    let g = group_name.clone();
    let g2 = group_name.clone();

    let play_entity = entity.clone();
    let queue_entity = entity.clone();
    let playlist_entity = entity.clone();
    let artist_entity_for_menu = entity.clone();
    let album_entity_for_menu = entity.clone();
    let share_entity = entity.clone();
    let upload_entity = entity;

    let artist_name = track.artist.clone();
    let album_name = track.album.clone();
    let artist_name_for_artist_menu = artist_name.clone();
    let artist_name_for_album_menu = artist_name.clone();
    let album_name_for_album_menu = album_name.clone();
    let upload_track = track.clone();
    let save_forever_track = track.clone();
    let copy_content_id_track = track.clone();
    let copy_piece_cid_track = track.clone();
    let copy_gateway_url_track = track.clone();
    let (artist_width, album_min_width) = if detail_layout {
        (DETAIL_ARTIST_COLUMN_WIDTH, DETAIL_ALBUM_COLUMN_WIDTH)
    } else {
        (ARTIST_COLUMN_WIDTH, ALBUM_COLUMN_WIDTH)
    };

    div()
        .id(row_id)
        .group(group_name.clone())
        .h_flex()
        .w_full()
        .h(px(ROW_HEIGHT))
        .px_4()
        .items_center()
        .cursor_pointer()
        .bg(row_bg)
        .hover(|s| s.bg(BG_HOVER))
        .on_click(move |ev, _window, cx| {
            // Double-click to play.
            let is_double = match ev {
                ClickEvent::Mouse(m) => m.down.click_count == 2,
                _ => false,
            };
            if is_double {
                play_entity.update(cx, |this, cx| {
                    this.play_track_in_visible_context(
                        track_index,
                        playback_context_indices.as_ref(),
                        cx,
                    );
                    cx.notify();
                });
            }
        })
        // # column — shows track number normally, play icon on hover.
        .child(
            div()
                .w(px(48.))
                .h_flex()
                .items_center()
                .relative()
                .child(if is_active {
                    // Active track always shows play icon.
                    gpui::svg()
                        .path("icons/play-fill.svg")
                        .size(px(14.))
                        .text_color(ACCENT_BLUE)
                        .into_any_element()
                } else {
                    // Show number at rest, play icon on hover.
                    div()
                        .h_flex()
                        .items_center()
                        .w_full()
                        .child(
                            // Track number — visible at rest, hidden on hover.
                            div()
                                .text_sm()
                                .text_color(TEXT_DIM)
                                .group_hover(g.clone(), |s| s.opacity(0.))
                                .child(format!("{}", row_number)),
                        )
                        .child(
                            // Play icon — hidden at rest, visible on hover.
                            div()
                                .absolute()
                                .left_0()
                                .opacity(0.)
                                .group_hover(g, |s| s.opacity(1.))
                                .child(
                                    gpui::svg()
                                        .path("icons/play-fill.svg")
                                        .size(px(14.))
                                        .text_color(TEXT_PRIMARY),
                                ),
                        )
                        .into_any_element()
                }),
        )
        // Title + album art.
        .child(
            div()
                .h_flex()
                .w(px(TITLE_COLUMN_WIDTH))
                .flex_none()
                .min_w_0()
                .gap_3()
                .items_center()
                .overflow_hidden()
                .child(render_album_art_thumbnail(&track.cover_path))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .text_sm()
                        .truncate()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(title_color)
                        .child(track.title.clone()),
                ),
        )
        // Artist.
        .child(
            div()
                .w(px(artist_width))
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_SECONDARY)
                .truncate()
                .child(track.artist.clone()),
        )
        // Album.
        .child(
            div()
                .pl_4()
                .min_w(px(album_min_width))
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_MUTED)
                .truncate()
                .child(track.album.clone()),
        )
        // Storage status icon.
        .child(render_storage_status_icon(track.storage_status))
        // Duration + three-dot menu.
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                // Duration.
                .child(
                    div()
                        .w(px(52.))
                        .text_sm()
                        .text_color(if is_active { TEXT_PRIMARY } else { TEXT_MUTED })
                        .h_flex()
                        .justify_end()
                        .child(track.duration.clone()),
                )
                // Three-dot menu button — hidden at rest, visible on hover.
                .child(track_row_overflow_menu(
                    ("dots", track_index),
                    g2,
                    false,
                    move |menu, _window, _cx| {
                        let mut menu = menu
                            .item(PopupMenuItem::new("Add to playlist").on_click({
                                let playlist_entity = playlist_entity.clone();
                                move |_, _, cx| {
                                    let _ = playlist_entity.update(cx, |this, cx| {
                                        this.open_playlist_modal(track_index, cx);
                                    });
                                }
                            }))
                            .item(PopupMenuItem::new("Add to queue").on_click({
                                let queue_entity = queue_entity.clone();
                                move |_, _, cx| {
                                    let _ = queue_entity.update(cx, |this, cx| {
                                        this.add_track_to_queue(track_index, cx);
                                    });
                                }
                            }))
                            .item(PopupMenuItem::new("Go to artist").on_click({
                                let artist_entity = artist_entity_for_menu.clone();
                                let artist_name = artist_name_for_artist_menu.clone();
                                move |_, _, cx| {
                                    let _ = artist_entity.update(cx, |this, cx| {
                                        this.open_artist_page(artist_name.clone(), cx);
                                    });
                                }
                            }))
                            .item(PopupMenuItem::new("Go to album").on_click({
                                let album_entity = album_entity_for_menu.clone();
                                let artist_name = artist_name_for_album_menu.clone();
                                let album_name = album_name_for_album_menu.clone();
                                move |_, _, cx| {
                                    let _ = album_entity.update(cx, |this, cx| {
                                        this.open_album_page(
                                            artist_name.clone(),
                                            album_name.clone(),
                                            cx,
                                        );
                                    });
                                }
                            }))
                            .item(PopupMenuItem::new("Share with wallet...").on_click({
                                let share_entity = share_entity.clone();
                                move |_, _, cx| {
                                    let _ = share_entity.update(cx, |this, cx| {
                                        this.open_share_modal(track_index, cx);
                                    });
                                }
                            }));

                        let is_permanent =
                            matches!(save_forever_track.storage_status, StorageStatus::Permanent);
                        let can_copy_storage_refs =
                            !matches!(save_forever_track.storage_status, StorageStatus::Local);
                        if !is_permanent || can_copy_storage_refs {
                            menu = menu.separator();
                        }

                        if !is_permanent {
                            menu = menu.item(
                                PopupMenuItem::new("Upload")
                                    .disabled(upload_busy)
                                    .on_click({
                                        let upload_entity = upload_entity.clone();
                                        let upload_track = upload_track.clone();
                                        move |_, _, cx| {
                                            let _ = upload_entity.update(cx, |this, cx| {
                                                this.encrypt_upload_track(upload_track.clone(), cx);
                                            });
                                        }
                                    }),
                            );

                            menu = menu.item(
                                PopupMenuItem::new("Save Forever")
                                    .disabled(upload_busy)
                                    .on_click({
                                        let save_forever_entity = upload_entity.clone();
                                        let save_forever_track = save_forever_track.clone();
                                        move |_, _, cx| {
                                            let _ = save_forever_entity.update(cx, |this, cx| {
                                                this.save_track_forever(
                                                    save_forever_track.clone(),
                                                    cx,
                                                );
                                            });
                                        }
                                    }),
                            );
                        }

                        if can_copy_storage_refs {
                            menu = menu.item(PopupMenuItem::new("Copy Content ID").on_click({
                                let copy_entity = upload_entity.clone();
                                let copy_track = copy_content_id_track.clone();
                                move |_, _, cx| {
                                    let _ = copy_entity.update(cx, |this, cx| {
                                        this.copy_track_content_id(copy_track.clone(), cx);
                                    });
                                }
                            }));
                            menu = menu.item(PopupMenuItem::new("Copy Piece CID").on_click({
                                let copy_entity = upload_entity.clone();
                                let copy_track = copy_piece_cid_track.clone();
                                move |_, _, cx| {
                                    let _ = copy_entity.update(cx, |this, cx| {
                                        this.copy_track_piece_cid(copy_track.clone(), cx);
                                    });
                                }
                            }));
                            menu = menu.item(PopupMenuItem::new("Copy Gateway URL").on_click({
                                let copy_entity = upload_entity.clone();
                                let copy_track = copy_gateway_url_track.clone();
                                move |_, _, cx| {
                                    let _ = copy_entity.update(cx, |this, cx| {
                                        this.copy_track_gateway_url(copy_track.clone(), cx);
                                    });
                                }
                            }));
                        }

                        menu
                    },
                )),
        )
}
