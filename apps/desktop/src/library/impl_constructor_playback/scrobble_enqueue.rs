use super::*;

impl LibraryView {
    pub(super) fn enqueue_scrobble_media_pending(
        &mut self,
        track_id: &str,
        cover_path: Option<&str>,
    ) {
        let Some(db_handle) = self.db.as_ref() else {
            return;
        };
        let cover_path = cover_path.map(str::trim).filter(|v| !v.is_empty());
        let cover_status = if cover_path.is_some() {
            "pending"
        } else {
            "skipped"
        };

        let db = match db_handle.lock() {
            Ok(db) => db,
            Err(err) => {
                log::warn!(
                    "[Scrobble] media enqueue skipped: db lock failed trackId={} err={}",
                    track_id,
                    err
                );
                return;
            }
        };

        if let Err(err) = db.upsert_track_media_state_pending(track_id, cover_path) {
            log::warn!(
                "[Scrobble] media enqueue failed: trackId={} coverStatus={} err={}",
                track_id,
                cover_status,
                err
            );
            return;
        }
        if let Err(err) = db.upsert_track_lyrics_state_pending(track_id) {
            log::warn!(
                "[Scrobble] lyrics enqueue failed: trackId={} lyricsStatus=pending err={}",
                track_id,
                err
            );
            return;
        }

        log::info!(
            "[Scrobble] media enqueue: trackId={} coverStatus={} lyricsStatus=pending",
            track_id,
            cover_status
        );
    }
}
