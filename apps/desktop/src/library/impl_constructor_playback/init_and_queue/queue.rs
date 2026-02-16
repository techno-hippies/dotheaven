use super::*;

impl LibraryView {
    pub(in crate::library) fn add_track_to_queue(
        &mut self,
        track_index: usize,
        cx: &mut Context<Self>,
    ) {
        let Some(track) = self.tracks.get(track_index).cloned() else {
            self.set_status_message("Track not found; queue unchanged.", cx);
            return;
        };

        self.playback_queue_paths.push(track.file_path.clone());
        let added_queue_pos = self.playback_queue_paths.len().saturating_sub(1);
        self.set_status_message(format!("Added \"{}\" to queue.", track.title), cx);

        let playback_state = self.audio.read_state();
        let has_active_track =
            self.active_track_path.is_some() || self.active_shared_playback.is_some();
        let is_idle = !playback_state.playing && !has_active_track;
        if is_idle {
            self.play_track(track_index, cx);
            self.active_queue_pos = Some(added_queue_pos);
            self.set_status_message(format!("Queued and started \"{}\".", track.title), cx);
        }

        cx.notify();
    }

    pub(in crate::library) fn play_track(&mut self, index: usize, _cx: &mut Context<Self>) {
        if let Some(track) = self.tracks.get(index) {
            log::info!(
                "[Playback] play_track: index={}, title='{}', artist='{}', file='{}'",
                index,
                track.title,
                track.artist,
                track.file_path
            );
            self.audio.play(
                &track.file_path,
                None,
                Some(track.artist.clone()),
                track.cover_path.clone(),
            );
            self.active_shared_playback = None;
            self.active_track_path = Some(track.file_path.clone());
            self.active_queue_pos = self
                .playback_queue_paths
                .iter()
                .position(|path| path == &track.file_path);
            self.track_started_at_sec = Some(now_epoch_sec());
        } else {
            log::warn!(
                "[Playback] play_track ignored: index={} is out of bounds (tracks={})",
                index,
                self.tracks.len()
            );
        }
    }

    pub(in crate::library) fn play_track_in_visible_context(
        &mut self,
        track_index: usize,
        visible_indices: &[usize],
        cx: &mut Context<Self>,
    ) {
        log::info!(
            "[Playback] play_track_in_visible_context: trackIndex={}, visibleCount={}",
            track_index,
            visible_indices.len(),
        );
        if visible_indices.is_empty() {
            self.playback_queue_paths.clear();
            self.active_queue_pos = None;
            log::info!("[Playback] queue cleared (no visible context); playing single track");
            self.play_track(track_index, cx);
            return;
        }

        let mut queue_paths = Vec::with_capacity(visible_indices.len());
        for &idx in visible_indices {
            if let Some(track) = self.tracks.get(idx) {
                queue_paths.push(track.file_path.clone());
            }
        }
        self.playback_queue_paths = queue_paths;
        log::info!(
            "[Playback] queue prepared from visible context: queueSize={}",
            self.playback_queue_paths.len()
        );
        self.play_track(track_index, cx);
    }

    pub(in crate::library) fn advance_queue(
        &mut self,
        direction: i32,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.playback_queue_paths.is_empty() {
            return false;
        }
        if self.active_queue_pos.is_none() {
            self.active_queue_pos = self.active_track_path.as_ref().and_then(|path| {
                self.playback_queue_paths
                    .iter()
                    .position(|queue_path| queue_path == path)
            });
        }

        let len = self.playback_queue_paths.len() as isize;
        let mut cursor = match self.active_queue_pos {
            Some(pos) => pos as isize + direction as isize,
            None => return false,
        };

        while cursor >= 0 && cursor < len {
            let queue_pos = cursor as usize;
            let queue_path = self.playback_queue_paths[queue_pos].clone();
            if let Some(track_index) = self
                .tracks
                .iter()
                .position(|track| track.file_path == queue_path)
            {
                self.active_queue_pos = Some(queue_pos);
                self.play_track(track_index, cx);
                return true;
            }
            cursor += direction as isize;
        }

        false
    }

    pub(in crate::library) fn active_track_index(&self) -> Option<usize> {
        let active_path = self.active_track_path.as_deref()?;
        self.tracks
            .iter()
            .position(|track| track.file_path == active_path)
    }
}
