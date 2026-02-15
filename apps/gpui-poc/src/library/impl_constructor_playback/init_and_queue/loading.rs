use super::*;

impl LibraryView {
    /// Load tracks in pages of PAGE_SIZE to avoid blocking the UI.
    pub(in crate::library) fn load_tracks_paged(
        db: Arc<Mutex<MusicDb>>,
        folder: String,
        cx: &mut Context<Self>,
    ) {
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            // Get total count first.
            let db2 = db.clone();
            let folder2 = folder.clone();
            let count = smol::unblock(move || {
                let db = db2.lock().map_err(|e| format!("lock: {e}"))?;
                db.get_track_count(&folder2)
            })
            .await;

            let count = match count {
                Ok(c) => c,
                Err(e) => {
                    let _ = this.update(cx, |this, cx| {
                        this.error = Some(e);
                        this.loading = false;
                        cx.notify();
                    });
                    return;
                }
            };

            // Load first page immediately so UI is responsive.
            let mut all_tracks: Vec<TrackRow> = Vec::with_capacity(count as usize);
            let mut offset: i64 = 0;
            let mut published_initial_page = false;

            while offset < count {
                let db3 = db.clone();
                let folder3 = folder.clone();
                let off = offset;
                let page = smol::unblock(move || {
                    let db = db3.lock().map_err(|e| format!("lock: {e}"))?;
                    db.get_tracks(&folder3, PAGE_SIZE, off)
                })
                .await;

                match page {
                    Ok(tracks) => {
                        all_tracks.extend(tracks);
                    }
                    Err(e) => {
                        let _ = this.update(cx, |this, cx| {
                            this.error = Some(e);
                            this.loading = false;
                            cx.notify();
                        });
                        return;
                    }
                }

                offset += PAGE_SIZE;

                // Publish only the first page eagerly; avoid repeatedly cloning the full buffer.
                if !published_initial_page && !all_tracks.is_empty() {
                    published_initial_page = true;
                    let first_batch = all_tracks.clone();
                    let _ = this.update(cx, |this, cx| {
                        this.tracks = Arc::new(first_batch);
                        this.refresh_uploaded_index_from_auth();
                        this.recompute_filtered_indices();
                        this.total_count = count;
                        this.loading = offset < count;
                        cx.notify();
                    });
                }
            }

            // Final update.
            let _ = this.update(cx, |this, cx| {
                this.tracks = Arc::new(all_tracks);
                this.refresh_uploaded_index_from_auth();
                this.recompute_filtered_indices();
                this.total_count = count;
                this.loading = false;
                cx.notify();
            });
        })
        .detach();
    }
}
