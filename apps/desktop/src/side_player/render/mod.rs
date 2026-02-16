use super::*;

mod art;
mod controls;
mod lyrics;
mod metadata;
mod timeline;

fn sanitize_display_text(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "..." || trimmed == "•" {
        return None;
    }
    Some(trimmed.to_string())
}

impl Render for SidePlayerView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let playback = self.audio.read_state();
        let duration = playback.duration.unwrap_or(0.0);

        self.last_playback_duration = duration;
        self.last_playback_playing = playback.playing;

        if let Some(target) = self.pending_seek_position {
            let reached_target = (playback.position - target).abs() <= 0.35;
            let timed_out = self
                .pending_seek_started_at
                .map(|started| started.elapsed() > std::time::Duration::from_millis(1200))
                .unwrap_or(true);
            if reached_target || timed_out || duration <= 0.0 {
                self.pending_seek_position = None;
                self.pending_seek_started_at = None;
            }
        }

        let position = if self.seek_scrub_in_progress {
            self.seek_scrub_fraction
                .map(|fraction| (duration * fraction as f64).clamp(0.0, duration))
                .unwrap_or(playback.position)
        } else if let Some(target) = self.pending_seek_position {
            target.clamp(0.0, duration)
        } else {
            playback.position
        };

        let playback_fraction = if duration > 0.0 {
            (position / duration).clamp(0.0, 1.0) as f32
        } else {
            0.0
        };

        if !self.seek_scrub_in_progress {
            let current_fraction = self.seek_slider.read(cx).value().end();
            if (current_fraction - playback_fraction).abs() > 0.001 {
                self.seek_slider.update(cx, |slider, slider_cx| {
                    slider.set_value(playback_fraction, window, slider_cx);
                });
            }
            self.seek_scrub_fraction = None;
        }

        let fallback_track_name = playback
            .track_path
            .as_ref()
            .and_then(|p| {
                std::path::Path::new(p)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "No track playing".to_string());
        let fallback_artist = playback
            .artist
            .clone()
            .unwrap_or_else(|| "Unknown artist".to_string());

        let (raw_track_name, raw_artist, raw_album) = match (
            self.cached_track_title.clone(),
            self.cached_track_artist.clone(),
            self.cached_track_album.clone(),
        ) {
            (Some(title), Some(artist_name), album_name) => (
                title,
                artist_name,
                album_name.filter(|album| !album.trim().is_empty()),
            ),
            _ => (fallback_track_name, fallback_artist, None),
        };
        let track_name =
            sanitize_display_text(raw_track_name).unwrap_or_else(|| "Unknown track".to_string());
        let artist =
            sanitize_display_text(raw_artist).unwrap_or_else(|| "Unknown artist".to_string());
        let album = raw_album.and_then(sanitize_display_text);

        let active_lyric_idx = match &self.lyrics_state {
            LyricsFetchState::Ready(lyrics) if !lyrics.synced_lines.is_empty() => {
                lyrics::active_synced_index(&lyrics.synced_lines, position)
            }
            _ => None,
        };
        if self.lyrics_initial_scroll_retries > 0 {
            if matches!(self.lyrics_state, LyricsFetchState::Ready(_)) {
                // Force top position while lyrics are first appearing.
                self.lyrics_scroll_handle.set_offset(point(px(0.), px(0.)));
                self.lyrics_scroll_handle.scroll_to_top_of_item(0);
                self.lyrics_initial_scroll_retries =
                    self.lyrics_initial_scroll_retries.saturating_sub(1);
                if self.lyrics_initial_scroll_retries == 0 {
                    // Avoid an immediate auto-follow jump right after initial placement.
                    self.last_active_lyric_idx = active_lyric_idx;
                }
            }
        } else if active_lyric_idx != self.last_active_lyric_idx {
            if let Some(active_idx) = active_lyric_idx {
                // Keep a bit of context above the active row while auto-following.
                let anchor_idx = active_idx.saturating_sub(4);
                self.lyrics_scroll_handle.scroll_to_top_of_item(anchor_idx);
            }
            self.last_active_lyric_idx = active_lyric_idx;
        }

        div()
            .v_flex()
            .w_full()
            .gap_3()
            .p_5()
            .child(art::render_side_player_art(&playback.cover_path))
            .child(metadata::render_track_metadata(
                track_name,
                artist,
                album,
                self.library_view.clone(),
                self.nav_channel.clone(),
            ))
            .child(timeline::render_seek_timeline(self, cx, position, duration))
            .child(controls::render_transport_controls(
                playback.playing,
                self.audio.clone(),
                self.library_view.clone(),
            ))
            .child(lyrics::render_lyrics_panel(
                &self.lyrics_state,
                position,
                &self.lyrics_scroll_handle,
                active_lyric_idx,
            ))
    }
}
