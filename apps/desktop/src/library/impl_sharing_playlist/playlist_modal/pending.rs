use super::*;

impl LibraryView {
    pub(super) fn remove_pending_playlist_mutation_if_stale(&mut self, now_ms: i64) {
        self.pending_playlist_mutations.retain(|mutation| {
            mutation
                .created_at_ms
                .saturating_add(PLAYLIST_PENDING_STALE_AFTER_MS)
                > now_ms
        });
    }

    pub(in crate::library) fn record_deleted_playlist_tombstone(
        &mut self,
        playlist_id: &str,
        now_ms: i64,
    ) {
        let playlist_id = playlist_id.trim().to_lowercase();
        if playlist_id.is_empty() {
            return;
        }
        self.deleted_playlist_tombstones.insert(playlist_id, now_ms);
    }

    fn prune_deleted_playlist_tombstones(&mut self, now_ms: i64) {
        if self.deleted_playlist_tombstones.is_empty() {
            return;
        }
        self.deleted_playlist_tombstones.retain(|_, deleted_at_ms| {
            deleted_at_ms.saturating_add(PLAYLIST_DELETE_TOMBSTONE_AFTER_MS) > now_ms
        });
    }

    fn is_pending_playlist_confirmed(
        pending: &PendingPlaylistMutation,
        playlists: &[PlaylistSummary],
    ) -> bool {
        playlists.iter().any(|playlist| {
            playlist.id.eq_ignore_ascii_case(&pending.playlist_id)
                && playlist.track_count >= pending.optimistic_track_count
        })
    }

    pub(in crate::library) fn merge_pending_playlist_rows(
        &mut self,
        playlists: Vec<PlaylistSummary>,
        now_ms: i64,
    ) -> Vec<PlaylistSummary> {
        self.prune_deleted_playlist_tombstones(now_ms);
        self.remove_pending_playlist_mutation_if_stale(now_ms);
        let incoming_count = playlists.len();
        let mut merged = playlists;
        let mut pending_rows = Vec::<PlaylistSummary>::new();
        let mut pending_mutations = Vec::<PendingPlaylistMutation>::new();

        for mutation in self.pending_playlist_mutations.iter() {
            if Self::is_pending_playlist_confirmed(mutation, &merged) {
                continue;
            }

            if let Some(existing) = merged
                .iter_mut()
                .find(|playlist| playlist.id.eq_ignore_ascii_case(&mutation.playlist_id))
            {
                existing.track_count = existing.track_count.max(mutation.optimistic_track_count);
                if existing.name.trim().is_empty() {
                    existing.name = mutation.playlist_name.clone();
                }
            } else {
                pending_rows.push(PlaylistSummary {
                    id: mutation.playlist_id.clone(),
                    name: mutation.playlist_name.clone(),
                    cover_cid: None,
                    visibility: 2,
                    track_count: mutation.optimistic_track_count,
                });
            }
            pending_mutations.push(mutation.clone());
        }

        merged.extend(pending_rows);
        self.pending_playlist_mutations = pending_mutations;

        if !self.deleted_playlist_tombstones.is_empty() {
            let before = merged.len();
            merged.retain(|playlist| {
                let deleted_at_ms = self.deleted_playlist_tombstones.get(&playlist.id);
                match deleted_at_ms {
                    Some(deleted_at_ms) => {
                        deleted_at_ms.saturating_add(PLAYLIST_DELETE_TOMBSTONE_AFTER_MS) <= now_ms
                    }
                    None => true,
                }
            });
            let removed = before.saturating_sub(merged.len());
            if removed > 0 {
                log::info!(
                    "[Library] filtered deleted playlist tombstones: removed={}, merged={}",
                    removed,
                    merged.len()
                );
            }
        }

        log::debug!(
            "[Library] merged playlist rows: incoming={}, merged={}, activePending={}",
            incoming_count,
            merged.len(),
            self.pending_playlist_mutations.len()
        );

        merged
    }

    pub(in crate::library) fn refresh_local_playlists_with_pending(&mut self, now_ms: i64) {
        let merged = self.merge_pending_playlist_rows(self.sidebar_playlists.clone(), now_ms);
        self.sidebar_playlists = merged.clone();
        self.playlist_modal_playlists = merged;

        if let Some(selected_id) = self.playlist_modal_selected_playlist_id.as_deref() {
            let selected_exists = self
                .playlist_modal_playlists
                .iter()
                .any(|playlist| playlist.id.eq_ignore_ascii_case(selected_id));
            if !selected_exists {
                self.playlist_modal_selected_playlist_id = self
                    .playlist_modal_playlists
                    .first()
                    .map(|playlist| playlist.id.clone());
            }
        }
    }

    pub(in crate::library) fn record_pending_playlist_mutation(
        &mut self,
        playlist_id: &str,
        playlist_name: &str,
        kind: PendingPlaylistMutationKind,
        optimistic_track_count: usize,
        now_ms: i64,
    ) {
        let playlist_id = playlist_id.trim().to_lowercase();
        let playlist_name = playlist_name.trim();
        if playlist_id.is_empty() || playlist_name.is_empty() {
            return;
        }

        self.remove_pending_playlist_mutation_if_stale(now_ms);
        if let Some(existing) = self
            .pending_playlist_mutations
            .iter_mut()
            .find(|existing| existing.playlist_id.eq_ignore_ascii_case(&playlist_id))
        {
            existing.playlist_name = playlist_name.to_string();
            existing.kind = kind;
            existing.created_at_ms = now_ms;
            match existing.kind {
                PendingPlaylistMutationKind::Create => {
                    existing.optimistic_track_count = optimistic_track_count;
                }
                PendingPlaylistMutationKind::AddTrack => {
                    existing.optimistic_track_count =
                        existing.optimistic_track_count.max(optimistic_track_count);
                }
            }
            log::info!(
                "[Library] updated pending playlist mutation: kind={:?}, id={}, name=\"{}\", optimisticTrackCount={}",
                existing.kind,
                abbreviate_for_status(&existing.playlist_id),
                existing.playlist_name,
                existing.optimistic_track_count
            );
            return;
        }

        self.pending_playlist_mutations
            .push(PendingPlaylistMutation {
                playlist_id,
                playlist_name: playlist_name.to_string(),
                kind,
                optimistic_track_count,
                created_at_ms: now_ms,
            });
        if let Some(new_pending) = self.pending_playlist_mutations.last() {
            log::info!(
                "[Library] added pending playlist mutation: kind={:?}, id={}, name=\"{}\", optimisticTrackCount={}, pendingMutations={}",
                new_pending.kind,
                abbreviate_for_status(&new_pending.playlist_id),
                new_pending.playlist_name,
                new_pending.optimistic_track_count,
                self.pending_playlist_mutations.len()
            );
        }
    }

    pub(in crate::library) fn remove_pending_playlist_mutation(&mut self, playlist_id: &str) {
        let playlist_id = playlist_id.trim().to_lowercase();
        if playlist_id.is_empty() {
            return;
        }
        let before = self.pending_playlist_mutations.len();
        self.pending_playlist_mutations
            .retain(|mutation| !mutation.playlist_id.eq_ignore_ascii_case(&playlist_id));
        let removed = before.saturating_sub(self.pending_playlist_mutations.len());
        if removed > 0 {
            log::info!(
                "[Library] removed pending playlist mutation: id={}, removed={}, pendingMutations={}",
                abbreviate_for_status(&playlist_id),
                removed,
                self.pending_playlist_mutations.len()
            );
        }
    }
}
