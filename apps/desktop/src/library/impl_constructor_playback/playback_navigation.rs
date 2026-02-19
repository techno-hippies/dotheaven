use super::storage::format_duration_mmss;
use super::*;

impl LibraryView {
    pub fn check_auto_advance(&mut self, cx: &mut Context<Self>) {
        let state = self.audio.read_state();
        // Track ended: has a path, not playing, and position >= duration
        if state.track_path.is_some() && !state.playing {
            if let Some(dur) = state.duration {
                if state.position >= dur - 0.5 && dur > 0.0 {
                    let played_at_sec = self.track_started_at_sec.unwrap_or_else(now_epoch_sec);
                    if let Some(idx) = self.active_track_index() {
                        if let Some(track) = self.tracks.get(idx).cloned() {
                            self.submit_scrobble_for_track(track, played_at_sec, cx);
                        }

                        if self.advance_queue(1, cx) {
                            cx.notify();
                            return;
                        }

                        let next = idx + 1;
                        if next < self.tracks.len() {
                            log::info!(
                                "[Playback] auto_advance: from_index={} to_index={}",
                                idx,
                                next
                            );
                            self.play_track(next, cx);
                            cx.notify();
                        }
                    } else if let Some(shared) = self.active_shared_playback.take() {
                        let duration_seconds = if dur.is_finite() && dur > 0.0 {
                            dur.round() as u64
                        } else {
                            0
                        };
                        let synthetic_track = TrackRow {
                            id: format!("shared-{}", shared.content_id),
                            title: if shared.title.trim().is_empty() {
                                "Shared Track".to_string()
                            } else {
                                shared.title
                            },
                            artist: if shared.artist.trim().is_empty() {
                                "Unknown Artist".to_string()
                            } else {
                                shared.artist
                            },
                            album: shared.album,
                            duration: format_duration_mmss(duration_seconds),
                            file_path: shared.local_path,
                            mbid: None,
                            ip_id: None,
                            cover_path: None,
                            storage_status: StorageStatus::default(),
                        };
                        self.submit_scrobble_for_track(synthetic_track, played_at_sec, cx);
                    }
                }
            }
        }
    }

    pub fn play_next(&mut self, cx: &mut Context<Self>) {
        if self.advance_queue(1, cx) {
            cx.notify();
            return;
        }
        if let Some(idx) = self.active_track_index() {
            let next = idx + 1;
            if next < self.tracks.len() {
                self.play_track(next, cx);
                cx.notify();
            }
        }
    }

    pub fn play_prev(&mut self, cx: &mut Context<Self>) {
        if self.advance_queue(-1, cx) {
            cx.notify();
            return;
        }
        if let Some(idx) = self.active_track_index() {
            if idx > 0 {
                self.play_track(idx - 1, cx);
                cx.notify();
            }
        }
    }

    pub(in crate::library) fn play_all(&mut self, cx: &mut Context<Self>) {
        let queue_snapshot = self.filtered_indices.clone();
        if let Some(first_index) = queue_snapshot.first().copied() {
            self.play_track_in_visible_context(first_index, queue_snapshot.as_ref(), cx);
        }
    }
}
