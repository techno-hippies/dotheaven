use super::*;

impl LibraryView {
    pub(in crate::library) fn set_status_message(
        &mut self,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let message = message.into();
        self.status_message = Some(message.clone());
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_auto("library", message.clone());
        });
        cx.notify();
    }

    pub(in crate::library) fn reset_detail_navigation(&mut self) {
        self.detail_route = LibraryDetailRoute::Root;
        self.detail_history.clear();
        self.playlist_detail_tracks.clear();
        self.detail_loading = false;
        self.detail_error = None;
    }

    pub(in crate::library) fn navigate_to_detail(
        &mut self,
        route: LibraryDetailRoute,
        cx: &mut Context<Self>,
    ) {
        if self.detail_route == route {
            return;
        }
        self.detail_history.push(self.detail_route.clone());
        self.detail_route = route;
        self.detail_error = None;
        cx.notify();
    }

    pub(in crate::library) fn navigate_back_from_detail(&mut self, cx: &mut Context<Self>) {
        self.detail_route = self
            .detail_history
            .pop()
            .unwrap_or(LibraryDetailRoute::Root);
        if matches!(self.detail_route, LibraryDetailRoute::Root) {
            self.detail_loading = false;
            self.detail_error = None;
        } else {
            match &self.detail_route {
                LibraryDetailRoute::Artist { .. } => self.prefetch_artist_cloud_stats(cx),
                LibraryDetailRoute::Album { .. } => self.prefetch_album_cloud_stats(cx),
                LibraryDetailRoute::Playlist { .. } => {}
                LibraryDetailRoute::Root => {}
            }
        }
        cx.notify();
    }

    pub fn open_artist_page(&mut self, artist_name: impl Into<String>, cx: &mut Context<Self>) {
        let artist = sanitize_detail_value(artist_name.into(), "Unknown Artist");
        self.navigate_to_detail(LibraryDetailRoute::Artist { artist }, cx);
        self.prefetch_artist_cloud_stats(cx);
    }

    pub fn open_album_page(
        &mut self,
        artist_name: impl Into<String>,
        album_name: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let artist = sanitize_detail_value(artist_name.into(), "Unknown Artist");
        let album = album_name.into().trim().to_string();
        self.navigate_to_detail(LibraryDetailRoute::Album { artist, album }, cx);
        self.prefetch_album_cloud_stats(cx);
    }
}
