use super::*;

impl LibraryView {
    pub(in crate::library) fn refresh_sidebar_playlists(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.sidebar_playlists.clear();
                cx.notify();
                return;
            }
        };
        let owner = auth
            .primary_wallet_address()
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        if owner.is_empty() {
            self.sidebar_playlists.clear();
            cx.notify();
            return;
        }

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let raw = svc.playlist_fetch_user_playlists(&owner, 100)?;
                Ok::<Vec<PlaylistSummary>, String>(parse_playlist_summaries(&raw))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let now_ms = chrono::Utc::now().timestamp_millis();
                match result {
                    Ok(playlists) => {
                        let previous = this.sidebar_playlists.clone();
                        let mut merged = this.merge_pending_playlist_rows(playlists, now_ms);
                        for playlist in &mut merged {
                            if playlist.cover_cid.is_some() {
                                continue;
                            }
                            let preserved = previous
                                .iter()
                                .find(|prev| prev.id.eq_ignore_ascii_case(&playlist.id))
                                .and_then(|prev| prev.cover_cid.clone());
                            if preserved.is_some() {
                                playlist.cover_cid = preserved;
                            }
                        }
                        this.sidebar_playlists = merged;
                        log::info!(
                            "[Library] sidebar playlists refreshed: rows={}, pendingMutations={}",
                            this.sidebar_playlists.len(),
                            this.pending_playlist_mutations.len()
                        );
                    }
                    Err(err) => {
                        log::warn!("[Library] sidebar playlists fetch failed: {}", err);
                        this.refresh_local_playlists_with_pending(now_ms);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
