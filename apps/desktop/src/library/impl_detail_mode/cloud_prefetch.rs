use super::*;

impl LibraryView {
    pub(in crate::library) fn prefetch_artist_cloud_stats(&mut self, cx: &mut Context<Self>) {
        let artist = match &self.detail_route {
            LibraryDetailRoute::Artist { artist } => artist.clone(),
            _ => return,
        };
        let artist_key = normalize_lookup_key(&artist);
        if self.artist_cloud_stats_key.as_deref() == Some(artist_key.as_str())
            && self.artist_cloud_stats.is_some()
        {
            self.detail_loading = false;
            self.detail_error = None;
            return;
        }

        self.artist_cloud_stats_key = Some(artist_key);
        self.artist_cloud_stats = None;
        self.detail_loading = true;
        self.detail_error = None;
        self.detail_fetch_seq = self.detail_fetch_seq.wrapping_add(1);
        let request_seq = self.detail_fetch_seq;
        let artist_for_fetch = artist.clone();
        let tracks_snapshot = self.tracks.clone();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                fetch_artist_cloud_stats(&artist_for_fetch, tracks_snapshot.as_ref())
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                if request_seq != this.detail_fetch_seq {
                    return;
                }
                this.detail_loading = false;
                match result {
                    Ok(stats) => {
                        this.artist_cloud_stats = Some(stats);
                        this.detail_error = None;
                    }
                    Err(err) => {
                        this.artist_cloud_stats = None;
                        this.detail_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::library) fn prefetch_album_cloud_stats(&mut self, cx: &mut Context<Self>) {
        let (artist, album) = match &self.detail_route {
            LibraryDetailRoute::Album { artist, album } => (artist.clone(), album.clone()),
            _ => return,
        };
        let album_key = format!(
            "{}::{}",
            normalize_lookup_key(&artist),
            normalize_lookup_key(&album)
        );
        if self.album_cloud_stats_key.as_deref() == Some(album_key.as_str())
            && self.album_cloud_stats.is_some()
        {
            self.detail_loading = false;
            self.detail_error = None;
            return;
        }

        self.album_cloud_stats_key = Some(album_key);
        self.album_cloud_stats = None;
        self.detail_loading = true;
        self.detail_error = None;
        self.detail_fetch_seq = self.detail_fetch_seq.wrapping_add(1);
        let request_seq = self.detail_fetch_seq;
        let artist_for_fetch = artist.clone();
        let album_for_fetch = album.clone();
        let tracks_snapshot = self.tracks.clone();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                fetch_album_cloud_stats(
                    &artist_for_fetch,
                    &album_for_fetch,
                    tracks_snapshot.as_ref(),
                )
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                if request_seq != this.detail_fetch_seq {
                    return;
                }
                this.detail_loading = false;
                match result {
                    Ok(stats) => {
                        this.album_cloud_stats = Some(stats);
                        this.detail_error = None;
                    }
                    Err(err) => {
                        this.album_cloud_stats = None;
                        this.detail_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
