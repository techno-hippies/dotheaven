use super::*;

impl LibraryView {
    pub(in crate::library) fn pick_playlist_modal_cover_image(&mut self, cx: &mut Context<Self>) {
        if self.playlist_modal_submitting {
            return;
        }

        self.playlist_modal_error = None;
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let picked = smol::unblock(|| {
                rfd::FileDialog::new()
                    .set_title("Choose Playlist Cover")
                    .add_filter("Image", &["jpg", "jpeg", "png", "webp", "bmp"])
                    .pick_file()
            })
            .await;

            let Some(path) = picked else {
                return;
            };
            let selected = path.to_string_lossy().to_string();
            let validation_error = playlist_cover_image_input_from_path(Some(selected.as_str()))
                .err()
                .map(|err| summarize_status_error(&err));

            let _ = this.update(cx, |this, cx| {
                if let Some(err) = validation_error {
                    this.playlist_modal_error = Some(err);
                } else {
                    this.playlist_modal_cover_image_path = Some(selected);
                    this.playlist_modal_error = None;
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::library) fn clear_playlist_modal_cover_image(&mut self, cx: &mut Context<Self>) {
        self.playlist_modal_cover_image_path = None;
        self.playlist_modal_error = None;
        cx.notify();
    }
}
