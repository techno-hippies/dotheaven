use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::slider::{Slider, SliderEvent, SliderState};
use gpui_component::StyledExt;

use crate::audio::AudioHandle;
use crate::library;
use crate::lyrics::{resolve_lyrics_for_track, LyricsTrackSignature, ResolvedLyrics};
use crate::shell::app_sidebar::NavChannel;

mod render;

#[derive(Debug, Clone)]
pub(crate) enum LyricsFetchState {
    Idle,
    Loading,
    Ready(ResolvedLyrics),
    Error(String),
}

pub(crate) struct SidePlayerView {
    audio: AudioHandle,
    library_view: Entity<library::LibraryView>,
    nav_channel: Entity<NavChannel>,
    seek_slider: Entity<SliderState>,
    seek_scrub_in_progress: bool,
    seek_scrub_fraction: Option<f32>,
    pending_seek_position: Option<f64>,
    pending_seek_started_at: Option<std::time::Instant>,
    last_playback_duration: f64,
    last_playback_playing: bool,
    cached_track_title: Option<String>,
    cached_track_artist: Option<String>,
    cached_track_album: Option<String>,
    lyrics_track_path: Option<String>,
    lyrics_fetch_seq: u64,
    lyrics_state: LyricsFetchState,
    lyrics_scroll_handle: ScrollHandle,
    lyrics_initial_scroll_retries: u8,
    last_active_lyric_idx: Option<usize>,
    _seek_slider_subscription: Subscription,
}

impl SidePlayerView {
    pub(crate) fn new(
        audio: AudioHandle,
        library_view: Entity<library::LibraryView>,
        nav_channel: Entity<NavChannel>,
        cx: &mut Context<Self>,
    ) -> Self {
        let seek_slider = cx.new(|_| {
            SliderState::new()
                .min(0.0)
                .max(1.0)
                .step(0.001)
                .default_value(0.0)
        });
        let _seek_slider_subscription = cx.subscribe(
            &seek_slider,
            |this: &mut Self, _, ev: &SliderEvent, cx| match ev {
                SliderEvent::Change(value) => {
                    this.seek_scrub_in_progress = true;
                    this.seek_scrub_fraction = Some(value.end().clamp(0.0, 1.0));
                    cx.notify();
                }
            },
        );

        let poll_audio = audio.clone();
        let lib = library_view.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let mut prev_playing = false;
            let mut prev_position_bucket: i64 = -1; // playback position in 0.5s buckets
            let mut prev_track: Option<String> = None;
            loop {
                // Poll faster during playback (200ms), much slower when idle (1s).
                let interval = if prev_playing { 200 } else { 1000 };
                smol::Timer::after(std::time::Duration::from_millis(interval)).await;
                let should_continue = this
                    .update(cx, |this, cx| {
                        let playback = poll_audio.read_state();
                        let track_changed = playback.track_path != prev_track;
                        let duration_hint = playback
                            .duration
                            .map(|seconds| seconds.round().max(0.0) as u64);

                        if track_changed {
                            let track_metadata = playback
                                .track_path
                                .as_deref()
                                .and_then(|path| lib.read(cx).track_metadata_for_path(path));

                            if let Some((title, artist, album)) = track_metadata.as_ref() {
                                this.cached_track_title = Some(title.clone());
                                this.cached_track_artist = Some(artist.clone());
                                this.cached_track_album = Some(album.clone());
                            } else {
                                this.cached_track_title = None;
                                this.cached_track_artist = None;
                                this.cached_track_album = None;
                            }

                            let signature = playback.track_path.as_deref().and_then(|path| {
                                track_metadata.clone().map(
                                    |(track_name, artist_name, album_name)| LyricsTrackSignature {
                                        track_path: path.to_string(),
                                        track_name,
                                        artist_name,
                                        album_name,
                                        duration_sec: duration_hint,
                                    },
                                )
                            });
                            this.ensure_lyrics_for_playback(
                                playback.track_path.as_deref(),
                                signature,
                                cx,
                            );
                        }

                        // Trigger redraws only for meaningful playback updates.
                        let cur_position_bucket = (playback.position * 2.0) as i64;
                        let changed = playback.playing != prev_playing
                            || cur_position_bucket != prev_position_bucket
                            || track_changed;
                        prev_playing = playback.playing;
                        prev_position_bucket = cur_position_bucket;
                        prev_track = playback.track_path.clone();
                        if changed {
                            cx.notify();
                        }
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
                let _ = lib.update(cx, |lib, cx| {
                    lib.check_auto_advance(cx);
                });
            }
        })
        .detach();

        Self {
            audio,
            library_view,
            nav_channel,
            seek_slider,
            seek_scrub_in_progress: false,
            seek_scrub_fraction: None,
            pending_seek_position: None,
            pending_seek_started_at: None,
            last_playback_duration: 0.0,
            last_playback_playing: false,
            cached_track_title: None,
            cached_track_artist: None,
            cached_track_album: None,
            lyrics_track_path: None,
            lyrics_fetch_seq: 0,
            lyrics_state: LyricsFetchState::Idle,
            lyrics_scroll_handle: ScrollHandle::new(),
            lyrics_initial_scroll_retries: 0,
            last_active_lyric_idx: None,
            _seek_slider_subscription,
        }
    }

    fn ensure_lyrics_for_playback(
        &mut self,
        track_path: Option<&str>,
        signature: Option<LyricsTrackSignature>,
        cx: &mut Context<Self>,
    ) {
        let Some(track_path) = track_path.map(str::trim).filter(|path| !path.is_empty()) else {
            self.lyrics_fetch_seq = self.lyrics_fetch_seq.wrapping_add(1);
            self.lyrics_track_path = None;
            self.lyrics_state = LyricsFetchState::Idle;
            self.lyrics_scroll_handle = ScrollHandle::new();
            self.lyrics_initial_scroll_retries = 0;
            self.last_active_lyric_idx = None;
            return;
        };

        if self.lyrics_track_path.as_deref() == Some(track_path) {
            return;
        }

        let Some(signature) = signature else {
            self.lyrics_fetch_seq = self.lyrics_fetch_seq.wrapping_add(1);
            self.lyrics_track_path = Some(track_path.to_string());
            self.lyrics_state =
                LyricsFetchState::Error("Missing track metadata for lyrics lookup.".to_string());
            self.lyrics_scroll_handle = ScrollHandle::new();
            self.lyrics_initial_scroll_retries = 0;
            self.last_active_lyric_idx = None;
            return;
        };

        self.lyrics_track_path = Some(track_path.to_string());
        self.lyrics_state = LyricsFetchState::Loading;
        self.lyrics_fetch_seq = self.lyrics_fetch_seq.wrapping_add(1);
        self.lyrics_scroll_handle = ScrollHandle::new();
        // Repeat a handful of initial top-scroll attempts to avoid layout timing races.
        self.lyrics_initial_scroll_retries = 8;
        self.last_active_lyric_idx = None;
        let fetch_seq = self.lyrics_fetch_seq;
        let db_handle = self.library_view.read(cx).lyrics_db_handle();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let resolved =
                smol::unblock(move || resolve_lyrics_for_track(&signature, db_handle)).await;
            let _ = this.update(cx, |this, cx| {
                if this.lyrics_fetch_seq != fetch_seq {
                    return;
                }
                this.lyrics_state = match resolved {
                    Ok(lyrics) => LyricsFetchState::Ready(lyrics),
                    Err(err) => LyricsFetchState::Error(err),
                };
                cx.notify();
            });
        })
        .detach();
    }
}
