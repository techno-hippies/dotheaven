use super::*;

impl LibraryView {
    pub(in crate::library) fn remap_pending_playlist_id(
        &mut self,
        old_playlist_id: &str,
        new_playlist_id: &str,
    ) {
        let old_playlist_id = old_playlist_id.trim().to_lowercase();
        let new_playlist_id = new_playlist_id.trim().to_lowercase();
        if old_playlist_id.is_empty()
            || new_playlist_id.is_empty()
            || old_playlist_id == new_playlist_id
        {
            return;
        }

        let old_index = self
            .pending_playlist_mutations
            .iter()
            .position(|mutation| mutation.playlist_id.eq_ignore_ascii_case(&old_playlist_id));
        let new_index = self
            .pending_playlist_mutations
            .iter()
            .position(|mutation| mutation.playlist_id.eq_ignore_ascii_case(&new_playlist_id));

        let Some(old_index) = old_index else {
            return;
        };

        if let Some(new_index) = new_index {
            if old_index == new_index {
                return;
            }
            let old_mutation = self.pending_playlist_mutations.remove(old_index);
            let existing_index = if old_index < new_index {
                new_index.saturating_sub(1)
            } else {
                new_index
            };
            let existing = self
                .pending_playlist_mutations
                .get_mut(existing_index)
                .expect("index should exist");
            existing.playlist_id = new_playlist_id;
            existing.optimistic_track_count = existing
                .optimistic_track_count
                .max(old_mutation.optimistic_track_count);
            existing.created_at_ms = old_mutation.created_at_ms.max(existing.created_at_ms);
            log::info!(
                "[Library] remapped pending playlist mutation (merged): oldId={}, newId={}, pendingMutations={}",
                abbreviate_for_status(&old_playlist_id),
                abbreviate_for_status(&existing.playlist_id),
                self.pending_playlist_mutations.len()
            );
            return;
        }

        if let Some(mutation) = self
            .pending_playlist_mutations
            .iter_mut()
            .find(|mutation| mutation.playlist_id.eq_ignore_ascii_case(&old_playlist_id))
        {
            mutation.playlist_id = new_playlist_id;
            log::info!(
                "[Library] remapped pending playlist mutation: oldId={}, newId={}",
                abbreviate_for_status(&old_playlist_id),
                abbreviate_for_status(&mutation.playlist_id)
            );
        }
    }

    pub(super) fn remap_playlist_detail_id(
        &mut self,
        old_playlist_id: &str,
        new_playlist_id: &str,
        fallback_playlist_name: &str,
    ) {
        let old_playlist_id = old_playlist_id.trim().to_lowercase();
        let new_playlist_id = new_playlist_id.trim().to_lowercase();
        if old_playlist_id.is_empty()
            || new_playlist_id.is_empty()
            || old_playlist_id == new_playlist_id
        {
            return;
        }

        if let Some(cache_entry) = self.playlist_detail_cache.remove(&old_playlist_id) {
            self.playlist_detail_cache
                .entry(new_playlist_id.clone())
                .or_insert(cache_entry);
        }

        if let LibraryDetailRoute::Playlist {
            playlist_id,
            playlist_name,
        } = &mut self.detail_route
        {
            if playlist_id.eq_ignore_ascii_case(&old_playlist_id) {
                *playlist_id = new_playlist_id.clone();
                if playlist_name.trim().is_empty() {
                    *playlist_name = fallback_playlist_name.to_string();
                }
                if let Some(cache_entry) = self.playlist_detail_cache.get(&new_playlist_id) {
                    self.playlist_detail_tracks = cache_entry.tracks.clone();
                    self.detail_loading = false;
                    self.detail_error = None;
                }
            }
        }

        for route in &mut self.detail_history {
            if let LibraryDetailRoute::Playlist { playlist_id, .. } = route {
                if playlist_id.eq_ignore_ascii_case(&old_playlist_id) {
                    *playlist_id = new_playlist_id.clone();
                }
            }
        }
    }
}
