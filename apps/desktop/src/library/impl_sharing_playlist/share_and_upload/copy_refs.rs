use super::*;

impl LibraryView {
    pub(in crate::library) fn copy_track_content_id(
        &mut self,
        track: TrackRow,
        cx: &mut Context<Self>,
    ) {
        self.copy_track_storage_ref(track, "Content ID", |record| record.content_id.clone(), cx);
    }

    pub(in crate::library) fn copy_track_piece_cid(
        &mut self,
        track: TrackRow,
        cx: &mut Context<Self>,
    ) {
        self.copy_track_storage_ref(track, "Piece CID", |record| record.piece_cid.clone(), cx);
    }

    pub(in crate::library) fn copy_track_gateway_url(
        &mut self,
        track: TrackRow,
        cx: &mut Context<Self>,
    ) {
        self.copy_track_storage_ref(
            track,
            "Gateway URL",
            |record| record.gateway_url.clone(),
            cx,
        );
    }

    fn copy_track_storage_ref(
        &mut self,
        track: TrackRow,
        label: &str,
        extract: impl Fn(&UploadedTrackRecord) -> String,
        cx: &mut Context<Self>,
    ) {
        let Some(record) = self.uploaded_index.get(&track.file_path) else {
            log::warn!(
                "[Library] copy {} unavailable: title='{}' file_path='{}' (no uploaded record)",
                label,
                track.title,
                track.file_path
            );
            self.set_status_message(
                format!(
                    "No saved storage reference found for \"{}\" yet.",
                    track.title
                ),
                cx,
            );
            return;
        };

        let value = extract(record).trim().to_string();
        if value.is_empty() || value == "n/a" {
            log::warn!(
                "[Library] copy {} unavailable: title='{}' file_path='{}' (empty value)",
                label,
                track.title,
                track.file_path
            );
            self.set_status_message(
                format!("{} is unavailable for \"{}\".", label, track.title),
                cx,
            );
            return;
        }

        cx.write_to_clipboard(ClipboardItem::new_string(value.clone()));
        log::info!(
            "[Library] copied {} for '{}': {}",
            label,
            track.title,
            value
        );
        self.set_status_message(format!("Copied {} for \"{}\".", label, track.title), cx);
    }
}
