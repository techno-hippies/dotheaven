use super::*;

pub(in crate::library) fn render_shared_with_me_page(
    shared_records: Vec<SharedGrantRecord>,
    shared_play_busy: bool,
    track_list_scroll_handle: UniformListScrollHandle,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let total_rows = shared_records.len();
    div()
        .id("library-root")
        .v_flex()
        .flex_1()
        .size_full()
        .overflow_hidden()
        .child(
            div()
                .w_full()
                .px_6()
                .pt_8()
                .pb_6()
                .bg(HERO_BG)
                .v_flex()
                .gap_4()
                .child(
                    div()
                        .text_2xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .child("Shared With Me"),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.85, 1.))
                        .child(format!("{} shared tracks", total_rows)),
                )
                .child(div().text_sm().text_color(hsla(0., 0., 0.85, 1.)).child(
                    if shared_play_busy {
                        "Decrypting track..."
                    } else {
                        "Click a track to decrypt and play it."
                    },
                ))
                .child(hero_button(
                    "refresh-shared",
                    "icons/sort-ascending.svg",
                    "Refresh",
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.refresh_shared_records_for_auth(cx);
                        cx.notify();
                    }),
                )),
        )
        .child(if total_rows == 0 {
            div()
                .v_flex()
                .flex_1()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY).child("No shared tracks yet"))
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .child("Ask another wallet to share a track with your PKP address."),
                )
                .into_any_element()
        } else {
            div()
                .v_flex()
                .flex_1()
                .child(render_table_header(None, false, false, cx))
                .child(
                    div()
                        .relative()
                        .flex_1()
                        .w_full()
                        .child(
                            uniform_list(
                                "shared-track-list",
                                total_rows,
                                move |range, _window, _cx| {
                                    let mut items = Vec::new();
                                    for i in range {
                                        if let Some(record) = shared_records.get(i) {
                                            items.push(render_shared_record_row(
                                                record,
                                                i,
                                                shared_play_busy,
                                                entity.clone(),
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

fn render_shared_record_row(
    record: &SharedGrantRecord,
    index: usize,
    shared_play_busy: bool,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    let group_name: SharedString = format!("shared-track-row-{index}").into();
    let play_entity = entity.clone();
    let download_entity = entity;

    div()
        .id(ElementId::Name(format!("shared-track-{}", index).into()))
        .group(group_name.clone())
        .h_flex()
        .w_full()
        .h(px(ROW_HEIGHT))
        .px_4()
        .items_center()
        .cursor_pointer()
        .hover(|s| s.bg(BG_HOVER))
        .on_click(move |ev, _window, cx| {
            let button = match ev {
                ClickEvent::Mouse(m) => m.down.button,
                _ => MouseButton::Left,
            };
            if button == MouseButton::Right {
                return;
            }
            if shared_play_busy {
                return;
            }
            let _ = play_entity.update(cx, |this, cx| {
                this.play_shared_record(index, cx);
            });
        })
        .bg(if index % 2 == 0 {
            Hsla {
                h: 0.,
                s: 0.,
                l: 0.,
                a: 0.,
            }
        } else {
            BG_HIGHLIGHT
        })
        .child(
            div()
                .w(px(48.))
                .text_sm()
                .text_color(TEXT_DIM)
                .child(format!("{}", index + 1)),
        )
        .child(
            div()
                .h_flex()
                .flex_1()
                .min_w_0()
                .gap_3()
                .items_center()
                .child(
                    div()
                        .size(px(40.))
                        .rounded(px(6.))
                        .bg(BG_ELEVATED)
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/music-note.svg")
                                .size(px(16.))
                                .text_color(TEXT_DIM),
                        ),
                )
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_PRIMARY)
                        .truncate()
                        .child(record.title.clone()),
                ),
        )
        .child(
            div()
                .w(px(ARTIST_COLUMN_WIDTH))
                .pl_4()
                .mr_3()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_SECONDARY)
                .truncate()
                .child(if record.artist.trim().is_empty() {
                    "Unknown Artist".to_string()
                } else {
                    record.artist.clone()
                }),
        )
        .child(
            div()
                .w(px(ALBUM_COLUMN_WIDTH))
                .pl_4()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_MUTED)
                .truncate()
                .child(if record.album.trim().is_empty() {
                    "Shared".to_string()
                } else {
                    record.album.clone()
                }),
        )
        .child(
            div()
                .w(px(36.))
                .h_flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/hash.svg")
                        .size(px(14.))
                        .text_color(TEXT_DIM),
                ),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(52.))
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .h_flex()
                        .justify_end()
                        .child("--:--"),
                )
                .child(track_row_overflow_menu(
                    ("shared-dots", index),
                    group_name,
                    false,
                    move |menu, _window, _cx| {
                        menu.item(
                            PopupMenuItem::new("Decrypt & Download to Library")
                                .disabled(shared_play_busy)
                                .on_click({
                                    let download_entity = download_entity.clone();
                                    move |_, _, cx| {
                                        let _ = download_entity.update(cx, |this, cx| {
                                            this.decrypt_download_shared_record(index, cx);
                                        });
                                    }
                                }),
                        )
                    },
                )),
        )
}
