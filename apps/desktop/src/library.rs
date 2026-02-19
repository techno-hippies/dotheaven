//! Music library view — browse local folder, scan tracks, display in a virtualized track list.
//! Matches the web app's LibraryPage design with paged loading + scroll virtualization.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use alloy_primitives::Address;
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::button::{Button, ButtonVariants};
use gpui_component::input::{Input, InputEvent, InputState};
use gpui_component::menu::{DropdownMenu, PopupMenuItem};
use gpui_component::scroll::ScrollableElement;
use gpui_component::Sizable;
use gpui_component::StyledExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::audio::AudioHandle;
use crate::auth;
use crate::load_storage::{LoadStorageService, PlaylistTrackInput, TrackMetaInput};
use crate::music_db::{MusicDb, ScanProgress, StorageStatus, TrackRow};
use crate::scrobble::{now_epoch_sec, ScrobbleService};
use crate::ui::overflow_menu::track_row_overflow_menu;

// =============================================================================
// Colors — sourced from AppColors global (updated by theme importer)
// =============================================================================

use crate::app_colors;

// Module-local helpers that read from the global palette.
// These replace the old hardcoded constants so existing code (including hover
// closures) keeps working without signature changes.
macro_rules! define_color_fns {
    ($($name:ident => $field:ident),* $(,)?) => {
        $(
            #[allow(non_snake_case)]
            fn $name() -> Hsla { app_colors::colors().$field }
        )*
    };
}

#[allow(dead_code)]
define_color_fns! {
    BG_PAGE       => bg_page,
    BG_ELEVATED   => bg_elevated,
    BG_HIGHLIGHT  => bg_highlight,
    BG_HOVER      => bg_hover,
    TEXT_PRIMARY   => text_primary,
    TEXT_SECONDARY => text_secondary,
    TEXT_MUTED     => text_muted,
    TEXT_DIM       => text_dim,
    ACCENT_BLUE    => accent_blue,
    BORDER_DEFAULT => border_default,
    BORDER_SUBTLE  => border_subtle,
}

// Legacy colors still used outside the library hero (shared page, playlist warnings).
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

// =============================================================================
// Constants
// =============================================================================

const ROW_HEIGHT: f32 = 48.0;
const HEADER_HEIGHT: f32 = 32.0;
const PAGE_SIZE: i64 = 500; // tracks loaded per DB page
const TITLE_COLUMN_WIDTH: f32 = 372.0;
const ARTIST_COLUMN_WIDTH: f32 = 200.0;
const ALBUM_COLUMN_WIDTH: f32 = 240.0;
const DETAIL_ARTIST_COLUMN_WIDTH: f32 = 225.0;
const DETAIL_ALBUM_COLUMN_WIDTH: f32 = 300.0;
const DEFAULT_SUBGRAPH_MUSIC_SOCIAL_URL: &str =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn";
const DEFAULT_RESOLVER_URL: &str =
    "https://heaven-resolver-production.deletion-backup782.workers.dev";
// Subgraphs are eventually consistent. Keep deleted playlists hidden locally while the indexer
// catches up so they don't briefly reappear after a refresh.
const PLAYLIST_DELETE_TOMBSTONE_AFTER_MS: i64 = 10 * 60_000;

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
    Storage,
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
    Artist {
        artist: String,
    },
    Album {
        artist: String,
        album: String,
    },
    Playlist {
        playlist_id: String,
        playlist_name: String,
    },
}

#[derive(Debug, Clone)]
struct ArtistCloudStats {
    title: String,
    image_path: Option<String>,
    track_scrobbles: HashMap<String, usize>,
}

#[derive(Debug, Clone)]
struct AlbumCloudStats {
    title: String,
    artist: String,
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
    #[serde(default)]
    saved_forever: bool,
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
struct ActiveSharedPlayback {
    content_id: String,
    title: String,
    artist: String,
    album: String,
    local_path: String,
}

#[derive(Debug, Clone)]
struct PlaylistDetailTrack {
    track_id: String,
    title: String,
    artist: String,
    album: String,
    duration: String,
    storage_status: StorageStatus,
    local_track_index: Option<usize>,
}

#[derive(Debug, Clone)]
struct PlaylistDetailCacheEntry {
    tracks: Vec<PlaylistDetailTrack>,
    fetched_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingPlaylistMutationKind {
    Create,
    AddTrack,
}

#[derive(Debug, Clone)]
struct PendingPlaylistMutation {
    playlist_id: String,
    playlist_name: String,
    kind: PendingPlaylistMutationKind,
    optimistic_track_count: usize,
    created_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct PlaylistSummary {
    pub id: String,
    pub name: String,
    pub cover_cid: Option<String>,
    pub visibility: u8,
    pub track_count: usize,
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
    playlist_share_modal_open: bool,
    playlist_share_modal_playlist_id: Option<String>,
    playlist_share_modal_playlist_name: Option<String>,
    playlist_share_modal_submitting: bool,
    playlist_share_modal_error: Option<String>,
    share_wallet_input_state: Entity<InputState>,
    delete_playlist_modal_open: bool,
    delete_playlist_modal_playlist_id: Option<String>,
    delete_playlist_modal_playlist_name: Option<String>,
    delete_playlist_modal_submitting: bool,
    delete_playlist_modal_error: Option<String>,
    playlist_cover_update_busy: bool,
    playlist_cover_update_playlist_id: Option<String>,
    playlist_cover_update_optimistic_path: Option<String>,
    playlist_cover_update_error: Option<String>,
    playlist_modal_open: bool,
    playlist_modal_track_index: Option<usize>,
    playlist_modal_submitting: bool,
    playlist_modal_error: Option<String>,
    playlist_modal_loading: bool,
    playlist_modal_needs_reauth: bool,
    playlist_modal_reauth_busy: bool,
    playlist_modal_selected_playlist_id: Option<String>,
    playlist_modal_cover_image_path: Option<String>,
    playlist_modal_playlists: Vec<PlaylistSummary>,
    sidebar_playlists: Vec<PlaylistSummary>,
    pending_playlist_mutations: Vec<PendingPlaylistMutation>,
    deleted_playlist_tombstones: HashMap<String, i64>,
    playlist_name_input_state: Entity<InputState>,
    library_search_input_state: Entity<InputState>,
    track_list_scroll_handle: UniformListScrollHandle,
    shared_track_list_scroll_handle: UniformListScrollHandle,
    artist_detail_track_list_scroll_handle: UniformListScrollHandle,
    album_detail_track_list_scroll_handle: UniformListScrollHandle,
    playlist_detail_track_list_scroll_handle: UniformListScrollHandle,
    search_query: String,
    filtered_indices: Arc<Vec<usize>>,
    search_debounce_seq: u64,
    sort_state: Option<LibrarySortState>,
    playback_queue_paths: Vec<String>,
    active_queue_pos: Option<usize>,
    shared_play_busy: bool,
    active_shared_playback: Option<ActiveSharedPlayback>,
    detail_route: LibraryDetailRoute,
    detail_history: Vec<LibraryDetailRoute>,
    playlist_detail_tracks: Vec<PlaylistDetailTrack>,
    playlist_detail_cache: HashMap<String, PlaylistDetailCacheEntry>,
    detail_loading: bool,
    detail_error: Option<String>,
    detail_fetch_seq: u64,
    artist_cloud_stats_key: Option<String>,
    artist_cloud_stats: Option<ArtistCloudStats>,
    album_cloud_stats_key: Option<String>,
    album_cloud_stats: Option<AlbumCloudStats>,
}

mod impl_constructor_playback;
mod impl_detail_mode;
mod impl_modals;
mod impl_render;
mod impl_sharing_playlist;
mod view_parts;

pub(in crate::library) use view_parts::*;
