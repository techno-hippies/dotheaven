use super::*;

impl LibraryView {
    pub(in crate::library) fn sync_search_query_from_input(&mut self, cx: &mut Context<Self>) {
        self.search_query = self.library_search_input_state.read(cx).value().to_string();
    }

    pub(in crate::library) fn apply_sort_to_indices(&self, indices: &mut Vec<usize>) {
        let Some(sort_state) = self.sort_state else {
            return;
        };
        let tracks = &self.tracks;

        indices.sort_unstable_by(|a, b| {
            let track_a = &tracks[*a];
            let track_b = &tracks[*b];
            let primary = match sort_state.field {
                LibrarySortField::Title => cmp_case_insensitive(&track_a.title, &track_b.title),
                LibrarySortField::Artist => cmp_case_insensitive(&track_a.artist, &track_b.artist),
                LibrarySortField::Album => cmp_case_insensitive(&track_a.album, &track_b.album),
                LibrarySortField::Duration => parse_duration_seconds(&track_a.duration)
                    .cmp(&parse_duration_seconds(&track_b.duration)),
                LibrarySortField::Storage => {
                    let rank = |status: StorageStatus| match status {
                        StorageStatus::Permanent => 0_u8,
                        StorageStatus::Uploaded => 1_u8,
                        StorageStatus::Local => 2_u8,
                    };
                    rank(track_a.storage_status).cmp(&rank(track_b.storage_status))
                }
            };
            let tie_break = cmp_case_insensitive(&track_a.title, &track_b.title)
                .then_with(|| cmp_case_insensitive(&track_a.artist, &track_b.artist))
                .then_with(|| cmp_case_insensitive(&track_a.album, &track_b.album))
                .then_with(|| track_a.file_path.cmp(&track_b.file_path));
            let cmp = if primary == Ordering::Equal {
                tie_break
            } else {
                primary
            };

            match sort_state.direction {
                LibrarySortDirection::Asc => cmp,
                LibrarySortDirection::Desc => cmp.reverse(),
            }
        });
    }

    pub(in crate::library) fn cycle_sort(
        &mut self,
        field: LibrarySortField,
        cx: &mut Context<Self>,
    ) {
        self.sort_state = match self.sort_state {
            Some(state) if state.field == field && state.direction == LibrarySortDirection::Asc => {
                Some(LibrarySortState {
                    field,
                    direction: LibrarySortDirection::Desc,
                })
            }
            Some(state)
                if state.field == field && state.direction == LibrarySortDirection::Desc =>
            {
                None
            }
            _ => Some(LibrarySortState {
                field,
                direction: LibrarySortDirection::Asc,
            }),
        };
        self.recompute_filtered_indices();
        cx.notify();
    }

    pub(in crate::library) fn recompute_filtered_indices(&mut self) {
        let query = self.search_query.trim().to_ascii_lowercase();
        if query.is_empty() {
            let mut indices: Vec<usize> = (0..self.tracks.len()).collect();
            self.apply_sort_to_indices(&mut indices);
            self.filtered_indices = Arc::new(indices);
            return;
        }

        let mut indices = Vec::with_capacity(self.tracks.len());
        for (index, track) in self.tracks.iter().enumerate() {
            if track.title.to_ascii_lowercase().contains(&query)
                || track.artist.to_ascii_lowercase().contains(&query)
                || track.album.to_ascii_lowercase().contains(&query)
            {
                indices.push(index);
            }
        }
        self.apply_sort_to_indices(&mut indices);
        self.filtered_indices = Arc::new(indices);
    }

    pub(in crate::library) fn schedule_search_rebuild(&mut self, cx: &mut Context<Self>) {
        self.sync_search_query_from_input(cx);
        self.search_debounce_seq = self.search_debounce_seq.wrapping_add(1);
        let seq = self.search_debounce_seq;

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            smol::Timer::after(std::time::Duration::from_millis(150)).await;
            let _ = this.update(cx, |this, cx| {
                if this.search_debounce_seq != seq {
                    return;
                }
                this.recompute_filtered_indices();
                cx.notify();
            });
        })
        .detach();
    }
}
