//! Music library view — browse local folder, scan tracks, display in a virtualized track list.
//! Matches the web app's LibraryPage design with paged loading + scroll virtualization.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use alloy_primitives::Address;
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::input::{Input, InputEvent, InputState};
use gpui_component::menu::PopupMenuItem;
use gpui_component::StyledExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::audio::AudioHandle;
use crate::auth;
use crate::load_storage::{LoadStorageService, PlaylistTrackInput, TrackMetaInput};
use crate::music_db::{MusicDb, ScanProgress, TrackRow};
use crate::scrobble::{now_epoch_sec, ScrobbleService};
use crate::ui::overflow_menu::track_row_overflow_menu;

// =============================================================================
// Colors
// =============================================================================

const BG_ELEVATED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.15,
    a: 1.,
};
const BG_HIGHLIGHT: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.16,
    a: 1.,
};
const BG_HOVER: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.19,
    a: 1.,
};
const TEXT_PRIMARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.98,
    a: 1.,
};
const TEXT_SECONDARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.83,
    a: 1.,
};
const TEXT_MUTED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.64,
    a: 1.,
};
const TEXT_DIM: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.45,
    a: 1.,
};
const ACCENT_BLUE: Hsla = Hsla {
    h: 0.62,
    s: 0.93,
    l: 0.76,
    a: 1.,
};
const BORDER_SUBTLE: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.21,
    a: 1.,
};
const HERO_BG: Hsla = Hsla {
    h: 0.73,
    s: 0.50,
    l: 0.22,
    a: 1.,
};
const TEXT_AMBER: Hsla = Hsla {
    h: 0.10,
    s: 0.90,
    l: 0.65,
    a: 1.,
};
const TEXT_GREEN: Hsla = Hsla {
    h: 0.40,
    s: 0.70,
    l: 0.60,
    a: 1.,
};

// =============================================================================
// Constants
// =============================================================================

const ROW_HEIGHT: f32 = 52.0;
const HEADER_HEIGHT: f32 = 32.0;
const PAGE_SIZE: i64 = 500; // tracks loaded per DB page
const ARTIST_COLUMN_WIDTH: f32 = 200.0;
const ALBUM_COLUMN_WIDTH: f32 = 176.0;
const DEFAULT_SUBGRAPH_ACTIVITY_URL: &str = "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn";
const DEFAULT_RESOLVER_URL: &str =
    "https://heaven-resolver-production.deletion-backup782.workers.dev";
const FILEBASE_GATEWAY: &str = "https://heaven.myfilebase.com/ipfs";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibraryMode {
    Library,
    SharedWithMe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LibrarySortField {
    Title,
    Artist,
    Album,
    Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LibrarySortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LibrarySortState {
    field: LibrarySortField,
    direction: LibrarySortDirection,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum LibraryDetailRoute {
    Root,
    Artist { artist: String },
    Album { artist: String, album: String },
}

#[derive(Debug, Clone)]
struct ArtistCloudStats {
    title: String,
    total_scrobbles: usize,
    unique_listeners: usize,
    image_path: Option<String>,
    track_scrobbles: HashMap<String, usize>,
}

#[derive(Debug, Clone)]
struct AlbumCloudStats {
    title: String,
    artist: String,
    total_scrobbles: usize,
    unique_listeners: usize,
    image_path: Option<String>,
    track_scrobbles: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UploadedTrackRecord {
    owner_address: String,
    file_path: String,
    title: String,
    artist: String,
    album: String,
    track_id: String,
    content_id: String,
    piece_cid: String,
    gateway_url: String,
    tx_hash: String,
    register_version: String,
    created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SharedGrantRecord {
    owner_address: String,
    grantee_address: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    artist: String,
    #[serde(default)]
    album: String,
    #[serde(default)]
    track_id: Option<String>,
    content_id: String,
    piece_cid: String,
    gateway_url: String,
    tx_hash: String,
    mirror_tx_hash: String,
    shared_at_ms: i64,
}

#[derive(Debug, Clone)]
struct PlaylistSummary {
    id: String,
    name: String,
    visibility: u8,
    track_count: usize,
}

// =============================================================================
// Library state
// =============================================================================

pub struct LibraryView {
    mode: LibraryMode,
    db: Option<Arc<Mutex<MusicDb>>>,
    audio: AudioHandle,
    folder: Option<String>,
    tracks: Arc<Vec<TrackRow>>,
    total_count: i64,
    loading: bool,
    scanning: bool,
    scan_progress: Option<ScanProgress>,
    error: Option<String>,
    active_track_path: Option<String>,
    track_started_at_sec: Option<u64>,
    last_scrobbled_key: Option<String>,
    scrobble_service: Option<Arc<Mutex<ScrobbleService>>>,
    storage: Arc<Mutex<LoadStorageService>>,
    upload_busy: bool,
    status_message: Option<String>,
    storage_balance: Option<String>,
    storage_monthly: Option<String>,
    storage_days: Option<i64>,
    storage_loading: bool,
    add_funds_busy: bool,
    uploaded_index_owner: Option<String>,
    uploaded_index: HashMap<String, UploadedTrackRecord>,
    shared_records_for: Option<String>,
    shared_records: Vec<SharedGrantRecord>,
    share_modal_open: bool,
    share_modal_track_index: Option<usize>,
    share_modal_submitting: bool,
    share_modal_error: Option<String>,
    share_wallet_input_state: Entity<InputState>,
    playlist_modal_open: bool,
    playlist_modal_track_index: Option<usize>,
    playlist_modal_submitting: bool,
    playlist_modal_error: Option<String>,
    playlist_modal_loading: bool,
    playlist_modal_needs_reauth: bool,
    playlist_modal_reauth_busy: bool,
    playlist_modal_selected_playlist_id: Option<String>,
    playlist_modal_playlists: Vec<PlaylistSummary>,
    playlist_name_input_state: Entity<InputState>,
    library_search_input_state: Entity<InputState>,
    search_query: String,
    filtered_indices: Arc<Vec<usize>>,
    search_debounce_seq: u64,
    sort_state: Option<LibrarySortState>,
    playback_queue_paths: Vec<String>,
    active_queue_pos: Option<usize>,
    shared_play_busy: bool,
    detail_route: LibraryDetailRoute,
    detail_history: Vec<LibraryDetailRoute>,
    detail_loading: bool,
    detail_error: Option<String>,
    detail_fetch_seq: u64,
    artist_cloud_stats_key: Option<String>,
    artist_cloud_stats: Option<ArtistCloudStats>,
    album_cloud_stats_key: Option<String>,
    album_cloud_stats: Option<AlbumCloudStats>,
}

impl LibraryView {
    pub fn new(window: &mut Window, audio: AudioHandle, cx: &mut Context<Self>) -> Self {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("heaven-gpui");
        let share_wallet_input_state =
            cx.new(|cx| InputState::new(window, cx).placeholder("0x... recipient wallet"));
        let playlist_name_input_state =
            cx.new(|cx| InputState::new(window, cx).placeholder("New playlist name"));
        let library_search_input_state =
            cx.new(|cx| InputState::new(window, cx).placeholder("Search songs, artists, albums"));

        let scrobble_service = match ScrobbleService::new() {
            Ok(s) => Some(Arc::new(Mutex::new(s))),
            Err(e) => {
                log::warn!("[Scrobble] service disabled: {}", e);
                None
            }
        };

        let mut this = Self {
            mode: LibraryMode::Library,
            db: None,
            audio,
            folder: None,
            tracks: Arc::new(Vec::new()),
            total_count: 0,
            loading: false,
            scanning: false,
            scan_progress: None,
            error: None,
            active_track_path: None,
            track_started_at_sec: None,
            last_scrobbled_key: None,
            scrobble_service,
            storage: Arc::new(Mutex::new(LoadStorageService::new())),
            upload_busy: false,
            status_message: None,
            storage_balance: None,
            storage_monthly: None,
            storage_days: None,
            storage_loading: false,
            add_funds_busy: false,
            uploaded_index_owner: None,
            uploaded_index: HashMap::new(),
            shared_records_for: None,
            shared_records: Vec::new(),
            share_modal_open: false,
            share_modal_track_index: None,
            share_modal_submitting: false,
            share_modal_error: None,
            share_wallet_input_state: share_wallet_input_state.clone(),
            playlist_modal_open: false,
            playlist_modal_track_index: None,
            playlist_modal_submitting: false,
            playlist_modal_error: None,
            playlist_modal_loading: false,
            playlist_modal_needs_reauth: false,
            playlist_modal_reauth_busy: false,
            playlist_modal_selected_playlist_id: None,
            playlist_modal_playlists: Vec::new(),
            playlist_name_input_state: playlist_name_input_state.clone(),
            library_search_input_state: library_search_input_state.clone(),
            search_query: String::new(),
            filtered_indices: Arc::new(Vec::new()),
            search_debounce_seq: 0,
            sort_state: None,
            playback_queue_paths: Vec::new(),
            active_queue_pos: None,
            shared_play_busy: false,
            detail_route: LibraryDetailRoute::Root,
            detail_history: Vec::new(),
            detail_loading: false,
            detail_error: None,
            detail_fetch_seq: 0,
            artist_cloud_stats_key: None,
            artist_cloud_stats: None,
            album_cloud_stats_key: None,
            album_cloud_stats: None,
        };

        cx.subscribe_in(
            &share_wallet_input_state,
            window,
            |this: &mut Self, _entity, event: &InputEvent, _window, cx| {
                if let InputEvent::PressEnter { secondary: false } = event {
                    if this.share_modal_open {
                        this.submit_share_modal(cx);
                    }
                }
            },
        )
        .detach();

        cx.subscribe_in(
            &playlist_name_input_state,
            window,
            |this: &mut Self, _entity, event: &InputEvent, _window, cx| {
                if let InputEvent::PressEnter { secondary: false } = event {
                    if this.playlist_modal_open {
                        this.submit_playlist_modal(cx);
                    }
                }
            },
        )
        .detach();

        cx.subscribe_in(
            &library_search_input_state,
            window,
            |this: &mut Self, _entity, event: &InputEvent, _window, cx| match event {
                InputEvent::Change => this.schedule_search_rebuild(cx),
                InputEvent::PressEnter { .. } => {
                    this.sync_search_query_from_input(cx);
                    this.recompute_filtered_indices();
                    cx.notify();
                }
                _ => {}
            },
        )
        .detach();

        match MusicDb::open(&data_dir) {
            Ok(db) => {
                let saved_folder = db.get_setting("folder_path");
                let db = Arc::new(Mutex::new(db));
                this.db = Some(db.clone());

                if let Some(folder) = saved_folder {
                    this.folder = Some(folder.clone());
                    this.loading = true;
                    Self::load_tracks_paged(db, folder, cx);
                }
            }
            Err(e) => {
                log::error!("Failed to open MusicDb: {}", e);
                this.error = Some(e);
            }
        }

        this.fetch_storage_status(cx);
        this.refresh_uploaded_index_from_auth();
        this
    }

    /// Load tracks in pages of PAGE_SIZE to avoid blocking the UI.
    fn load_tracks_paged(db: Arc<Mutex<MusicDb>>, folder: String, cx: &mut Context<Self>) {
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            // Get total count first
            let db2 = db.clone();
            let folder2 = folder.clone();
            let count = smol::unblock(move || {
                let db = db2.lock().map_err(|e| format!("lock: {e}"))?;
                db.get_track_count(&folder2)
            })
            .await;

            let count = match count {
                Ok(c) => c,
                Err(e) => {
                    let _ = this.update(cx, |this, cx| {
                        this.error = Some(e);
                        this.loading = false;
                        cx.notify();
                    });
                    return;
                }
            };

            // Load first page immediately so UI is responsive
            let mut all_tracks: Vec<TrackRow> = Vec::with_capacity(count as usize);
            let mut offset: i64 = 0;

            while offset < count {
                let db3 = db.clone();
                let folder3 = folder.clone();
                let off = offset;
                let page = smol::unblock(move || {
                    let db = db3.lock().map_err(|e| format!("lock: {e}"))?;
                    db.get_tracks(&folder3, PAGE_SIZE, off)
                })
                .await;

                match page {
                    Ok(tracks) => {
                        all_tracks.extend(tracks);
                    }
                    Err(e) => {
                        let _ = this.update(cx, |this, cx| {
                            this.error = Some(e);
                            this.loading = false;
                            cx.notify();
                        });
                        return;
                    }
                }

                offset += PAGE_SIZE;

                // Update UI after first page and then every 5 pages
                if offset == PAGE_SIZE || offset % (PAGE_SIZE * 5) == 0 || offset >= count {
                    let batch = all_tracks.clone();
                    let _ = this.update(cx, |this, cx| {
                        this.tracks = Arc::new(batch);
                        this.recompute_filtered_indices();
                        this.total_count = count;
                        this.loading = offset < count; // still loading if more pages
                        cx.notify();
                    });
                }
            }

            // Final update
            let _ = this.update(cx, |this, cx| {
                this.tracks = Arc::new(all_tracks);
                this.recompute_filtered_indices();
                this.total_count = count;
                this.loading = false;
                cx.notify();
            });
        })
        .detach();
    }

    fn play_track(&mut self, index: usize, _cx: &mut Context<Self>) {
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
            self.active_track_path = Some(track.file_path.clone());
            self.active_queue_pos = self
                .playback_queue_paths
                .iter()
                .position(|path| path == &track.file_path);
            self.track_started_at_sec = Some(now_epoch_sec());
        }
    }

    fn play_track_in_visible_context(
        &mut self,
        track_index: usize,
        visible_indices: &[usize],
        cx: &mut Context<Self>,
    ) {
        if visible_indices.is_empty() {
            self.playback_queue_paths.clear();
            self.active_queue_pos = None;
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
        self.play_track(track_index, cx);
    }

    fn advance_queue(&mut self, direction: i32, cx: &mut Context<Self>) -> bool {
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

    fn active_track_index(&self) -> Option<usize> {
        let active_path = self.active_track_path.as_deref()?;
        self.tracks
            .iter()
            .position(|track| track.file_path == active_path)
    }

    fn sync_search_query_from_input(&mut self, cx: &mut Context<Self>) {
        self.search_query = self.library_search_input_state.read(cx).value().to_string();
    }

    fn apply_sort_to_indices(&self, indices: &mut Vec<usize>) {
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

    fn cycle_sort(&mut self, field: LibrarySortField, cx: &mut Context<Self>) {
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

    fn recompute_filtered_indices(&mut self) {
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

    fn schedule_search_rebuild(&mut self, cx: &mut Context<Self>) {
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

    fn submit_scrobble_for_track(
        &mut self,
        track: TrackRow,
        played_at_sec: u64,
        cx: &mut Context<Self>,
    ) {
        let Some(auth) = auth::load_from_disk() else {
            log::warn!("[Scrobble] skipped: user not authenticated");
            return;
        };

        let dedupe_key = format!("{}:{}:{}", track.file_path, track.title, played_at_sec);
        if self.last_scrobbled_key.as_deref() == Some(dedupe_key.as_str()) {
            return;
        }
        self.last_scrobbled_key = Some(dedupe_key);

        let Some(service) = self.scrobble_service.clone() else {
            log::warn!("[Scrobble] skipped: scrobble service unavailable");
            return;
        };
        cx.spawn(async move |_this: WeakEntity<Self>, _cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut service = service
                    .lock()
                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                service.submit_track(&auth, &track, played_at_sec)
            })
            .await;

            match result {
                Ok(ok) => {
                    log::info!(
                        "[Scrobble] submitted: userOpHash={} sender={}",
                        ok.user_op_hash,
                        ok.sender
                    );
                }
                Err(err) => {
                    log::error!("[Scrobble] submit failed: {}", err);
                }
            }
        })
        .detach();
    }

    /// Auto-advance to next track if current one ended.
    pub fn check_auto_advance(&mut self, cx: &mut Context<Self>) {
        let state = self.audio.read_state();
        // Track ended: has a path, not playing, and position >= duration
        if state.track_path.is_some() && !state.playing {
            if let Some(dur) = state.duration {
                if state.position >= dur - 0.5 && dur > 0.0 {
                    if let Some(idx) = self.active_track_index() {
                        if let Some(track) = self.tracks.get(idx).cloned() {
                            let played_at_sec =
                                self.track_started_at_sec.unwrap_or_else(now_epoch_sec);
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

    fn play_all(&mut self, cx: &mut Context<Self>) {
        let queue_snapshot = self.filtered_indices.clone();
        if let Some(first_index) = queue_snapshot.first().copied() {
            self.play_track_in_visible_context(first_index, queue_snapshot.as_ref(), cx);
        }
    }

    fn browse_folder(&mut self, cx: &mut Context<Self>) {
        let db = match &self.db {
            Some(db) => db.clone(),
            None => return,
        };

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let picked = smol::unblock(|| {
                rfd::FileDialog::new()
                    .set_title("Choose Music Folder")
                    .pick_folder()
            })
            .await;

            let folder = match picked {
                Some(p) => p.to_string_lossy().to_string(),
                None => return,
            };

            {
                let db = db.lock().unwrap();
                let _ = db.set_setting("folder_path", &folder);
            }

            let _ = this.update(cx, |this, cx| {
                this.folder = Some(folder.clone());
                this.scanning = true;
                this.scan_progress = Some(ScanProgress { done: 0, total: 0 });
                this.tracks = Arc::new(Vec::new());
                this.recompute_filtered_indices();
                this.total_count = 0;
                this.active_track_path = None;
                this.playback_queue_paths.clear();
                this.active_queue_pos = None;
                this.reset_detail_navigation();
                cx.notify();
            });

            // Scan
            let db2 = db.clone();
            let folder2 = folder.clone();
            let progress = Arc::new(Mutex::new(ScanProgress { done: 0, total: 0 }));
            let progress2 = progress.clone();

            let result = smol::unblock(move || {
                let db = db2.lock().map_err(|e| format!("lock: {e}"))?;
                db.scan_folder(&folder2, |p| {
                    let mut prog = progress2.lock().unwrap();
                    *prog = p;
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.scanning = false;
                this.scan_progress = None;
                if let Err(e) = result {
                    this.error = Some(e);
                }
                cx.notify();
            });

            // Load tracks in pages
            let folder3 = folder.clone();
            // Need to get db ref again for loading
            let _ = this.update(cx, |this, cx| {
                this.loading = true;
                if let Some(db) = &this.db {
                    Self::load_tracks_paged(db.clone(), folder3, cx);
                }
            });
        })
        .detach();
    }

    fn rescan(&mut self, cx: &mut Context<Self>) {
        let folder = match &self.folder {
            Some(f) => f.clone(),
            None => return,
        };
        let db = match &self.db {
            Some(db) => db.clone(),
            None => return,
        };

        self.scanning = true;
        self.scan_progress = Some(ScanProgress { done: 0, total: 0 });
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let db2 = db.clone();
            let folder2 = folder.clone();
            let progress = Arc::new(Mutex::new(ScanProgress { done: 0, total: 0 }));
            let progress2 = progress.clone();

            let result = smol::unblock(move || {
                let db = db2.lock().map_err(|e| format!("lock: {e}"))?;
                db.scan_folder(&folder2, |p| {
                    let mut prog = progress2.lock().unwrap();
                    *prog = p;
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.scanning = false;
                this.scan_progress = None;
                if let Err(e) = result {
                    this.error = Some(e);
                }
                cx.notify();
            });

            // Reload
            let folder3 = folder.clone();
            let _ = this.update(cx, |this, cx| {
                this.loading = true;
                if let Some(db) = &this.db {
                    Self::load_tracks_paged(db.clone(), folder3, cx);
                }
            });
        })
        .detach();
    }

    fn fetch_storage_status(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => return,
        };
        self.storage_loading = true;
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("lock: {e}"))?;
                svc.storage_status(&auth)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.storage_loading = false;
                match result {
                    Ok(val) => {
                        this.storage_balance = val
                            .get("balance")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        this.storage_monthly = val
                            .get("monthlyCost")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        this.storage_days = val.get("daysRemaining").and_then(|v| v.as_i64());
                    }
                    Err(e) => {
                        log::warn!("[Library] storage status fetch failed: {}", e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn add_funds(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(a) => a,
            None => {
                self.set_status_message("Sign in from Wallet before adding funds.", cx);
                return;
            }
        };
        if self.add_funds_busy {
            return;
        }
        self.add_funds_busy = true;
        self.set_status_message("Submitting Base Sepolia PKP funding tx...", cx);

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("lock: {e}"))?;
                svc.storage_deposit_and_approve(&auth, "0.0001")
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.add_funds_busy = false;
                match result {
                    Ok(val) => {
                        let tx_hash = val
                            .get("txHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown");
                        log::info!(
                            "[Library] storage funding flow complete: txHash={}",
                            tx_hash
                        );
                        this.set_status_message(
                            "Funding submitted. Refreshing storage status...",
                            cx,
                        );
                        this.fetch_storage_status(cx);
                    }
                    Err(e) => {
                        log::error!("[Library] storage funding flow failed: {}", e);
                        this.set_status_message(format!("Funding failed: {}", e), cx);
                    }
                }
            });
        })
        .detach();
    }

    fn set_status_message(&mut self, message: impl Into<String>, cx: &mut Context<Self>) {
        self.status_message = Some(message.into());
        cx.notify();
    }

    fn reset_detail_navigation(&mut self) {
        self.detail_route = LibraryDetailRoute::Root;
        self.detail_history.clear();
        self.detail_loading = false;
        self.detail_error = None;
    }

    fn navigate_to_detail(&mut self, route: LibraryDetailRoute, cx: &mut Context<Self>) {
        if self.detail_route == route {
            return;
        }
        self.detail_history.push(self.detail_route.clone());
        self.detail_route = route;
        self.detail_error = None;
        cx.notify();
    }

    fn navigate_back_from_detail(&mut self, cx: &mut Context<Self>) {
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
                LibraryDetailRoute::Root => {}
            }
        }
        cx.notify();
    }

    fn open_artist_page(&mut self, artist_name: impl Into<String>, cx: &mut Context<Self>) {
        let artist = sanitize_detail_value(artist_name.into(), "Unknown Artist");
        self.navigate_to_detail(LibraryDetailRoute::Artist { artist }, cx);
        self.prefetch_artist_cloud_stats(cx);
    }

    fn open_album_page(
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

    fn prefetch_artist_cloud_stats(&mut self, cx: &mut Context<Self>) {
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

    fn prefetch_album_cloud_stats(&mut self, cx: &mut Context<Self>) {
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

    pub fn set_mode(&mut self, mode: LibraryMode, cx: &mut Context<Self>) {
        self.mode = mode;
        match self.mode {
            LibraryMode::Library => {
                self.refresh_uploaded_index_from_auth();
            }
            LibraryMode::SharedWithMe => {
                self.refresh_shared_records_for_auth(cx);
            }
        }
        if self.mode != LibraryMode::Library {
            self.reset_detail_navigation();
        }
        cx.notify();
    }

    fn refresh_uploaded_index_from_auth(&mut self) {
        let owner = auth::load_from_disk()
            .and_then(|a| a.pkp_address)
            .unwrap_or_default()
            .to_lowercase();

        if owner.is_empty() {
            self.uploaded_index_owner = None;
            self.uploaded_index.clear();
            return;
        }
        if self.uploaded_index_owner.as_deref() == Some(owner.as_str()) {
            return;
        }

        let records = load_uploaded_track_records_for_owner(&owner);
        self.uploaded_index = records
            .into_iter()
            .map(|r| (r.file_path.clone(), r))
            .collect();
        self.uploaded_index_owner = Some(owner);
    }

    fn refresh_shared_records_for_auth(&mut self, cx: &mut Context<Self>) {
        let grantee = auth::load_from_disk()
            .and_then(|a| a.pkp_address)
            .unwrap_or_default()
            .to_lowercase();

        if grantee.is_empty() {
            self.shared_records_for = None;
            self.shared_records.clear();
            return;
        }

        let mut records = load_shared_grant_records_for_grantee(&grantee);
        records.sort_by(|a, b| b.shared_at_ms.cmp(&a.shared_at_ms));
        let needs_enrichment = records.iter().any(needs_shared_metadata_enrichment);
        self.shared_records = records.clone();
        self.shared_records_for = Some(grantee.clone());

        if !needs_enrichment {
            return;
        }

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let enriched = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let mut changed = false;
                for record in &mut records {
                    if !needs_shared_metadata_enrichment(record) {
                        continue;
                    }
                    let metadata = match svc.resolve_shared_track_metadata(
                        &record.content_id,
                        record.track_id.as_deref(),
                    ) {
                        Ok(v) => v,
                        Err(err) => {
                            log::warn!(
                                "[Library] shared metadata lookup failed for contentId={}: {}",
                                record.content_id,
                                err
                            );
                            continue;
                        }
                    };

                    let mut record_changed = false;
                    if let Some(track_id) = metadata.get("trackId").and_then(|v| v.as_str()) {
                        let norm = track_id.trim().to_lowercase();
                        if !norm.is_empty()
                            && record
                                .track_id
                                .as_deref()
                                .unwrap_or_default()
                                .to_lowercase()
                                != norm
                        {
                            record.track_id = Some(norm);
                            record_changed = true;
                        }
                    }
                    if let Some(title) = metadata.get("title").and_then(|v| v.as_str()) {
                        let title = title.trim();
                        if !title.is_empty() && record.title != title {
                            record.title = title.to_string();
                            record_changed = true;
                        }
                    }
                    if let Some(artist) = metadata.get("artist").and_then(|v| v.as_str()) {
                        let artist = artist.trim();
                        if !artist.is_empty() && record.artist != artist {
                            record.artist = artist.to_string();
                            record_changed = true;
                        }
                    }
                    if let Some(album) = metadata.get("album").and_then(|v| v.as_str()) {
                        let album = album.trim();
                        if record.album != album {
                            record.album = album.to_string();
                            record_changed = true;
                        }
                    }

                    if record_changed {
                        changed = true;
                    }
                }

                Ok::<(Vec<SharedGrantRecord>, bool), String>((records, changed))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                match enriched {
                    Ok((records, changed)) => {
                        if changed && this.shared_records_for.as_deref() == Some(grantee.as_str()) {
                            this.shared_records = records;
                        }
                    }
                    Err(err) => {
                        log::warn!("[Library] shared metadata enrichment failed: {}", err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn play_shared_record(&mut self, index: usize, cx: &mut Context<Self>) {
        if self.shared_play_busy {
            return;
        }
        let Some(record) = self.shared_records.get(index).cloned() else {
            self.set_status_message("Shared track not found.", cx);
            return;
        };

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in before playing shared tracks.", cx);
                return;
            }
        };

        self.shared_play_busy = true;
        self.set_status_message(
            format!("Decrypting shared track \"{}\"...", record.title),
            cx,
        );

        let storage = self.storage.clone();
        let audio = self.audio.clone();
        let record_for_request = record.clone();
        let record_for_ui = record;
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.decrypt_shared_content_to_local_file(
                    &auth,
                    &record_for_request.content_id,
                    &record_for_request.piece_cid,
                    Some(&record_for_request.gateway_url),
                    Some(&record_for_request.title),
                )
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.shared_play_busy = false;
                match result {
                    Ok(payload) => {
                        let local_path = payload
                            .get("localPath")
                            .and_then(|v| v.as_str())
                            .map(str::to_string);
                        match local_path {
                            Some(path) => {
                                audio.play(&path, None, Some(record_for_ui.artist.clone()), None);
                                this.active_track_path = None;
                                this.playback_queue_paths.clear();
                                this.active_queue_pos = None;
                                let cache_hit = payload
                                    .get("cacheHit")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                if cache_hit {
                                    this.set_status_message(
                                        format!(
                                            "Playing shared track \"{}\" (cached decrypt).",
                                            record_for_ui.title
                                        ),
                                        cx,
                                    );
                                } else {
                                    this.set_status_message(
                                        format!(
                                            "Playing shared track \"{}\".",
                                            record_for_ui.title
                                        ),
                                        cx,
                                    );
                                }
                            }
                            None => {
                                this.set_status_message(
                                    "Shared decrypt succeeded but no local file was produced.",
                                    cx,
                                );
                            }
                        }
                    }
                    Err(err) => {
                        log::error!("[Library] shared playback failed: {}", err);
                        this.set_status_message(
                            format!("Shared playback failed: {}", summarize_status_error(&err)),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn open_playlist_modal(&mut self, track_index: usize, cx: &mut Context<Self>) {
        self.playlist_modal_open = true;
        self.playlist_modal_track_index = Some(track_index);
        self.playlist_modal_submitting = false;
        self.playlist_modal_error = None;
        self.playlist_modal_loading = true;
        self.playlist_modal_needs_reauth = false;
        self.playlist_modal_reauth_busy = false;
        self.playlist_modal_selected_playlist_id = None;
        self.playlist_modal_playlists.clear();
        self.fetch_playlists_for_modal(cx);
        cx.notify();
    }

    fn close_playlist_modal(&mut self, cx: &mut Context<Self>) {
        self.playlist_modal_open = false;
        self.playlist_modal_track_index = None;
        self.playlist_modal_submitting = false;
        self.playlist_modal_error = None;
        self.playlist_modal_loading = false;
        self.playlist_modal_needs_reauth = false;
        self.playlist_modal_reauth_busy = false;
        self.playlist_modal_selected_playlist_id = None;
        self.playlist_modal_playlists.clear();
        cx.notify();
    }

    fn fetch_playlists_for_modal(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.playlist_modal_loading = false;
                self.playlist_modal_error = Some("Sign in before using playlists.".to_string());
                self.playlist_modal_needs_reauth = true;
                cx.notify();
                return;
            }
        };
        let owner = auth.pkp_address.clone().unwrap_or_default().to_lowercase();
        if owner.is_empty() {
            self.playlist_modal_loading = false;
            self.playlist_modal_error = Some("Missing wallet address in auth session.".to_string());
            self.playlist_modal_needs_reauth = true;
            cx.notify();
            return;
        }

        self.playlist_modal_loading = true;
        self.playlist_modal_error = None;
        self.playlist_modal_needs_reauth = false;
        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let raw = svc.playlist_fetch_user_playlists(&owner, 100)?;
                Ok::<Vec<PlaylistSummary>, String>(parse_playlist_summaries(&raw))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.playlist_modal_loading = false;
                match result {
                    Ok(playlists) => {
                        let selected = playlists.first().map(|p| p.id.clone());
                        this.playlist_modal_selected_playlist_id = selected;
                        this.playlist_modal_playlists = playlists;
                    }
                    Err(err) => {
                        this.playlist_modal_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn submit_playlist_modal_create(&mut self, cx: &mut Context<Self>) {
        self.playlist_modal_selected_playlist_id = None;
        self.submit_playlist_modal(cx);
    }

    fn submit_playlist_modal(&mut self, cx: &mut Context<Self>) {
        if self.playlist_modal_submitting {
            return;
        }

        let Some(track_index) = self.playlist_modal_track_index else {
            self.playlist_modal_error = Some("No track selected.".to_string());
            cx.notify();
            return;
        };
        let Some(track) = self.tracks.get(track_index).cloned() else {
            self.playlist_modal_error = Some("Selected track no longer exists.".to_string());
            cx.notify();
            return;
        };

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.playlist_modal_error = Some("Sign in before using playlists.".to_string());
                cx.notify();
                return;
            }
        };

        let selected_playlist = self
            .playlist_modal_selected_playlist_id
            .as_ref()
            .and_then(|id| self.playlist_modal_playlists.iter().find(|p| p.id == *id))
            .cloned();
        let new_name = self
            .playlist_name_input_state
            .read(cx)
            .value()
            .trim()
            .to_string();

        if selected_playlist.is_none() && new_name.is_empty() {
            self.playlist_modal_error =
                Some("Select a playlist or enter a new playlist name.".to_string());
            cx.notify();
            return;
        }

        self.playlist_modal_submitting = true;
        self.playlist_modal_error = None;
        self.playlist_modal_needs_reauth = false;
        if let Some(pl) = selected_playlist.as_ref() {
            self.set_status_message(
                format!("Adding \"{}\" to \"{}\"...", track.title, pl.name),
                cx,
            );
        } else {
            self.set_status_message(format!("Creating playlist \"{}\"...", new_name), cx);
        }

        let storage = self.storage.clone();
        let playlist_input = playlist_track_input_from_track(&track);
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result: Result<(String, Value), String> = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;

                if let Some(playlist) = selected_playlist {
                    let existing_ids = if playlist.track_count > 0 {
                        svc.playlist_fetch_track_ids(&playlist.id, 1000)?
                    } else {
                        Vec::new()
                    };
                    if playlist.track_count > 0 && existing_ids.is_empty() {
                        return Err(format!(
                            "Could not load existing tracks for \"{}\" yet. Retry after subgraph indexing catches up.",
                            playlist.name
                        ));
                    }

                    let existing_slice = if existing_ids.is_empty() {
                        None
                    } else {
                        Some(existing_ids.as_slice())
                    };
                    let payload = svc.playlist_set_tracks(
                        &auth,
                        &playlist.id,
                        std::slice::from_ref(&playlist_input),
                        existing_slice,
                    )?;
                    Ok::<(String, Value), String>((playlist.name, payload))
                } else {
                    let payload = svc.playlist_create(
                        &auth,
                        &new_name,
                        Some(""),
                        0,
                        std::slice::from_ref(&playlist_input),
                    )?;
                    Ok::<(String, Value), String>((new_name, payload))
                }
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.playlist_modal_submitting = false;
                match result {
                    Ok((playlist_name, payload)) => {
                        this.playlist_modal_open = false;
                        this.playlist_modal_track_index = None;
                        this.playlist_modal_error = None;
                        this.playlist_modal_needs_reauth = false;

                        let tx_hash = payload
                            .get("txHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        this.set_status_message(
                            format!(
                                "Playlist updated: \"{}\" (tx={})",
                                playlist_name,
                                abbreviate_for_status(tx_hash)
                            ),
                            cx,
                        );
                    }
                    Err(err) => {
                        log::error!("[Library] playlist update failed: {}", err);
                        if is_needs_reauth_error(&err) {
                            this.playlist_modal_needs_reauth = true;
                            this.playlist_modal_error = Some(needs_reauth_prompt_message());
                        } else {
                            this.playlist_modal_needs_reauth = false;
                            this.playlist_modal_error = Some(summarize_status_error(&err));
                        }
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn trigger_playlist_modal_reauth(&mut self, cx: &mut Context<Self>) {
        if self.playlist_modal_reauth_busy {
            return;
        }

        self.playlist_modal_reauth_busy = true;
        self.playlist_modal_error = None;
        self.set_status_message("Opening browser for wallet auth...", cx);
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.authing = true;
        });
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = auth::run_auth_callback_server().await;
            let _ = this.update(cx, |this, cx| {
                this.playlist_modal_reauth_busy = false;
                match result {
                    Ok(auth_result) => {
                        let persisted = auth::to_persisted(&auth_result);
                        match auth::save_to_disk(&persisted) {
                            Ok(()) => {
                                let persisted_for_state = persisted.clone();
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.persisted = Some(persisted_for_state);
                                    state.authing = false;
                                });
                                this.playlist_modal_needs_reauth = false;
                                this.playlist_modal_error = None;
                                this.set_status_message(
                                    "Session refreshed. Retrying playlist action...",
                                    cx,
                                );
                                this.submit_playlist_modal(cx);
                            }
                            Err(err) => {
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.authing = false;
                                });
                                this.playlist_modal_needs_reauth = true;
                                this.playlist_modal_error = Some(format!(
                                    "Sign-in succeeded, but auth could not be persisted: {}",
                                    summarize_status_error(&err)
                                ));
                            }
                        }
                    }
                    Err(err) => {
                        let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                            state.authing = false;
                        });
                        this.playlist_modal_needs_reauth = true;
                        this.playlist_modal_error =
                            Some(format!("Sign-in failed: {}", summarize_status_error(&err)));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn open_share_modal(&mut self, track_index: usize, cx: &mut Context<Self>) {
        self.refresh_uploaded_index_from_auth();
        self.share_modal_open = true;
        self.share_modal_track_index = Some(track_index);
        self.share_modal_submitting = false;
        self.share_modal_error = None;
        cx.notify();
    }

    fn close_share_modal(&mut self, cx: &mut Context<Self>) {
        self.share_modal_open = false;
        self.share_modal_track_index = None;
        self.share_modal_submitting = false;
        self.share_modal_error = None;
        cx.notify();
    }

    fn submit_share_modal(&mut self, cx: &mut Context<Self>) {
        if self.share_modal_submitting {
            return;
        }

        let raw_wallet = self
            .share_wallet_input_state
            .read(cx)
            .value()
            .trim()
            .to_string();
        if raw_wallet.is_empty() {
            self.share_modal_error = Some("Enter recipient EVM wallet address.".to_string());
            cx.notify();
            return;
        }
        let grantee_addr = match raw_wallet.parse::<Address>() {
            Ok(addr) => addr,
            Err(_) => {
                self.share_modal_error = Some("Invalid EVM wallet address.".to_string());
                cx.notify();
                return;
            }
        };
        let grantee_hex = format!("{:#x}", grantee_addr).to_lowercase();

        let Some(track_index) = self.share_modal_track_index else {
            self.share_modal_error = Some("No track selected for sharing.".to_string());
            cx.notify();
            return;
        };
        let Some(track) = self.tracks.get(track_index).cloned() else {
            self.share_modal_error = Some("Track not found.".to_string());
            cx.notify();
            return;
        };

        self.refresh_uploaded_index_from_auth();
        let uploaded = self.uploaded_index.get(&track.file_path).cloned();

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.share_modal_error = Some("Sign in before sharing tracks.".to_string());
                cx.notify();
                return;
            }
        };
        let owner_address = auth.pkp_address.clone().unwrap_or_default().to_lowercase();

        self.share_modal_submitting = true;
        self.share_modal_error = None;
        self.set_status_message(
            format!(
                "Granting access for \"{}\" to {}...",
                track.title,
                abbreviate_for_status(&grantee_hex)
            ),
            cx,
        );

        let storage = self.storage.clone();
        let grantee_for_request = grantee_hex.clone();
        let uploaded_for_request = uploaded.clone();
        let track_for_lookup = track.clone();
        let path_for_lookup = track.file_path.clone();
        let owner_for_lookup = owner_address.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let uploaded = if let Some(existing) = uploaded_for_request {
                    existing
                } else {
                    let resolved = svc.resolve_registered_content_for_track(
                        &auth,
                        &path_for_lookup,
                        TrackMetaInput {
                            title: Some(track_for_lookup.title.clone()),
                            artist: Some(track_for_lookup.artist.clone()),
                            album: Some(track_for_lookup.album.clone()),
                            mbid: track_for_lookup.mbid.clone(),
                            ip_id: track_for_lookup.ip_id.clone(),
                        },
                    )?;
                    UploadedTrackRecord {
                        owner_address: owner_for_lookup.clone(),
                        file_path: path_for_lookup.clone(),
                        title: track_for_lookup.title.clone(),
                        artist: track_for_lookup.artist.clone(),
                        album: track_for_lookup.album.clone(),
                        track_id: resolved
                            .get("trackId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        content_id: resolved
                            .get("contentId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        piece_cid: resolved
                            .get("pieceCid")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        gateway_url: resolved
                            .get("gatewayUrl")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        tx_hash: resolved
                            .get("txHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        register_version: resolved
                            .get("registerVersion")
                            .and_then(|v| v.as_str())
                            .unwrap_or("onchain-recovered")
                            .to_string(),
                        created_at_ms: chrono::Utc::now().timestamp_millis(),
                    }
                };

                let grant_resp =
                    svc.content_grant_access(&auth, &uploaded.content_id, &grantee_for_request)?;
                Ok::<(UploadedTrackRecord, serde_json::Value), String>((uploaded, grant_resp))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.share_modal_submitting = false;
                match result {
                    Ok((uploaded_resolved, resp)) => {
                        if let Err(e) = upsert_uploaded_track_record(uploaded_resolved.clone()) {
                            log::error!(
                                "[Library] failed to persist recovered uploaded track record: {}",
                                e
                            );
                        } else {
                            this.uploaded_index_owner = Some(owner_address.clone());
                            this.uploaded_index.insert(
                                uploaded_resolved.file_path.clone(),
                                uploaded_resolved.clone(),
                            );
                        }

                        let tx_hash = resp.get("txHash").and_then(|v| v.as_str()).unwrap_or("n/a");
                        let mirror_tx_hash = resp
                            .get("mirrorTxHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");

                        let record = SharedGrantRecord {
                            owner_address,
                            grantee_address: grantee_hex.clone(),
                            title: uploaded_resolved.title.clone(),
                            artist: uploaded_resolved.artist.clone(),
                            album: uploaded_resolved.album.clone(),
                            track_id: Some(uploaded_resolved.track_id.clone()),
                            content_id: uploaded_resolved.content_id.clone(),
                            piece_cid: uploaded_resolved.piece_cid.clone(),
                            gateway_url: uploaded_resolved.gateway_url.clone(),
                            tx_hash: tx_hash.to_string(),
                            mirror_tx_hash: mirror_tx_hash.to_string(),
                            shared_at_ms: chrono::Utc::now().timestamp_millis(),
                        };
                        if let Err(e) = append_shared_grant_record(record) {
                            log::error!("[Library] failed to persist shared grant record: {}", e);
                        }

                        this.share_modal_open = false;
                        this.share_modal_track_index = None;
                        this.share_modal_error = None;
                        this.set_status_message(
                            format!(
                                "Shared \"{}\" with {} (tx={}).",
                                uploaded_resolved.title,
                                abbreviate_for_status(&grantee_hex),
                                abbreviate_for_status(tx_hash),
                            ),
                            cx,
                        );
                        if this.mode == LibraryMode::SharedWithMe {
                            this.refresh_shared_records_for_auth(cx);
                        }
                    }
                    Err(err) => {
                        log::error!("[Library] content share failed: {}", err);
                        this.share_modal_error = Some(summarize_status_error(&err));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn encrypt_upload_track(&mut self, track: TrackRow, cx: &mut Context<Self>) {
        if self.upload_busy {
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in from Wallet before uploading.", cx);
                return;
            }
        };

        if track.file_path.is_empty() || !std::path::Path::new(&track.file_path).exists() {
            self.set_status_message("Track file is missing on disk; upload cancelled.", cx);
            return;
        }

        let track_title = track.title.clone();
        let track_for_record = track.clone();
        let track_meta = TrackMetaInput {
            title: Some(track.title.clone()),
            artist: Some(track.artist.clone()),
            album: Some(track.album.clone()),
            mbid: track.mbid.clone(),
            ip_id: track.ip_id.clone(),
        };
        let path = track.file_path.clone();
        let owner_address = auth.pkp_address.clone().unwrap_or_default().to_lowercase();

        self.upload_busy = true;
        self.set_status_message(
            format!(
                "Encrypting + uploading \"{}\" to Load (network + register can take a few minutes)...",
                track_title
            ),
            cx,
        );

        let storage = self.storage.clone();
        let path_for_request = path.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                match svc.content_encrypt_upload_register(&auth, &path_for_request, true, track_meta)
                {
                    Ok(resp) => Ok(resp),
                    Err(upload_err) => {
                        let health = svc.health().ok();
                        let storage_status = svc.storage_status(&auth).ok();
                        let diagnostic = serde_json::json!({
                            "uploadError": upload_err,
                            "storageHealth": health,
                            "storageStatus": storage_status,
                        });
                        Err(
                            serde_json::to_string_pretty(&diagnostic).unwrap_or_else(|_| {
                                "Upload failed (diagnostic encoding failed)".to_string()
                            }),
                        )
                    }
                }
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.upload_busy = false;
                match result {
                    Ok(resp) => {
                        let piece_cid = resp
                            .get("pieceCid")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let content_id = resp
                            .get("contentId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let track_id = resp
                            .get("trackId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let tx_hash = resp.get("txHash").and_then(|v| v.as_str()).unwrap_or("n/a");
                        let gateway_url = resp
                            .get("gatewayUrl")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let reg_ver = resp
                            .get("registerVersion")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");

                        if !owner_address.is_empty()
                            && content_id.starts_with("0x")
                            && piece_cid != "n/a"
                        {
                            let record = UploadedTrackRecord {
                                owner_address: owner_address.clone(),
                                file_path: path.clone(),
                                title: track_for_record.title.clone(),
                                artist: track_for_record.artist.clone(),
                                album: track_for_record.album.clone(),
                                track_id: track_id.to_string(),
                                content_id: content_id.to_string(),
                                piece_cid: piece_cid.to_string(),
                                gateway_url: gateway_url.to_string(),
                                tx_hash: tx_hash.to_string(),
                                register_version: reg_ver.to_string(),
                                created_at_ms: chrono::Utc::now().timestamp_millis(),
                            };
                            if let Err(e) = upsert_uploaded_track_record(record.clone()) {
                                log::error!(
                                    "[Library] failed to persist uploaded track record for '{}': {}",
                                    track_title,
                                    e
                                );
                            } else {
                                this.uploaded_index_owner = Some(owner_address.clone());
                                this.uploaded_index.insert(path.clone(), record);
                            }
                        }

                        log::info!(
                            "[Library] encrypt+upload success for '{}' pieceCid={} trackId={} txHash={} registerVersion={} gatewayUrl={}",
                            track_title,
                            piece_cid,
                            track_id,
                            tx_hash,
                            reg_ver,
                            gateway_url,
                        );
                        log::debug!(
                            "[Library] encrypt+upload response for '{}': {}",
                            track_title,
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| "<invalid response>".to_string())
                        );
                        this.set_status_message(
                            format!(
                                "Upload complete: \"{}\" | cid={} | tx={}",
                                track_title,
                                abbreviate_for_status(piece_cid),
                                abbreviate_for_status(tx_hash),
                            ),
                            cx,
                        );
                    }
                    Err(err) => {
                        log::error!(
                            "[Library] encrypt+upload failed for '{}': {}",
                            track_title,
                            err
                        );
                        this.set_status_message(
                            format!(
                                "Encrypt + upload failed for \"{}\": {}",
                                track_title,
                                summarize_status_error(&err),
                            ),
                            cx,
                        );
                    }
                }
            });
        })
        .detach();
    }

    fn render_share_modal(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let track_title = self
            .share_modal_track_index
            .and_then(|i| self.tracks.get(i))
            .map(|t| t.title.clone())
            .unwrap_or_else(|| "Selected track".to_string());

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.55))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .relative()
                    .w(px(520.))
                    .max_w(px(620.))
                    .mx_4()
                    .rounded(px(14.))
                    .bg(BG_ELEVATED)
                    .border_1()
                    .border_color(BORDER_SUBTLE)
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::BOLD)
                            .text_color(TEXT_PRIMARY)
                            .child("Share Track"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED)
                            .child(format!("Grant decrypt access for \"{}\"", track_title)),
                    )
                    .child(
                        div()
                            .h(px(44.))
                            .rounded_full()
                            .bg(BG_HOVER)
                            .px_3()
                            .flex()
                            .items_center()
                            .child(
                                div().flex_1().child(
                                    Input::new(&self.share_wallet_input_state)
                                        .appearance(false)
                                        .cleanable(false),
                                ),
                            ),
                    )
                    .when_some(self.share_modal_error.clone(), |el: Div, err| {
                        el.child(div().text_color(hsla(0., 0.7, 0.6, 1.)).child(err))
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("share-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_share_modal(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("share-submit-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(ACCENT_BLUE)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.submit_share_modal(cx);
                                    }))
                                    .child(div().text_color(hsla(0., 0., 0.09, 1.)).child(
                                        if self.share_modal_submitting {
                                            "Sharing..."
                                        } else {
                                            "Share"
                                        },
                                    )),
                            ),
                    ),
            )
    }

    fn render_playlist_modal(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let track_title = self
            .playlist_modal_track_index
            .and_then(|i| self.tracks.get(i))
            .map(|t| t.title.clone())
            .unwrap_or_else(|| "Selected track".to_string());

        let mut playlists_list = div().v_flex().gap_2();
        if self.playlist_modal_loading {
            playlists_list = playlists_list.child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED)
                    .child("Loading your playlists..."),
            );
        } else if self.playlist_modal_playlists.is_empty() {
            playlists_list = playlists_list.child(
                div()
                    .text_sm()
                    .text_color(TEXT_MUTED)
                    .child("No playlists yet. Enter a name below to create one."),
            );
        } else {
            for playlist in &self.playlist_modal_playlists {
                let playlist_id = playlist.id.clone();
                let playlist_id_for_click = playlist_id.clone();
                let is_selected = self
                    .playlist_modal_selected_playlist_id
                    .as_deref()
                    .map(|v| v.eq_ignore_ascii_case(&playlist_id))
                    .unwrap_or(false);
                let row_bg = if is_selected { BG_HOVER } else { BG_HIGHLIGHT };
                playlists_list = playlists_list.child(
                    div()
                        .id(ElementId::Name(
                            format!("playlist-select-{}", playlist_id).into(),
                        ))
                        .h_flex()
                        .items_center()
                        .justify_between()
                        .gap_3()
                        .px_3()
                        .py_2()
                        .rounded(px(8.))
                        .bg(row_bg)
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _, _window, cx| {
                            this.playlist_modal_selected_playlist_id =
                                Some(playlist_id_for_click.clone());
                            this.playlist_modal_error = None;
                            this.submit_playlist_modal(cx);
                        }))
                        .child(
                            div()
                                .v_flex()
                                .min_w_0()
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(TEXT_PRIMARY)
                                        .truncate()
                                        .child(playlist.name.clone()),
                                )
                                .child(div().text_xs().text_color(TEXT_MUTED).truncate().child(
                                    format!("{} track(s) • click to add", playlist.track_count),
                                )),
                        )
                        .child(div().text_xs().text_color(TEXT_DIM).child(
                            match playlist.visibility {
                                0 => "Public",
                                1 => "Unlisted",
                                2 => "Private",
                                _ => "Custom",
                            },
                        )),
                );
            }
        }

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.55))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .relative()
                    .w(px(620.))
                    .max_w(px(700.))
                    .mx_4()
                    .rounded(px(14.))
                    .bg(BG_ELEVATED)
                    .border_1()
                    .border_color(BORDER_SUBTLE)
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::BOLD)
                            .text_color(TEXT_PRIMARY)
                            .child("Add To Playlist"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED)
                            .child(format!("Selected track: \"{}\"", track_title)),
                    )
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .flex_1()
                                    .h(px(40.))
                                    .rounded_full()
                                    .bg(BG_HOVER)
                                    .px_3()
                                    .flex()
                                    .items_center()
                                    .child(
                                        Input::new(&self.playlist_name_input_state)
                                            .appearance(false)
                                            .cleanable(false),
                                    ),
                            )
                            .child(
                                div()
                                    .id("playlist-modal-refresh-btn")
                                    .px_3()
                                    .h(px(36.))
                                    .rounded_full()
                                    .bg(BG_HOVER)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.fetch_playlists_for_modal(cx);
                                    }))
                                    .child(
                                        div().text_sm().text_color(TEXT_PRIMARY).child("Refresh"),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .max_h(px(220.))
                            .overflow_hidden()
                            .child(playlists_list),
                    )
                    .when_some(self.playlist_modal_error.clone(), |el: Div, err| {
                        el.child(div().text_color(hsla(0., 0.7, 0.6, 1.)).child(err))
                    })
                    .when(self.playlist_modal_needs_reauth, |el| {
                        el.child(
                            div().h_flex().items_center().justify_end().child(
                                div()
                                    .id("playlist-modal-reauth-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(ACCENT_BLUE)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.trigger_playlist_modal_reauth(cx);
                                    }))
                                    .child(div().text_color(hsla(0., 0., 0.09, 1.)).child(
                                        if self.playlist_modal_reauth_busy {
                                            "Signing in..."
                                        } else {
                                            "Sign in again"
                                        },
                                    )),
                            ),
                        )
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("playlist-modal-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_playlist_modal(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("playlist-modal-create-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(BG_HOVER)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.submit_playlist_modal_create(cx);
                                    }))
                                    .child(div().text_color(TEXT_PRIMARY).child(
                                        if self.playlist_modal_submitting {
                                            "Working..."
                                        } else {
                                            "Create"
                                        },
                                    )),
                            ),
                    ),
            )
    }
}

impl Render for LibraryView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.mode == LibraryMode::SharedWithMe {
            let current_grantee = auth::load_from_disk()
                .and_then(|a| a.pkp_address)
                .unwrap_or_default()
                .to_lowercase();
            if self.shared_records_for.as_deref() != Some(current_grantee.as_str()) {
                self.refresh_shared_records_for_auth(cx);
            }
            let entity = cx.entity().clone();
            return render_shared_with_me_page(
                self.shared_records.clone(),
                self.shared_play_busy,
                entity,
                cx,
            )
            .into_any_element();
        }

        let container = div()
            .id("library-root")
            .v_flex()
            .flex_1()
            .size_full()
            .overflow_hidden();

        // No folder selected — empty state
        if self.folder.is_none() && !self.loading {
            return container
                .items_center()
                .justify_center()
                .child(
                    div()
                        .v_flex()
                        .items_center()
                        .gap_4()
                        .child(
                            gpui::svg()
                                .path("icons/music-notes.svg")
                                .size(px(64.))
                                .text_color(TEXT_DIM),
                        )
                        .child(
                            div()
                                .text_xl()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(TEXT_PRIMARY)
                                .child("Your Library"),
                        )
                        .child(
                            div()
                                .text_color(TEXT_MUTED)
                                .child("Select a folder to start playing your music"),
                        )
                        .child(
                            div()
                                .id("browse-btn")
                                .h_flex()
                                .items_center()
                                .gap_2()
                                .px_5()
                                .py(px(10.))
                                .rounded_full()
                                .bg(ACCENT_BLUE)
                                .cursor_pointer()
                                .on_click(cx.listener(|this, _, _window, cx| {
                                    this.browse_folder(cx);
                                }))
                                .child(
                                    gpui::svg()
                                        .path("icons/folder-open.svg")
                                        .size(px(18.))
                                        .text_color(hsla(0., 0., 0.09, 1.)),
                                )
                                .child(
                                    div()
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(hsla(0., 0., 0.09, 1.))
                                        .child("Choose Folder"),
                                ),
                        ),
                )
                .into_any_element();
        }

        if let Some(err) = &self.error {
            return container
                .items_center()
                .justify_center()
                .child(
                    div()
                        .v_flex()
                        .items_center()
                        .gap_2()
                        .child(div().text_color(TEXT_MUTED).child("Error"))
                        .child(div().text_xs().text_color(TEXT_DIM).child(err.clone())),
                )
                .into_any_element();
        }

        let detail_route = self.detail_route.clone();
        if !matches!(detail_route, LibraryDetailRoute::Root) {
            return render_library_detail_page(
                detail_route,
                self.tracks.clone(),
                self.active_track_path.clone(),
                self.upload_busy,
                self.detail_loading,
                self.detail_error.clone(),
                self.artist_cloud_stats.clone(),
                self.album_cloud_stats.clone(),
                cx.entity().clone(),
                cx,
            )
            .into_any_element();
        }

        let folder_display = self
            .folder
            .as_deref()
            .and_then(|f| f.rsplit('/').next())
            .unwrap_or("Library")
            .to_string();

        let count = self.total_count;
        let loaded = self.tracks.len();
        let scanning = self.scanning;
        let scan_progress = self.scan_progress.clone();
        let loading = self.loading;
        let active_track_path = self.active_track_path.clone();
        let total_rows = self.filtered_indices.len();
        let upload_busy = self.upload_busy;
        let status_message = self.status_message.clone();
        let storage_balance = self.storage_balance.clone();
        let storage_monthly = self.storage_monthly.clone();
        let storage_days = self.storage_days;
        let storage_loading = self.storage_loading;
        let add_funds_busy = self.add_funds_busy;
        let sort_state = self.sort_state;
        let search_query = self.search_query.clone();
        let filtered_count = self.filtered_indices.len();

        // Clone snapshots + entity handle for the list closure
        let tracks_snapshot = self.tracks.clone();
        let filtered_indices_snapshot = self.filtered_indices.clone();
        let entity = cx.entity().clone();

        container
            // Hero header
            .child(render_hero(
                &folder_display,
                count,
                loaded,
                scanning,
                loading,
                scan_progress.as_ref(),
                status_message.as_deref(),
                storage_balance.as_deref(),
                storage_monthly.as_deref(),
                storage_days,
                storage_loading,
                add_funds_busy,
                cx,
            ))
            .child(div().px_4().py_3().child(render_library_search_bar(
                &self.library_search_input_state,
                &search_query,
                filtered_count,
                loaded,
            )))
            // Column header (fixed at top of track area)
            .child(render_table_header(sort_state, true, cx))
            .child(if total_rows == 0 && !search_query.trim().is_empty() {
                div()
                    .flex_1()
                    .v_flex()
                    .items_center()
                    .justify_center()
                    .gap_2()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(TEXT_PRIMARY)
                            .child("No matching tracks"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(TEXT_MUTED)
                            .child("Try a different title, artist, or album."),
                    )
                    .into_any_element()
            } else {
                // Virtualized track rows
                uniform_list("track-list", total_rows, move |range, _window, _cx| {
                    let mut items = Vec::new();
                    for row in range {
                        let Some(track_index) = filtered_indices_snapshot.get(row).copied() else {
                            continue;
                        };
                        if let Some(track) = tracks_snapshot.get(track_index) {
                            let is_active =
                                active_track_path.as_deref() == Some(track.file_path.as_str());
                            let ent = entity.clone();
                            items.push(render_track_row(
                                track,
                                track_index,
                                row + 1,
                                filtered_indices_snapshot.clone(),
                                is_active,
                                upload_busy,
                                ent,
                            ));
                        }
                    }
                    items
                })
                .flex_1()
                .w_full()
                .into_any_element()
            })
            .when(self.playlist_modal_open, |el| {
                el.child(self.render_playlist_modal(cx))
            })
            .when(self.share_modal_open, |el| {
                el.child(self.render_share_modal(cx))
            })
            .into_any_element()
    }
}

// =============================================================================
// Library detail pages
// =============================================================================

fn render_library_detail_page(
    route: LibraryDetailRoute,
    tracks: Arc<Vec<TrackRow>>,
    active_track_path: Option<String>,
    upload_busy: bool,
    detail_loading: bool,
    detail_error: Option<String>,
    artist_cloud_stats: Option<ArtistCloudStats>,
    album_cloud_stats: Option<AlbumCloudStats>,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    match route {
        LibraryDetailRoute::Root => div().into_any_element(),
        LibraryDetailRoute::Artist { artist } => render_artist_detail_page(
            artist,
            tracks,
            active_track_path,
            upload_busy,
            detail_loading,
            detail_error,
            artist_cloud_stats,
            entity,
            cx,
        )
        .into_any_element(),
        LibraryDetailRoute::Album { artist, album } => render_album_detail_page(
            artist,
            album,
            tracks,
            active_track_path,
            upload_busy,
            detail_loading,
            detail_error,
            album_cloud_stats,
            entity,
            cx,
        )
        .into_any_element(),
    }
}

fn render_detail_header(
    page_kind: &str,
    title: &str,
    subtitle: &str,
    back_button_id: &'static str,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    div()
        .w_full()
        .px_6()
        .pt_8()
        .pb_6()
        .bg(HERO_BG)
        .v_flex()
        .gap_3()
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_3()
                .child(
                    div()
                        .id(back_button_id)
                        .h_flex()
                        .items_center()
                        .gap(px(6.))
                        .px_3()
                        .py(px(7.))
                        .rounded_full()
                        .bg(hsla(0., 0., 1., 0.15))
                        .cursor_pointer()
                        .hover(|s| s.bg(hsla(0., 0., 1., 0.22)))
                        .on_click(move |_, _, cx| {
                            let _ = entity.update(cx, |this, cx| {
                                this.navigate_back_from_detail(cx);
                            });
                        })
                        .child(
                            gpui::svg()
                                .path("icons/arrow-left.svg")
                                .size(px(14.))
                                .text_color(TEXT_PRIMARY),
                        )
                        .child(
                            div()
                                .text_sm()
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(TEXT_PRIMARY)
                                .child("Back"),
                        ),
                )
                .child(
                    div()
                        .text_xs()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(hsla(0., 0., 0.83, 1.))
                        .child(format!("{} PAGE", page_kind)),
                ),
        )
        .child(
            div()
                .text_2xl()
                .font_weight(FontWeight::BOLD)
                .text_color(TEXT_PRIMARY)
                .child(title.to_string()),
        )
        .child(
            div()
                .text_sm()
                .text_color(hsla(0., 0., 0.85, 1.))
                .child(subtitle.to_string()),
        )
}

fn render_artist_detail_page(
    artist: String,
    tracks: Arc<Vec<TrackRow>>,
    active_track_path: Option<String>,
    upload_busy: bool,
    detail_loading: bool,
    detail_error: Option<String>,
    cloud_stats: Option<ArtistCloudStats>,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let artist_key = normalize_lookup_key(&artist);
    let cloud_title = cloud_stats
        .as_ref()
        .map(|stats| sanitize_detail_value(stats.title.clone(), "Unknown Artist"));
    let artist_display = cloud_title.unwrap_or_else(|| artist.clone());
    let mut artist_indices: Vec<usize> = tracks
        .iter()
        .enumerate()
        .filter(|(_, track)| normalize_lookup_key(&track.artist) == artist_key)
        .map(|(index, _)| index)
        .collect();

    let track_scrobbles = cloud_stats
        .as_ref()
        .map(|stats| stats.track_scrobbles.clone())
        .unwrap_or_default();
    artist_indices.sort_unstable_by(|a, b| {
        let scrobble_cmp = track_scrobbles
            .get(&tracks[*b].id)
            .unwrap_or(&0)
            .cmp(track_scrobbles.get(&tracks[*a].id).unwrap_or(&0));
        if scrobble_cmp != Ordering::Equal {
            return scrobble_cmp;
        }
        cmp_case_insensitive(&tracks[*a].album, &tracks[*b].album)
            .then_with(|| cmp_case_insensitive(&tracks[*a].title, &tracks[*b].title))
            .then_with(|| tracks[*a].file_path.cmp(&tracks[*b].file_path))
    });

    let album_count = artist_indices
        .iter()
        .filter_map(|index| {
            let album = tracks[*index].album.trim();
            if album.is_empty() {
                None
            } else {
                Some(normalize_lookup_key(album))
            }
        })
        .collect::<HashSet<_>>()
        .len();
    let total_duration_sec: u64 = artist_indices
        .iter()
        .map(|index| parse_duration_seconds(&tracks[*index].duration))
        .sum();
    let subtitle = if let Some(stats) = cloud_stats.as_ref() {
        format!(
            "{} tracks • {} scrobbles • {} listeners",
            artist_indices.len(),
            stats.total_scrobbles,
            stats.unique_listeners
        )
    } else if artist_indices.is_empty() {
        "No tracks by this artist in your library yet.".to_string()
    } else {
        format!(
            "{} tracks • {} albums • {} total",
            artist_indices.len(),
            album_count,
            format_compact_duration(total_duration_sec)
        )
    };
    let hero_cover_path = cloud_stats
        .as_ref()
        .and_then(|stats| stats.image_path.clone())
        .or_else(|| {
            artist_indices.iter().find_map(|index| {
                tracks
                    .get(*index)
                    .and_then(|track| track.cover_path.as_ref())
                    .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
                    .cloned()
            })
        });

    let row_count = artist_indices.len();
    let row_indices = Arc::new(artist_indices);
    let tracks_snapshot = tracks.clone();
    let row_indices_for_list = row_indices.clone();
    let active_track_path_for_list = active_track_path.clone();
    let entity_for_list = entity.clone();

    div()
        .id("library-root")
        .v_flex()
        .flex_1()
        .size_full()
        .overflow_hidden()
        .child(render_detail_header(
            "Artist",
            &artist_display,
            &subtitle,
            "artist-detail-back",
            entity.clone(),
        ))
        .child(
            div()
                .px_6()
                .pt_4()
                .pb_4()
                .h_flex()
                .items_center()
                .gap_4()
                .child(render_large_album_art(&hero_cover_path, 120.))
                .child(
                    div()
                        .v_flex()
                        .gap_1()
                        .child(
                            div()
                                .text_sm()
                                .text_color(TEXT_MUTED)
                                .child(if detail_loading {
                                    "Loading Cloudflare stats...".to_string()
                                } else if let Some(stats) = cloud_stats.as_ref() {
                                    format!(
                                        "{} scrobbles • {} listeners",
                                        stats.total_scrobbles, stats.unique_listeners
                                    )
                                } else {
                                    "Cloud stats unavailable".to_string()
                                }),
                        )
                        .when_some(detail_error.clone(), |el: Div, err| {
                            el.child(div().text_xs().text_color(TEXT_AMBER).child(format!(
                                "Cloud stats error: {}",
                                summarize_status_error(&err)
                            )))
                        }),
                ),
        )
        .child(if row_count == 0 {
            div()
                .flex_1()
                .v_flex()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY).child("No tracks found"))
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .child("Scan or rescan your folder to populate artist pages."),
                )
                .into_any_element()
        } else {
            div()
                .v_flex()
                .flex_1()
                .child(render_table_header(None, false, cx))
                .child(
                    uniform_list(
                        "artist-detail-track-list",
                        row_count,
                        move |range, _window, _cx| {
                            let mut items = Vec::new();
                            for row in range {
                                let Some(track_index) = row_indices_for_list.get(row).copied()
                                else {
                                    continue;
                                };
                                if let Some(track) = tracks_snapshot.get(track_index) {
                                    let is_active = active_track_path_for_list.as_deref()
                                        == Some(track.file_path.as_str());
                                    items.push(render_track_row(
                                        track,
                                        track_index,
                                        row + 1,
                                        row_indices_for_list.clone(),
                                        is_active,
                                        upload_busy,
                                        entity_for_list.clone(),
                                    ));
                                }
                            }
                            items
                        },
                    )
                    .flex_1()
                    .w_full(),
                )
                .into_any_element()
        })
}

fn render_album_detail_page(
    artist: String,
    album: String,
    tracks: Arc<Vec<TrackRow>>,
    active_track_path: Option<String>,
    upload_busy: bool,
    detail_loading: bool,
    detail_error: Option<String>,
    cloud_stats: Option<AlbumCloudStats>,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let artist_display = cloud_stats
        .as_ref()
        .map(|stats| sanitize_detail_value(stats.artist.clone(), "Unknown Artist"))
        .unwrap_or_else(|| sanitize_detail_value(artist.clone(), "Unknown Artist"));
    let album_display = cloud_stats
        .as_ref()
        .map(|stats| sanitize_detail_value(stats.title.clone(), "Unknown Album"))
        .unwrap_or_else(|| sanitize_detail_value(album.clone(), "Unknown Album"));
    let artist_key = normalize_lookup_key(&artist_display);
    let album_key = normalize_lookup_key(&album);
    let mut album_indices: Vec<usize> = tracks
        .iter()
        .enumerate()
        .filter(|(_, track)| {
            normalize_lookup_key(&track.artist) == artist_key
                && normalize_lookup_key(&track.album) == album_key
        })
        .map(|(index, _)| index)
        .collect();

    let track_scrobbles = cloud_stats
        .as_ref()
        .map(|stats| stats.track_scrobbles.clone())
        .unwrap_or_default();
    album_indices.sort_unstable_by(|a, b| {
        let scrobble_cmp = track_scrobbles
            .get(&tracks[*b].id)
            .unwrap_or(&0)
            .cmp(track_scrobbles.get(&tracks[*a].id).unwrap_or(&0));
        if scrobble_cmp != Ordering::Equal {
            return scrobble_cmp;
        }
        cmp_case_insensitive(&tracks[*a].title, &tracks[*b].title)
            .then_with(|| tracks[*a].file_path.cmp(&tracks[*b].file_path))
    });

    let total_duration_sec: u64 = album_indices
        .iter()
        .map(|index| parse_duration_seconds(&tracks[*index].duration))
        .sum();
    let subtitle = if let Some(stats) = cloud_stats.as_ref() {
        format!(
            "by {} • {} tracks • {} scrobbles • {} listeners",
            artist_display,
            album_indices.len(),
            stats.total_scrobbles,
            stats.unique_listeners
        )
    } else if album_indices.is_empty() {
        format!("by {}", artist_display)
    } else {
        format!(
            "by {} • {} tracks • {} total",
            artist_display,
            album_indices.len(),
            format_compact_duration(total_duration_sec)
        )
    };
    let hero_cover_path = cloud_stats
        .as_ref()
        .and_then(|stats| stats.image_path.clone())
        .or_else(|| {
            album_indices.iter().find_map(|index| {
                tracks
                    .get(*index)
                    .and_then(|track| track.cover_path.as_ref())
                    .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
                    .cloned()
            })
        });

    let row_count = album_indices.len();
    let row_indices = Arc::new(album_indices);
    let tracks_snapshot = tracks.clone();
    let row_indices_for_list = row_indices.clone();
    let active_track_path_for_list = active_track_path.clone();
    let entity_for_list = entity.clone();

    div()
        .id("library-root")
        .v_flex()
        .flex_1()
        .size_full()
        .overflow_hidden()
        .child(render_detail_header(
            "Album",
            &album_display,
            &subtitle,
            "album-detail-back",
            entity.clone(),
        ))
        .child(
            div()
                .px_6()
                .pt_4()
                .pb_4()
                .h_flex()
                .items_center()
                .gap_4()
                .child(render_large_album_art(&hero_cover_path, 120.))
                .child(
                    div()
                        .v_flex()
                        .gap_1()
                        .child(
                            div()
                                .text_sm()
                                .text_color(TEXT_MUTED)
                                .child(if detail_loading {
                                    "Loading Cloudflare stats...".to_string()
                                } else if let Some(stats) = cloud_stats.as_ref() {
                                    format!(
                                        "{} scrobbles • {} listeners",
                                        stats.total_scrobbles, stats.unique_listeners
                                    )
                                } else {
                                    "Cloud stats unavailable".to_string()
                                }),
                        )
                        .when_some(detail_error.clone(), |el: Div, err| {
                            el.child(div().text_xs().text_color(TEXT_AMBER).child(format!(
                                "Cloud stats error: {}",
                                summarize_status_error(&err)
                            )))
                        }),
                ),
        )
        .child(if row_count == 0 {
            div()
                .flex_1()
                .v_flex()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY).child("No tracks found"))
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .child("This album has no tracks in your local library."),
                )
                .into_any_element()
        } else {
            div()
                .v_flex()
                .flex_1()
                .child(render_table_header(None, false, cx))
                .child(
                    uniform_list(
                        "album-detail-track-list",
                        row_count,
                        move |range, _window, _cx| {
                            let mut items = Vec::new();
                            for row in range {
                                let Some(track_index) = row_indices_for_list.get(row).copied()
                                else {
                                    continue;
                                };
                                if let Some(track) = tracks_snapshot.get(track_index) {
                                    let is_active = active_track_path_for_list.as_deref()
                                        == Some(track.file_path.as_str());
                                    items.push(render_track_row(
                                        track,
                                        track_index,
                                        row + 1,
                                        row_indices_for_list.clone(),
                                        is_active,
                                        upload_busy,
                                        entity_for_list.clone(),
                                    ));
                                }
                            }
                            items
                        },
                    )
                    .flex_1()
                    .w_full(),
                )
                .into_any_element()
        })
}

// =============================================================================
// Hero header
// =============================================================================

fn render_hero(
    title: &str,
    count: i64,
    loaded: usize,
    scanning: bool,
    loading: bool,
    progress: Option<&ScanProgress>,
    status_message: Option<&str>,
    storage_balance: Option<&str>,
    storage_monthly: Option<&str>,
    storage_days: Option<i64>,
    storage_loading: bool,
    add_funds_busy: bool,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let subtitle = if scanning {
        match progress {
            Some(p) if p.total > 0 => format!("Scanning... {}/{} files", p.done, p.total),
            Some(_) => "Discovering files...".to_string(),
            None => "Scanning...".to_string(),
        }
    } else if loading {
        format!("Loading... {}/{} tracks", loaded, count)
    } else {
        format!("{} tracks in {}", count, title)
    };

    let mut hero = div()
        .w_full()
        .px_6()
        .pt_8()
        .pb_6()
        .bg(HERO_BG)
        .v_flex()
        .gap_4()
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .text_2xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .child("Library"),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.85, 1.))
                        .child(subtitle),
                ),
        )
        .child(
            div()
                .h_flex()
                .gap_2()
                .child(hero_button(
                    "play-all",
                    "icons/play-fill.svg",
                    "Play All",
                    true,
                    cx.listener(|this, _, _w, cx| {
                        this.play_all(cx);
                        cx.notify();
                    }),
                ))
                .child(hero_button_passive(
                    "shuffle",
                    "icons/shuffle.svg",
                    "Shuffle",
                ))
                .child(hero_button(
                    "pick-folder",
                    "icons/folder-open.svg",
                    "Pick Folder",
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.browse_folder(cx);
                    }),
                ))
                .child(hero_button(
                    "rescan",
                    "icons/sort-ascending.svg",
                    "Rescan",
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.rescan(cx);
                    }),
                ))
                .child(hero_button(
                    "add-funds",
                    "icons/wallet.svg",
                    if add_funds_busy {
                        "Checking..."
                    } else {
                        "Funding Check"
                    },
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.add_funds(cx);
                    }),
                )),
        )
        // Storage stats bar
        .child(render_storage_stats(
            storage_balance,
            storage_monthly,
            storage_days,
            storage_loading,
        ));

    if let Some(status) = status_message.filter(|s| !s.is_empty()) {
        hero = hero.child(
            div()
                .text_sm()
                .text_color(hsla(0., 0., 0.87, 1.))
                .child(status.to_string()),
        );
    }

    hero
}

fn hero_button(
    id: &'static str,
    icon: &'static str,
    label: &'static str,
    primary: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let (bg, text_color) = if primary {
        (TEXT_PRIMARY, hsla(0., 0., 0.09, 1.))
    } else {
        (hsla(0., 0., 1., 0.15), TEXT_PRIMARY)
    };

    div()
        .id(ElementId::Name(id.into()))
        .h_flex()
        .items_center()
        .gap(px(6.))
        .px_4()
        .py(px(8.))
        .rounded_full()
        .bg(bg)
        .cursor_pointer()
        .on_click(move |ev, window, cx| on_click(ev, window, cx))
        .child(gpui::svg().path(icon).size(px(16.)).text_color(text_color))
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(text_color)
                .child(label),
        )
}

fn hero_button_passive(
    id: &'static str,
    icon: &'static str,
    label: &'static str,
) -> impl IntoElement {
    div()
        .id(ElementId::Name(id.into()))
        .h_flex()
        .items_center()
        .gap(px(6.))
        .px_4()
        .py(px(8.))
        .rounded_full()
        .bg(hsla(0., 0., 1., 0.15))
        .cursor_pointer()
        .child(
            gpui::svg()
                .path(icon)
                .size(px(16.))
                .text_color(TEXT_PRIMARY),
        )
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::MEDIUM)
                .text_color(TEXT_PRIMARY)
                .child(label),
        )
}

// =============================================================================
// Storage stats bar
// =============================================================================

fn render_storage_stats(
    balance: Option<&str>,
    monthly: Option<&str>,
    days: Option<i64>,
    loading: bool,
) -> impl IntoElement {
    if loading {
        return div()
            .h_flex()
            .px_6()
            .py_2()
            .child(
                div()
                    .text_color(TEXT_MUTED)
                    .child("Loading storage status..."),
            )
            .into_any_element();
    }

    let balance_str = balance.unwrap_or("--");
    let monthly_str = monthly.unwrap_or("--");
    let days_str = days
        .map(|d| d.to_string())
        .unwrap_or_else(|| "--".to_string());

    let days_color = match days {
        Some(d) if d > 30 => TEXT_GREEN,
        Some(d) if d > 0 => TEXT_AMBER,
        Some(_) => TEXT_AMBER,
        None => TEXT_MUTED,
    };

    div()
        .h_flex()
        .items_center()
        .gap_3()
        .px_6()
        .pb_2()
        .bg(HERO_BG)
        // Balance
        .child(
            div()
                .h_flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(TEXT_PRIMARY)
                        .child(balance_str.to_string()),
                )
                .child(div().text_color(TEXT_MUTED).child("Balance")),
        )
        // Separator
        .child(div().text_color(TEXT_DIM).child("|"))
        // Monthly
        .child(
            div()
                .h_flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(TEXT_PRIMARY)
                        .child(monthly_str.to_string()),
                )
                .child(div().text_color(TEXT_MUTED).child("Monthly")),
        )
        // Separator
        .child(div().text_color(TEXT_DIM).child("|"))
        // Days Left
        .child(
            div()
                .h_flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(days_color)
                        .child(days_str),
                )
                .child(div().text_color(TEXT_MUTED).child("Days Left")),
        )
        .into_any_element()
}

fn render_library_search_bar(
    input_state: &Entity<InputState>,
    search_query: &str,
    filtered_count: usize,
    total_count: usize,
) -> impl IntoElement {
    let result_label = if search_query.trim().is_empty() {
        format!("{} tracks", total_count)
    } else if filtered_count == 0 {
        "No results".to_string()
    } else {
        format!("{} results", filtered_count)
    };

    div()
        .h_flex()
        .w_full()
        .items_center()
        .gap_3()
        .child(
            div()
                .h(px(40.))
                .flex_1()
                .rounded_full()
                .bg(BG_ELEVATED)
                .px_3()
                .flex()
                .items_center()
                .gap_2()
                .child(
                    gpui::svg()
                        .path("icons/magnifying-glass.svg")
                        .size(px(14.))
                        .text_color(TEXT_DIM),
                )
                .child(
                    div()
                        .flex_1()
                        .child(Input::new(input_state).appearance(false).cleanable(false)),
                ),
        )
        .child(div().text_sm().text_color(TEXT_MUTED).child(result_label))
}

// =============================================================================
// Table header
// =============================================================================

fn sort_indicator(
    sort_state: Option<LibrarySortState>,
    field: LibrarySortField,
) -> Option<&'static str> {
    match sort_state {
        Some(state) if state.field == field => Some(match state.direction {
            LibrarySortDirection::Asc => "▲",
            LibrarySortDirection::Desc => "▼",
        }),
        _ => None,
    }
}

fn render_table_header(
    sort_state: Option<LibrarySortState>,
    sortable: bool,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let title_cell = {
        let cell = div()
            .flex_1()
            .min_w_0()
            .h_flex()
            .items_center()
            .gap_1()
            .child("TITLE")
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Title),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-title")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Title, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let artist_cell = {
        let cell = div()
            .w(px(ARTIST_COLUMN_WIDTH))
            .mr_2()
            .min_w_0()
            .h_flex()
            .items_center()
            .gap_1()
            .child("ARTIST")
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Artist),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-artist")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Artist, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let album_cell = {
        let cell = div()
            .w(px(ALBUM_COLUMN_WIDTH))
            .min_w_0()
            .h_flex()
            .items_center()
            .gap_1()
            .child("ALBUM")
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Album),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-album")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Album, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    let duration_cell = {
        let cell = div()
            .w(px(52.))
            .h_flex()
            .items_center()
            .justify_end()
            .gap_1()
            .child(
                gpui::svg()
                    .path("icons/clock.svg")
                    .size(px(14.))
                    .text_color(TEXT_DIM),
            )
            .when_some(
                sort_indicator(sort_state, LibrarySortField::Duration),
                |el: Div, arrow| el.child(div().text_xs().text_color(TEXT_MUTED).child(arrow)),
            );
        if sortable {
            cell.id("library-sort-duration")
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY))
                .on_click(cx.listener(|this, _, _window, cx| {
                    this.cycle_sort(LibrarySortField::Duration, cx);
                }))
                .into_any_element()
        } else {
            cell.into_any_element()
        }
    };

    div()
        .h_flex()
        .w_full()
        .h(px(HEADER_HEIGHT))
        .px_4()
        .items_center()
        .border_b_1()
        .border_color(BORDER_SUBTLE)
        .text_xs()
        .text_color(TEXT_DIM)
        .font_weight(FontWeight::MEDIUM)
        .child(div().w(px(48.)).child("#"))
        .child(title_cell)
        .child(artist_cell)
        .child(album_cell)
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(duration_cell)
                // Spacer matching the three-dot column
                .child(div().w(px(36.))),
        )
}

// =============================================================================
// Track row — used by uniform_list, receives entity handle for click dispatch
// =============================================================================

fn render_track_row(
    track: &TrackRow,
    track_index: usize,
    row_number: usize,
    playback_context_indices: Arc<Vec<usize>>,
    is_active: bool,
    upload_busy: bool,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    let row_id = ElementId::Name(format!("track-{}", track_index).into());
    let group_name: SharedString = format!("track-row-{}", track_index).into();
    let title_color = if is_active { ACCENT_BLUE } else { TEXT_PRIMARY };
    let row_bg = if is_active {
        BG_HIGHLIGHT
    } else {
        Hsla {
            h: 0.,
            s: 0.,
            l: 0.,
            a: 0.,
        }
    };

    let g = group_name.clone();
    let g2 = group_name.clone();

    let play_entity = entity.clone();
    let queue_entity = entity.clone();
    let playlist_entity = entity.clone();
    let artist_entity_for_cell = entity.clone();
    let artist_entity_for_menu = entity.clone();
    let album_entity_for_cell = entity.clone();
    let album_entity_for_menu = entity.clone();
    let share_entity = entity.clone();
    let upload_entity = entity;

    let queue_title = track.title.clone();
    let artist_name = track.artist.clone();
    let album_name = track.album.clone();
    let artist_name_for_artist_cell = artist_name.clone();
    let artist_name_for_album_cell = artist_name.clone();
    let artist_name_for_artist_menu = artist_name.clone();
    let artist_name_for_album_menu = artist_name.clone();
    let album_name_for_album_cell = album_name.clone();
    let album_name_for_album_menu = album_name.clone();
    let upload_track = track.clone();

    div()
        .id(row_id)
        .group(group_name.clone())
        .h_flex()
        .w_full()
        .h(px(ROW_HEIGHT))
        .px_4()
        .items_center()
        .cursor_pointer()
        .bg(row_bg)
        .hover(|s| s.bg(BG_HOVER))
        .on_click(move |ev, _window, cx| {
            // Double-click to play
            let is_double = match ev {
                ClickEvent::Mouse(m) => m.down.click_count == 2,
                _ => false,
            };
            if is_double {
                play_entity.update(cx, |this, cx| {
                    this.play_track_in_visible_context(
                        track_index,
                        playback_context_indices.as_ref(),
                        cx,
                    );
                    cx.notify();
                });
            }
        })
        // # column — shows track number normally, play icon on hover
        .child(
            div()
                .w(px(48.))
                .h_flex()
                .items_center()
                .relative()
                .child(if is_active {
                    // Active track always shows play icon
                    gpui::svg()
                        .path("icons/play-fill.svg")
                        .size(px(14.))
                        .text_color(ACCENT_BLUE)
                        .into_any_element()
                } else {
                    // Show number at rest, play icon on hover
                    div()
                        .h_flex()
                        .items_center()
                        .w_full()
                        .child(
                            // Track number — visible at rest, hidden on hover
                            div()
                                .text_sm()
                                .text_color(TEXT_DIM)
                                .group_hover(g.clone(), |s| s.opacity(0.))
                                .child(format!("{}", row_number)),
                        )
                        .child(
                            // Play icon — hidden at rest, visible on hover
                            div()
                                .absolute()
                                .left_0()
                                .opacity(0.)
                                .group_hover(g, |s| s.opacity(1.))
                                .child(
                                    gpui::svg()
                                        .path("icons/play-fill.svg")
                                        .size(px(14.))
                                        .text_color(TEXT_PRIMARY),
                                ),
                        )
                        .into_any_element()
                }),
        )
        // Title + album art
        .child(
            div()
                .h_flex()
                .flex_1()
                .min_w_0()
                .gap_3()
                .items_center()
                .overflow_hidden()
                .child(render_album_art_thumbnail(&track.cover_path))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(title_color)
                        .child(track.title.clone()),
                ),
        )
        // Artist
        .child(
            div()
                .id(("track-artist-link", track_index))
                .w(px(ARTIST_COLUMN_WIDTH))
                .mr_2()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_SECONDARY)
                .truncate()
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_PRIMARY))
                .on_click(move |ev, _window, cx| {
                    let is_double = match ev {
                        ClickEvent::Mouse(m) => m.down.click_count == 2,
                        _ => false,
                    };
                    if is_double {
                        return;
                    }
                    let _ = artist_entity_for_cell.update(cx, |this, cx| {
                        this.open_artist_page(artist_name_for_artist_cell.clone(), cx);
                    });
                })
                .child(track.artist.clone()),
        )
        // Album
        .child(
            div()
                .id(("track-album-link", track_index))
                .w(px(ALBUM_COLUMN_WIDTH))
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_MUTED)
                .truncate()
                .cursor_pointer()
                .hover(|s| s.text_color(TEXT_SECONDARY))
                .on_click(move |ev, _window, cx| {
                    let is_double = match ev {
                        ClickEvent::Mouse(m) => m.down.click_count == 2,
                        _ => false,
                    };
                    if is_double {
                        return;
                    }
                    let _ = album_entity_for_cell.update(cx, |this, cx| {
                        this.open_album_page(
                            artist_name_for_album_cell.clone(),
                            album_name_for_album_cell.clone(),
                            cx,
                        );
                    });
                })
                .child(track.album.clone()),
        )
        // Duration + three-dot menu
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                // Duration
                .child(
                    div()
                        .w(px(52.))
                        .text_sm()
                        .text_color(if is_active { TEXT_PRIMARY } else { TEXT_MUTED })
                        .h_flex()
                        .justify_end()
                        .child(track.duration.clone()),
                )
                // Three-dot menu button — hidden at rest, visible on hover
                .child(track_row_overflow_menu(
                    ("dots", track_index),
                    g2,
                    false,
                    move |menu, _window, _cx| {
                        menu.item(PopupMenuItem::new("Add to playlist").on_click({
                            let playlist_entity = playlist_entity.clone();
                            move |_, _, cx| {
                                let _ = playlist_entity.update(cx, |this, cx| {
                                    this.open_playlist_modal(track_index, cx);
                                });
                            }
                        }))
                        .item(PopupMenuItem::new("Add to queue").on_click({
                            let queue_entity = queue_entity.clone();
                            let queue_title = queue_title.clone();
                            move |_, _, cx| {
                                let _ = queue_entity.update(cx, |this, cx| {
                                    this.set_status_message(
                                        format!(
                                            "Add to queue is not wired yet (\"{}\").",
                                            queue_title
                                        ),
                                        cx,
                                    );
                                });
                            }
                        }))
                        .item(PopupMenuItem::new("Go to artist").on_click({
                            let artist_entity = artist_entity_for_menu.clone();
                            let artist_name = artist_name_for_artist_menu.clone();
                            move |_, _, cx| {
                                let _ = artist_entity.update(cx, |this, cx| {
                                    this.open_artist_page(artist_name.clone(), cx);
                                });
                            }
                        }))
                        .item(PopupMenuItem::new("Go to album").on_click({
                            let album_entity = album_entity_for_menu.clone();
                            let artist_name = artist_name_for_album_menu.clone();
                            let album_name = album_name_for_album_menu.clone();
                            move |_, _, cx| {
                                let _ = album_entity.update(cx, |this, cx| {
                                    this.open_album_page(
                                        artist_name.clone(),
                                        album_name.clone(),
                                        cx,
                                    );
                                });
                            }
                        }))
                        .item(PopupMenuItem::new("Share with wallet...").on_click({
                            let share_entity = share_entity.clone();
                            move |_, _, cx| {
                                let _ = share_entity.update(cx, |this, cx| {
                                    this.open_share_modal(track_index, cx);
                                });
                            }
                        }))
                        .separator()
                        .item(
                            PopupMenuItem::new("Encrypt & Upload")
                                .disabled(upload_busy)
                                .on_click({
                                    let upload_entity = upload_entity.clone();
                                    let upload_track = upload_track.clone();
                                    move |_, _, cx| {
                                        let _ = upload_entity.update(cx, |this, cx| {
                                            this.encrypt_upload_track(upload_track.clone(), cx);
                                        });
                                    }
                                }),
                        )
                    },
                )),
        )
}

// =============================================================================
// Album art helpers
// =============================================================================

/// Render a 40x40 album art thumbnail. Shows cover image if available, else a music note icon.
fn render_album_art_thumbnail(cover_path: &Option<String>) -> impl IntoElement {
    let container = div()
        .size(px(40.))
        .rounded(px(6.))
        .bg(BG_ELEVATED)
        .flex_shrink_0()
        .overflow_hidden();

    match cover_path {
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => container.child(
            gpui::img(PathBuf::from(path))
                .size(px(40.))
                .object_fit(ObjectFit::Cover),
        ),
        _ => container.flex().items_center().justify_center().child(
            gpui::svg()
                .path("icons/music-note.svg")
                .size(px(16.))
                .text_color(TEXT_DIM),
        ),
    }
}

fn render_large_album_art(cover_path: &Option<String>, size: f32) -> impl IntoElement {
    let container = div()
        .size(px(size))
        .rounded(px(10.))
        .bg(BG_ELEVATED)
        .overflow_hidden()
        .flex_shrink_0();

    match cover_path {
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => container.child(
            gpui::img(PathBuf::from(path))
                .size(px(size))
                .object_fit(ObjectFit::Cover),
        ),
        _ => container.flex().items_center().justify_center().child(
            gpui::svg()
                .path("icons/music-note.svg")
                .size(px((size * 0.4).max(24.)))
                .text_color(TEXT_DIM),
        ),
    }
}

/// Render a large album art image for the side player. Returns the cover path if available.
pub fn get_active_cover_path(
    tracks: &[TrackRow],
    active_track_path: Option<&str>,
) -> Option<String> {
    active_track_path
        .and_then(|path| tracks.iter().find(|t| t.file_path == path))
        .and_then(|t| t.cover_path.clone())
        .filter(|p| !p.is_empty() && std::path::Path::new(p).exists())
}

fn cmp_case_insensitive(a: &str, b: &str) -> Ordering {
    a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase())
}

fn normalize_lookup_key(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn sanitize_detail_value(raw: String, fallback: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn format_compact_duration(total_seconds: u64) -> String {
    if total_seconds == 0 {
        return "0m".to_string();
    }
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{}s", seconds)
    }
}

fn fetch_artist_cloud_stats(artist: &str, tracks: &[TrackRow]) -> Result<ArtistCloudStats, String> {
    let escaped_artist = escape_gql(artist);
    let query = format!(
        "{{ tracks(where: {{ artist_contains_nocase: \"{}\" }}, first: 300, orderBy: registeredAt, orderDirection: desc) {{ id artist coverCid scrobbles(first: 1000) {{ id user }} }} }}",
        escaped_artist
    );
    let payload = http_post_json(
        &subgraph_activity_url(),
        serde_json::json!({ "query": query }),
    )?;
    let rows = payload
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let target_artist = normalize_artist_name(artist);
    let mut total_scrobbles = 0_usize;
    let mut listeners = HashSet::<String>::new();
    let mut track_scrobbles = HashMap::<String, usize>::new();
    let mut first_cover_cid: Option<String> = None;

    for row in rows {
        let row_artist = row
            .get("artist")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !artist_matches_target(row_artist, &target_artist) {
            continue;
        }

        let track_id = row
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let scrobbles = row
            .get("scrobbles")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let play_count = scrobbles.len();
        total_scrobbles += play_count;
        if !track_id.is_empty() {
            track_scrobbles.insert(track_id.to_string(), play_count);
        }
        for scrobble in scrobbles {
            if let Some(user) = scrobble.get("user").and_then(Value::as_str) {
                let user = user.trim().to_ascii_lowercase();
                if !user.is_empty() {
                    listeners.insert(user);
                }
            }
        }
        if first_cover_cid.is_none() {
            let cover_cid = row
                .get("coverCid")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim();
            if is_valid_cid(cover_cid) {
                first_cover_cid = Some(cover_cid.to_string());
            }
        }
    }

    let image_path = resolve_artist_image_path(artist, tracks, first_cover_cid.as_deref());

    Ok(ArtistCloudStats {
        title: artist.to_string(),
        total_scrobbles,
        unique_listeners: listeners.len(),
        image_path,
        track_scrobbles,
    })
}

fn fetch_album_cloud_stats(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
) -> Result<AlbumCloudStats, String> {
    let where_clause = if album.trim().is_empty() {
        format!(
            "artist_contains_nocase: \"{}\"",
            escape_gql(&sanitize_detail_value(artist.to_string(), "Unknown Artist"))
        )
    } else {
        format!("album_contains_nocase: \"{}\"", escape_gql(album))
    };
    let query = format!(
        "{{ tracks(where: {{ {} }}, first: 300, orderBy: registeredAt, orderDirection: desc) {{ id artist album coverCid scrobbles(first: 1000) {{ id user }} }} }}",
        where_clause
    );
    let payload = http_post_json(
        &subgraph_activity_url(),
        serde_json::json!({ "query": query }),
    )?;
    let rows = payload
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let target_artist = normalize_artist_name(artist);
    let target_album_variants = normalize_album_variants(album);
    let mut total_scrobbles = 0_usize;
    let mut listeners = HashSet::<String>::new();
    let mut track_scrobbles = HashMap::<String, usize>::new();
    let mut first_cover_cid: Option<String> = None;

    for row in rows {
        let row_artist = row
            .get("artist")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let row_album = row.get("album").and_then(Value::as_str).unwrap_or_default();
        if !artist_matches_target(row_artist, &target_artist) {
            continue;
        }
        if !album_matches_target(row_album, &target_album_variants) {
            continue;
        }

        let track_id = row
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let scrobbles = row
            .get("scrobbles")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let play_count = scrobbles.len();
        total_scrobbles += play_count;
        if !track_id.is_empty() {
            track_scrobbles.insert(track_id.to_string(), play_count);
        }
        for scrobble in scrobbles {
            if let Some(user) = scrobble.get("user").and_then(Value::as_str) {
                let user = user.trim().to_ascii_lowercase();
                if !user.is_empty() {
                    listeners.insert(user);
                }
            }
        }
        if first_cover_cid.is_none() {
            let cover_cid = row
                .get("coverCid")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim();
            if is_valid_cid(cover_cid) {
                first_cover_cid = Some(cover_cid.to_string());
            }
        }
    }

    let image_path = resolve_album_image_path(artist, album, tracks, first_cover_cid.as_deref());

    Ok(AlbumCloudStats {
        title: sanitize_detail_value(album.to_string(), "Unknown Album"),
        artist: sanitize_detail_value(artist.to_string(), "Unknown Artist"),
        total_scrobbles,
        unique_listeners: listeners.len(),
        image_path,
        track_scrobbles,
    })
}

fn resolve_artist_image_path(
    artist: &str,
    tracks: &[TrackRow],
    fallback_cover_cid: Option<&str>,
) -> Option<String> {
    if let Some(recording_mbid) = first_recording_mbid_for_artist(artist, tracks) {
        if let Some(artist_mbid) = resolve_artist_mbid_from_recording(&recording_mbid)
            .ok()
            .flatten()
        {
            if let Some(image_url) = fetch_artist_image_url(&artist_mbid).ok().flatten() {
                if let Some(path) = cache_remote_image(&image_url, "artists", &artist_mbid) {
                    return Some(path);
                }
            }
        }
    }

    if let Some(cid) = fallback_cover_cid.filter(|cid| is_valid_cid(cid)) {
        let url = format!("{}/{}", FILEBASE_GATEWAY, cid);
        if let Some(path) = cache_remote_image(&url, "artists", artist) {
            return Some(path);
        }
    }

    first_local_cover_for_artist(artist, tracks)
}

fn resolve_album_image_path(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
    fallback_cover_cid: Option<&str>,
) -> Option<String> {
    if let Some(recording_mbid) = first_recording_mbid_for_album(artist, album, tracks) {
        if let Some(release_group_mbid) = resolve_release_group_mbid_from_recording(&recording_mbid)
            .ok()
            .flatten()
        {
            if let Some(cover_url) = fetch_album_cover_url(&release_group_mbid).ok().flatten() {
                if let Some(path) = cache_remote_image(&cover_url, "albums", &release_group_mbid) {
                    return Some(path);
                }
            }
        }
    }

    if let Some(cid) = fallback_cover_cid.filter(|cid| is_valid_cid(cid)) {
        let url = format!("{}/{}", FILEBASE_GATEWAY, cid);
        if let Some(path) = cache_remote_image(&url, "albums", &format!("{}::{}", artist, album)) {
            return Some(path);
        }
    }

    first_local_cover_for_album(artist, album, tracks)
}

fn first_recording_mbid_for_artist(artist: &str, tracks: &[TrackRow]) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    tracks
        .iter()
        .find(|track| normalize_lookup_key(&track.artist) == artist_key)
        .and_then(|track| track.mbid.as_ref())
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty())
}

fn first_recording_mbid_for_album(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    let album_key = normalize_lookup_key(album);
    tracks
        .iter()
        .find(|track| {
            normalize_lookup_key(&track.artist) == artist_key
                && normalize_lookup_key(&track.album) == album_key
        })
        .and_then(|track| track.mbid.as_ref())
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty())
}

fn first_local_cover_for_artist(artist: &str, tracks: &[TrackRow]) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    tracks.iter().find_map(|track| {
        if normalize_lookup_key(&track.artist) != artist_key {
            return None;
        }
        track
            .cover_path
            .as_ref()
            .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
            .cloned()
    })
}

fn first_local_cover_for_album(artist: &str, album: &str, tracks: &[TrackRow]) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    let album_key = normalize_lookup_key(album);
    tracks.iter().find_map(|track| {
        if normalize_lookup_key(&track.artist) != artist_key
            || normalize_lookup_key(&track.album) != album_key
        {
            return None;
        }
        track
            .cover_path
            .as_ref()
            .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
            .cloned()
    })
}

fn resolve_artist_mbid_from_recording(recording_mbid: &str) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!("{}/recording/{}", resolver_url(), recording_mbid))?;
    let first = payload
        .get("artists")
        .and_then(Value::as_array)
        .and_then(|artists| artists.first());
    Ok(first
        .and_then(|artist| artist.get("mbid"))
        .and_then(Value::as_str)
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty()))
}

fn resolve_release_group_mbid_from_recording(
    recording_mbid: &str,
) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!("{}/recording/{}", resolver_url(), recording_mbid))?;
    Ok(payload
        .get("releaseGroup")
        .and_then(Value::as_object)
        .and_then(|release_group| release_group.get("mbid"))
        .and_then(Value::as_str)
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty()))
}

fn fetch_artist_image_url(artist_mbid: &str) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!("{}/artist/{}", resolver_url(), artist_mbid))?;
    Ok(payload
        .get("links")
        .and_then(Value::as_object)
        .and_then(|links| links.get("image"))
        .and_then(Value::as_str)
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty()))
}

fn fetch_album_cover_url(release_group_mbid: &str) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!(
        "{}/release-group/{}",
        resolver_url(),
        release_group_mbid
    ))?;
    Ok(payload
        .get("coverArtUrl")
        .and_then(Value::as_str)
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty()))
}

fn cache_remote_image(url: &str, namespace: &str, cache_key: &str) -> Option<String> {
    let cache_dir = app_data_dir().join("detail-images").join(namespace);
    if fs::create_dir_all(&cache_dir).is_err() {
        return None;
    }
    let ext = guess_image_extension(url);
    let file_name = format!(
        "{}.{}",
        stable_cache_hash(&format!("{namespace}:{cache_key}")),
        ext
    );
    let cache_path = cache_dir.join(file_name);
    if cache_path.exists() {
        return Some(cache_path.to_string_lossy().to_string());
    }
    let bytes = http_get_bytes(url).ok()?;
    if bytes.is_empty() {
        return None;
    }
    if fs::write(&cache_path, bytes).is_err() {
        return None;
    }
    Some(cache_path.to_string_lossy().to_string())
}

fn stable_cache_hash(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn guess_image_extension(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".png") {
        "png"
    } else if lower.contains(".webp") {
        "webp"
    } else {
        "jpg"
    }
}

fn is_valid_cid(cid: &str) -> bool {
    let cid = cid.trim();
    cid.starts_with("Qm") || cid.starts_with("bafy")
}

fn normalize_artist_name(name: &str) -> String {
    normalize_alnum_phrase(name)
}

fn split_artist_names(name: &str) -> Vec<String> {
    let mut lowered = format!(" {} ", name.to_ascii_lowercase());
    for token in [
        " featuring ",
        " feat. ",
        " feat ",
        " ft. ",
        " ft ",
        " & ",
        ",",
        ";",
        " and ",
        " x ",
    ] {
        lowered = lowered.replace(token, "|");
    }
    lowered
        .split('|')
        .map(normalize_artist_name)
        .filter(|part| !part.is_empty())
        .collect()
}

fn normalize_artist_variants(name: &str) -> HashSet<String> {
    let mut variants = HashSet::new();
    let normalized = normalize_artist_name(name);
    if !normalized.is_empty() {
        variants.insert(normalized);
    }
    for part in split_artist_names(name) {
        variants.insert(part);
    }
    variants
}

fn artist_matches_target(track_artist: &str, target_artist: &str) -> bool {
    if target_artist.is_empty() {
        return false;
    }
    normalize_artist_variants(track_artist).contains(target_artist)
}

fn normalize_album_name(name: &str) -> String {
    normalize_alnum_phrase(name)
}

fn normalize_album_variants(name: &str) -> HashSet<String> {
    let base = normalize_album_name(name);
    let mut variants = HashSet::new();
    if base.is_empty() {
        variants.insert(String::new());
        return variants;
    }
    variants.insert(base.clone());
    for marker in [" (", " [", " - "] {
        if let Some(index) = base.find(marker) {
            let stripped = base[..index].trim().to_string();
            if !stripped.is_empty() {
                variants.insert(stripped);
            }
        }
    }
    variants
}

fn album_matches_target(track_album: &str, target_variants: &HashSet<String>) -> bool {
    if target_variants.contains("") {
        return normalize_album_name(track_album).is_empty();
    }
    let track_variants = normalize_album_variants(track_album);
    track_variants
        .iter()
        .any(|candidate| target_variants.contains(candidate))
}

fn normalize_alnum_phrase(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut prev_space = true;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    out.trim().to_string()
}

fn escape_gql(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ")
        .replace('\r', " ")
}

fn resolver_url() -> String {
    env::var("HEAVEN_RESOLVER_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_RESOLVER_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn subgraph_activity_url() -> String {
    env::var("HEAVEN_SUBGRAPH_ACTIVITY_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_ACTIVITY_URL.to_string())
}

fn http_get_json(url: &str) -> Result<Value, String> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut response = request
        .call()
        .map_err(|err| format!("HTTP GET failed ({url}): {err}"))?;
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().unwrap_or_default();
    if status >= 400 {
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }
    serde_json::from_str(&body)
        .map_err(|err| format!("HTTP GET {url} returned invalid JSON: {err}; body={body}"))
}

fn http_post_json(url: &str, payload: Value) -> Result<Value, String> {
    let request = ureq::post(url)
        .header("Content-Type", "application/json")
        .config()
        .http_status_as_error(false)
        .build();
    let mut response = request
        .send_json(payload)
        .map_err(|err| format!("HTTP POST failed ({url}): {err}"))?;
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().unwrap_or_default();
    if status >= 400 {
        return Err(format!("HTTP POST {url} failed ({status}): {body}"));
    }
    serde_json::from_str(&body)
        .map_err(|err| format!("HTTP POST {url} returned invalid JSON: {err}; body={body}"))
}

fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut response = request
        .call()
        .map_err(|err| format!("HTTP GET failed ({url}): {err}"))?;
    let status = response.status().as_u16();
    if status >= 400 {
        let body = response.body_mut().read_to_string().unwrap_or_default();
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }

    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|err| format!("Failed reading HTTP bytes ({url}): {err}"))?;
    Ok(bytes)
}

fn parse_duration_seconds(duration: &str) -> u64 {
    let mut values = [0_u64; 3];
    let mut count = 0_usize;
    for part in duration.trim().split(':') {
        if count >= values.len() {
            return 0;
        }
        values[count] = part.parse::<u64>().unwrap_or(0);
        count += 1;
    }

    match count {
        2 => values[0] * 60 + values[1],
        3 => values[0] * 3600 + values[1] * 60 + values[2],
        _ => 0,
    }
}

fn abbreviate_for_status(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= 20 {
        return trimmed.to_string();
    }
    format!(
        "{}...{}",
        &trimmed[..10],
        &trimmed[trimmed.len().saturating_sub(8)..]
    )
}

fn is_needs_reauth_error(raw: &str) -> bool {
    raw.contains("[NEEDS_REAUTH]")
}

fn needs_reauth_prompt_message() -> String {
    "Session expired — sign in again to continue.".to_string()
}

fn summarize_status_error(raw: &str) -> String {
    let compact = raw.replace('\n', " ").replace('\r', " ");
    let compact = compact.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = compact.to_ascii_lowercase();

    if lower.contains("already uploaded")
        || lower.contains("already exists")
        || lower.contains("content already registered")
    {
        return "Track already uploaded from this wallet. Use Share instead.".to_string();
    }

    if lower.contains("access denied on contentaccessmirror") {
        return "This wallet is not authorized yet. Ask the owner to share again, then retry in a few seconds.".to_string();
    }

    if lower.contains("incompatible with current lit decryption context")
        || lower.contains("encrypted payload decryption failed")
    {
        return "Shared decrypt failed due to an incompatible encrypted payload. Ask the owner to re-upload and share again.".to_string();
    }

    if compact.len() <= 180 {
        compact
    } else {
        format!("{}...", &compact[..180])
    }
}

fn parse_number_field(value: Option<&serde_json::Value>) -> usize {
    match value {
        Some(v) if v.is_number() => v.as_u64().unwrap_or_default() as usize,
        Some(v) if v.is_string() => v
            .as_str()
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or_default() as usize,
        _ => 0,
    }
}

fn parse_playlist_summaries(raw: &serde_json::Value) -> Vec<PlaylistSummary> {
    let mut out = Vec::<PlaylistSummary>::new();
    let entries = raw.as_array().cloned().unwrap_or_default();
    for entry in entries {
        let Some(id) = entry.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let id = id.trim().to_lowercase();
        if id.is_empty() {
            continue;
        }
        let name = entry
            .get("name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("Untitled Playlist")
            .to_string();
        let visibility = parse_number_field(entry.get("visibility")).min(255) as u8;
        let track_count = parse_number_field(entry.get("trackCount"));

        out.push(PlaylistSummary {
            id,
            name,
            visibility,
            track_count,
        });
    }
    out
}

fn playlist_track_input_from_track(track: &TrackRow) -> PlaylistTrackInput {
    PlaylistTrackInput {
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: if track.album.trim().is_empty() {
            None
        } else {
            Some(track.album.clone())
        },
        mbid: track
            .mbid
            .as_ref()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        ip_id: track
            .ip_id
            .as_ref()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        cover_cid: None,
        cover_image: None,
    }
}

fn looks_like_hex_hash(value: &str) -> bool {
    let trimmed = value.trim();
    if !trimmed.starts_with("0x") || trimmed.len() < 10 {
        return false;
    }
    trimmed
        .chars()
        .skip(2)
        .all(|ch| ch.is_ascii_hexdigit() || ch == '.')
}

fn needs_shared_metadata_enrichment(record: &SharedGrantRecord) -> bool {
    let title = record.title.trim();
    if title.is_empty() || looks_like_hex_hash(title) {
        return true;
    }
    if title.eq_ignore_ascii_case(record.content_id.trim()) {
        return true;
    }

    let artist = record.artist.trim();
    artist.is_empty() || looks_like_hex_hash(artist)
}

fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
}

fn uploaded_records_path() -> PathBuf {
    app_data_dir().join("uploaded_tracks.json")
}

fn shared_grants_path() -> PathBuf {
    app_data_dir().join("shared_grants.json")
}

fn load_uploaded_track_records_for_owner(owner: &str) -> Vec<UploadedTrackRecord> {
    let path = uploaded_records_path();
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(records) = serde_json::from_str::<Vec<UploadedTrackRecord>>(&text) else {
        return Vec::new();
    };
    let owner_lc = owner.to_lowercase();
    records
        .into_iter()
        .filter(|r| r.owner_address.to_lowercase() == owner_lc)
        .collect()
}

fn upsert_uploaded_track_record(record: UploadedTrackRecord) -> Result<(), String> {
    let path = uploaded_records_path();
    let mut all = if let Ok(text) = fs::read_to_string(&path) {
        serde_json::from_str::<Vec<UploadedTrackRecord>>(&text).unwrap_or_default()
    } else {
        Vec::new()
    };

    all.retain(|r| !(r.owner_address == record.owner_address && r.file_path == record.file_path));
    all.push(record);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating app data dir ({}): {e}", parent.display()))?;
    }
    let encoded = serde_json::to_string_pretty(&all)
        .map_err(|e| format!("Failed encoding uploaded track records: {e}"))?;
    fs::write(&path, encoded).map_err(|e| {
        format!(
            "Failed writing uploaded track records ({}): {e}",
            path.display()
        )
    })
}

fn load_shared_grant_records_for_grantee(grantee: &str) -> Vec<SharedGrantRecord> {
    let path = shared_grants_path();
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(mut records) = serde_json::from_str::<Vec<SharedGrantRecord>>(&text) else {
        return Vec::new();
    };
    let grantee_lc = grantee.to_lowercase();
    records.retain(|r| r.grantee_address.to_lowercase() == grantee_lc);
    records.sort_by(|a, b| b.shared_at_ms.cmp(&a.shared_at_ms));
    records
}

fn append_shared_grant_record(record: SharedGrantRecord) -> Result<(), String> {
    let path = shared_grants_path();
    let mut all = if let Ok(text) = fs::read_to_string(&path) {
        serde_json::from_str::<Vec<SharedGrantRecord>>(&text).unwrap_or_default()
    } else {
        Vec::new()
    };
    all.push(record);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating app data dir ({}): {e}", parent.display()))?;
    }
    let encoded = serde_json::to_string_pretty(&all)
        .map_err(|e| format!("Failed encoding shared grant records: {e}"))?;
    fs::write(&path, encoded).map_err(|e| {
        format!(
            "Failed writing shared grant records ({}): {e}",
            path.display()
        )
    })
}

fn render_shared_with_me_page(
    shared_records: Vec<SharedGrantRecord>,
    shared_play_busy: bool,
    entity: Entity<LibraryView>,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let total_rows = shared_records.len();
    div()
        .id("library-root")
        .v_flex()
        .flex_1()
        .size_full()
        .overflow_hidden()
        .child(
            div()
                .w_full()
                .px_6()
                .pt_8()
                .pb_6()
                .bg(HERO_BG)
                .v_flex()
                .gap_4()
                .child(
                    div()
                        .text_2xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .child("Shared With Me"),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.85, 1.))
                        .child(format!("{} shared tracks", total_rows)),
                )
                .child(div().text_sm().text_color(hsla(0., 0., 0.85, 1.)).child(
                    if shared_play_busy {
                        "Decrypting track..."
                    } else {
                        "Click a track to decrypt and play it."
                    },
                ))
                .child(hero_button(
                    "refresh-shared",
                    "icons/sort-ascending.svg",
                    "Refresh",
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.refresh_shared_records_for_auth(cx);
                        cx.notify();
                    }),
                )),
        )
        .child(if total_rows == 0 {
            div()
                .v_flex()
                .flex_1()
                .items_center()
                .justify_center()
                .gap_2()
                .child(div().text_color(TEXT_PRIMARY).child("No shared tracks yet"))
                .child(
                    div()
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .child("Ask another wallet to share a track with your PKP address."),
                )
                .into_any_element()
        } else {
            div()
                .v_flex()
                .flex_1()
                .child(render_table_header(None, false, cx))
                .child(
                    uniform_list(
                        "shared-track-list",
                        total_rows,
                        move |range, _window, _cx| {
                            let mut items = Vec::new();
                            for i in range {
                                if let Some(record) = shared_records.get(i) {
                                    items.push(render_shared_record_row(
                                        record,
                                        i,
                                        shared_play_busy,
                                        entity.clone(),
                                    ));
                                }
                            }
                            items
                        },
                    )
                    .flex_1()
                    .w_full(),
                )
                .into_any_element()
        })
}

fn render_shared_record_row(
    record: &SharedGrantRecord,
    index: usize,
    shared_play_busy: bool,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    div()
        .id(ElementId::Name(format!("shared-track-{}", index).into()))
        .h_flex()
        .w_full()
        .h(px(ROW_HEIGHT))
        .px_4()
        .items_center()
        .cursor_pointer()
        .hover(|s| s.bg(BG_HOVER))
        .on_click(move |_ev, _window, cx| {
            if shared_play_busy {
                return;
            }
            let _ = entity.update(cx, |this, cx| {
                this.play_shared_record(index, cx);
            });
        })
        .bg(if index % 2 == 0 {
            Hsla {
                h: 0.,
                s: 0.,
                l: 0.,
                a: 0.,
            }
        } else {
            BG_HIGHLIGHT
        })
        .child(
            div()
                .w(px(48.))
                .text_sm()
                .text_color(TEXT_DIM)
                .child(format!("{}", index + 1)),
        )
        .child(
            div()
                .h_flex()
                .flex_1()
                .min_w_0()
                .gap_3()
                .items_center()
                .child(
                    div()
                        .size(px(40.))
                        .rounded(px(6.))
                        .bg(BG_ELEVATED)
                        .flex_shrink_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            gpui::svg()
                                .path("icons/music-note.svg")
                                .size(px(16.))
                                .text_color(TEXT_DIM),
                        ),
                )
                .child(
                    div()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_PRIMARY)
                        .truncate()
                        .child(record.title.clone()),
                ),
        )
        .child(
            div()
                .w(px(ARTIST_COLUMN_WIDTH))
                .mr_2()
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_SECONDARY)
                .truncate()
                .child(if record.artist.trim().is_empty() {
                    "Unknown Artist".to_string()
                } else {
                    record.artist.clone()
                }),
        )
        .child(
            div()
                .w(px(ALBUM_COLUMN_WIDTH))
                .min_w_0()
                .overflow_hidden()
                .text_sm()
                .text_color(TEXT_MUTED)
                .truncate()
                .child(if record.album.trim().is_empty() {
                    "Shared".to_string()
                } else {
                    record.album.clone()
                }),
        )
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(52.))
                        .text_sm()
                        .text_color(TEXT_MUTED)
                        .h_flex()
                        .justify_end()
                        .child("--:--"),
                )
                .child(
                    div()
                        .w(px(36.))
                        .h_flex()
                        .items_center()
                        .justify_end()
                        .child(
                            gpui::svg()
                                .path("icons/hash.svg")
                                .size(px(14.))
                                .text_color(TEXT_DIM),
                        ),
                ),
        )
}
