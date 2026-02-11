//! Music library view — browse local folder, scan tracks, display in a virtualized track list.
//! Matches the web app's LibraryPage design with paged loading + scroll virtualization.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use gpui::*;
use gpui_component::menu::PopupMenuItem;
use gpui_component::StyledExt;

use crate::audio::AudioHandle;
use crate::auth;
use crate::load_storage::{LoadStorageService, TrackMetaInput};
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

// =============================================================================
// Library state
// =============================================================================

pub struct LibraryView {
    db: Option<Arc<Mutex<MusicDb>>>,
    audio: AudioHandle,
    folder: Option<String>,
    tracks: Vec<TrackRow>,
    total_count: i64,
    loading: bool,
    scanning: bool,
    scan_progress: Option<ScanProgress>,
    error: Option<String>,
    active_index: Option<usize>,
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
}

impl LibraryView {
    pub fn new(audio: AudioHandle, cx: &mut Context<Self>) -> Self {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("heaven-gpui");

        let scrobble_service = match ScrobbleService::new() {
            Ok(s) => Some(Arc::new(Mutex::new(s))),
            Err(e) => {
                log::warn!("[Scrobble] service disabled: {}", e);
                None
            }
        };

        let mut this = Self {
            db: None,
            audio,
            folder: None,
            tracks: Vec::new(),
            total_count: 0,
            loading: false,
            scanning: false,
            scan_progress: None,
            error: None,
            active_index: None,
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
        };

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
                        this.tracks = batch;
                        this.total_count = count;
                        this.loading = offset < count; // still loading if more pages
                        cx.notify();
                    });
                }
            }

            // Final update
            let _ = this.update(cx, |this, cx| {
                this.tracks = all_tracks;
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
            self.active_index = Some(index);
            self.track_started_at_sec = Some(now_epoch_sec());
        }
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
                    if let Some(idx) = self.active_index {
                        if let Some(track) = self.tracks.get(idx).cloned() {
                            let played_at_sec =
                                self.track_started_at_sec.unwrap_or_else(now_epoch_sec);
                            self.submit_scrobble_for_track(track, played_at_sec, cx);
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
        if let Some(idx) = self.active_index {
            let next = idx + 1;
            if next < self.tracks.len() {
                self.play_track(next, cx);
                cx.notify();
            }
        }
    }

    pub fn play_prev(&mut self, cx: &mut Context<Self>) {
        if let Some(idx) = self.active_index {
            if idx > 0 {
                self.play_track(idx - 1, cx);
                cx.notify();
            }
        }
    }

    fn play_all(&mut self, cx: &mut Context<Self>) {
        if !self.tracks.is_empty() {
            self.play_track(0, cx);
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
                this.tracks.clear();
                this.total_count = 0;
                this.active_index = None;
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
        let track_meta = TrackMetaInput {
            title: Some(track.title.clone()),
            artist: Some(track.artist.clone()),
            album: Some(track.album.clone()),
            mbid: track.mbid.clone(),
            ip_id: track.ip_id.clone(),
        };
        let path = track.file_path.clone();

        self.upload_busy = true;
        self.set_status_message(
            format!(
                "Encrypting + uploading \"{}\" to Load (network + register can take a few minutes)...",
                track_title
            ),
            cx,
        );

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                match svc.content_encrypt_upload_register(&auth, &path, true, track_meta) {
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
}

impl Render for LibraryView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let container = div()
            .id("library-root")
            .v_flex()
            .flex_1()
            .size_full()
            .overflow_hidden();

        // No folder selected — empty state
        if self.folder.is_none() && !self.loading {
            return container.items_center().justify_center().child(
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
            );
        }

        if let Some(err) = &self.error {
            return container.items_center().justify_center().child(
                div()
                    .v_flex()
                    .items_center()
                    .gap_2()
                    .child(div().text_color(TEXT_MUTED).child("Error"))
                    .child(div().text_xs().text_color(TEXT_DIM).child(err.clone())),
            );
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
        let active_index = self.active_index;
        let total_rows = self.tracks.len();
        let upload_busy = self.upload_busy;
        let status_message = self.status_message.clone();
        let storage_balance = self.storage_balance.clone();
        let storage_monthly = self.storage_monthly.clone();
        let storage_days = self.storage_days;
        let storage_loading = self.storage_loading;
        let add_funds_busy = self.add_funds_busy;

        // Clone tracks + entity handle for the uniform_list closure
        let tracks_snapshot = self.tracks.clone();
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
            // Column header (fixed at top of track area)
            .child(render_table_header())
            // Virtualized track rows
            .child(
                uniform_list("track-list", total_rows, move |range, _window, _cx| {
                    let mut items = Vec::new();
                    for i in range {
                        if let Some(track) = tracks_snapshot.get(i) {
                            let is_active = active_index == Some(i);
                            let ent = entity.clone();
                            items.push(render_track_row(track, i, is_active, upload_busy, ent));
                        }
                    }
                    items
                })
                .flex_1()
                .w_full(),
            )
    }
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

// =============================================================================
// Table header
// =============================================================================

fn render_table_header() -> impl IntoElement {
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
        .child(div().flex_1().min_w_0().child("TITLE"))
        .child(div().w(px(180.)).mr_4().child("ARTIST"))
        .child(div().w(px(180.)).child("ALBUM"))
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div().w(px(52.)).h_flex().justify_end().child(
                        gpui::svg()
                            .path("icons/clock.svg")
                            .size(px(14.))
                            .text_color(TEXT_DIM),
                    ),
                )
                // Spacer matching the three-dot column
                .child(div().w(px(36.))),
        )
}

// =============================================================================
// Track row — used by uniform_list, receives entity handle for click dispatch
// =============================================================================

fn render_track_row(
    track: &TrackRow,
    index: usize,
    is_active: bool,
    upload_busy: bool,
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    let row_id = ElementId::Name(format!("track-{}", index).into());
    let group_name: SharedString = format!("track-row-{}", index).into();
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
    let artist_entity = entity.clone();
    let album_entity = entity.clone();
    let upload_entity = entity;

    let queue_title = track.title.clone();
    let playlist_title = track.title.clone();
    let artist_name = track.artist.clone();
    let album_name = track.album.clone();
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
                    this.play_track(index, cx);
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
                                .child(format!("{}", index + 1)),
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
                .w(px(180.))
                .mr_4()
                .text_sm()
                .text_color(TEXT_SECONDARY)
                .truncate()
                .child(track.artist.clone()),
        )
        // Album
        .child(
            div()
                .w(px(180.))
                .text_sm()
                .text_color(TEXT_MUTED)
                .truncate()
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
                    ("dots", index),
                    g2,
                    false,
                    move |menu, _window, _cx| {
                        menu.item(PopupMenuItem::new("Add to playlist").on_click({
                            let playlist_entity = playlist_entity.clone();
                            let playlist_title = playlist_title.clone();
                            move |_, _, cx| {
                                let _ = playlist_entity.update(cx, |this, cx| {
                                    this.set_status_message(
                                        format!(
                                            "Add to playlist is not wired yet (\"{}\").",
                                            playlist_title
                                        ),
                                        cx,
                                    );
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
                            let artist_entity = artist_entity.clone();
                            let artist_name = artist_name.clone();
                            move |_, _, cx| {
                                let _ = artist_entity.update(cx, |this, cx| {
                                    this.set_status_message(
                                        format!(
                                            "Artist navigation is not wired yet ({}).",
                                            artist_name
                                        ),
                                        cx,
                                    );
                                });
                            }
                        }))
                        .item(PopupMenuItem::new("Go to album").on_click({
                            let album_entity = album_entity.clone();
                            let album_name = album_name.clone();
                            move |_, _, cx| {
                                let _ = album_entity.update(cx, |this, cx| {
                                    this.set_status_message(
                                        format!(
                                            "Album navigation is not wired yet ({}).",
                                            album_name
                                        ),
                                        cx,
                                    );
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

/// Render a large album art image for the side player. Returns the cover path if available.
pub fn get_active_cover_path(tracks: &[TrackRow], active_index: Option<usize>) -> Option<String> {
    active_index
        .and_then(|i| tracks.get(i))
        .and_then(|t| t.cover_path.clone())
        .filter(|p| !p.is_empty() && std::path::Path::new(p).exists())
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

fn summarize_status_error(raw: &str) -> String {
    let compact = raw.replace('\n', " ").replace('\r', " ");
    let compact = compact.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() <= 180 {
        compact
    } else {
        format!("{}...", &compact[..180])
    }
}
