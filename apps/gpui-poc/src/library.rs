//! Music library view — browse local folder, scan tracks, display in a virtualized track list.
//! Matches the web app's LibraryPage design with paged loading + scroll virtualization.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use gpui::*;
use gpui_component::menu::ContextMenuExt;
use gpui_component::StyledExt;

use crate::audio::AudioHandle;
use crate::music_db::{MusicDb, ScanProgress, TrackRow};

// =============================================================================
// Actions for track context menu
// =============================================================================

actions!(
    track_menu,
    [AddToQueue, AddToPlaylist, GoToArtist, GoToAlbum]
);

// =============================================================================
// Colors
// =============================================================================

const BG_ELEVATED: Hsla = Hsla { h: 0., s: 0., l: 0.15, a: 1. };
const BG_HIGHLIGHT: Hsla = Hsla { h: 0., s: 0., l: 0.16, a: 1. };
const BG_HOVER: Hsla = Hsla { h: 0., s: 0., l: 0.19, a: 1. };
const TEXT_PRIMARY: Hsla = Hsla { h: 0., s: 0., l: 0.98, a: 1. };
const TEXT_SECONDARY: Hsla = Hsla { h: 0., s: 0., l: 0.83, a: 1. };
const TEXT_MUTED: Hsla = Hsla { h: 0., s: 0., l: 0.64, a: 1. };
const TEXT_DIM: Hsla = Hsla { h: 0., s: 0., l: 0.45, a: 1. };
const ACCENT_BLUE: Hsla = Hsla { h: 0.62, s: 0.93, l: 0.76, a: 1. };
const BORDER_SUBTLE: Hsla = Hsla { h: 0., s: 0., l: 0.21, a: 1. };
const HERO_BG: Hsla = Hsla { h: 0.73, s: 0.50, l: 0.22, a: 1. };

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
}

impl LibraryView {
    pub fn new(audio: AudioHandle, cx: &mut Context<Self>) -> Self {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("heaven-gpui");

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
            self.audio.play(
                &track.file_path,
                None,
                Some(track.artist.clone()),
                track.cover_path.clone(),
            );
            self.active_index = Some(index);
        }
    }

    /// Auto-advance to next track if current one ended.
    pub fn check_auto_advance(&mut self, cx: &mut Context<Self>) {
        let state = self.audio.read_state();
        // Track ended: has a path, not playing, and position >= duration
        if state.track_path.is_some() && !state.playing {
            if let Some(dur) = state.duration {
                if state.position >= dur - 0.5 && dur > 0.0 {
                    if let Some(idx) = self.active_index {
                        let next = idx + 1;
                        if next < self.tracks.len() {
                            self.play_track(next, cx);
                            cx.notify();
                        }
                    }
                }
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
                );
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
                cx,
            ))
            // Column header (fixed at top of track area)
            .child(render_table_header())
            // Virtualized track rows
            .child(
                uniform_list(
                    "track-list",
                    total_rows,
                    move |range, _window, _cx| {
                        let mut items = Vec::new();
                        for i in range {
                            if let Some(track) = tracks_snapshot.get(i) {
                                let is_active = active_index == Some(i);
                                let ent = entity.clone();
                                items.push(render_track_row(track, i, is_active, ent));
                            }
                        }
                        items
                    },
                )
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
                .child(hero_button("play-all", "icons/play-fill.svg", "Play All", true, cx.listener(|this, _, _w, cx| {
                    this.play_all(cx);
                    cx.notify();
                })))
                .child(hero_button_passive("shuffle", "icons/shuffle.svg", "Shuffle"))
                .child(hero_button("pick-folder", "icons/folder-open.svg", "Pick Folder", false, cx.listener(|this, _, _w, cx| {
                    this.browse_folder(cx);
                })))
                .child(hero_button("rescan", "icons/sort-ascending.svg", "Rescan", false, cx.listener(|this, _, _w, cx| {
                    this.rescan(cx);
                }))),
        )
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
        .child(gpui::svg().path(icon).size(px(16.)).text_color(TEXT_PRIMARY))
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::MEDIUM)
                .text_color(TEXT_PRIMARY)
                .child(label),
        )
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
        .child(div().w(px(180.)).child("ARTIST"))
        .child(div().w(px(180.)).child("ALBUM"))
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .w(px(52.))
                        .h_flex()
                        .justify_end()
                        .child(
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
    entity: Entity<LibraryView>,
) -> impl IntoElement {
    let row_id = ElementId::Name(format!("track-{}", index).into());
    let group_name: SharedString = format!("track-row-{}", index).into();
    let title_color = if is_active { ACCENT_BLUE } else { TEXT_PRIMARY };
    let row_bg = if is_active {
        BG_HIGHLIGHT
    } else {
        Hsla { h: 0., s: 0., l: 0., a: 0. }
    };

    let g = group_name.clone();
    let g2 = group_name.clone();
    let g3 = group_name.clone();

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
        .on_click(move |_, _window, cx| {
            entity.update(cx, |this, cx| {
                this.play_track(index, cx);
                cx.notify();
            });
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
                .child(
                    div()
                        .id(ElementId::Name(format!("dots-{}", index).into()))
                        .w(px(36.))
                        .h(px(28.))
                        .rounded(px(6.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .opacity(0.)
                        .group_hover(g2, |s| s.opacity(1.))
                        .hover(|s| s.bg(BG_HOVER))
                        .context_menu(move |menu, _window, _cx| {
                            menu.menu("Add to Queue", Box::new(AddToQueue))
                                .menu("Add to Playlist", Box::new(AddToPlaylist))
                                .separator()
                                .menu("Go to Artist", Box::new(GoToArtist))
                                .menu("Go to Album", Box::new(GoToAlbum))
                        })
                        .child(
                            gpui::svg()
                                .path("icons/dots-three.svg")
                                .size(px(18.))
                                .text_color(TEXT_SECONDARY)
                                .group_hover(g3, |s| s.text_color(TEXT_PRIMARY)),
                        ),
                ),
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
        Some(path) if !path.is_empty() && std::path::Path::new(path).exists() => container
            .child(
                gpui::img(PathBuf::from(path))
                    .size(px(40.))
                    .object_fit(ObjectFit::Cover),
            ),
        _ => container
            .flex()
            .items_center()
            .justify_center()
            .child(
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
