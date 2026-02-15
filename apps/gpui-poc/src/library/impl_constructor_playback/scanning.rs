use super::*;

impl LibraryView {
    pub(in crate::library) fn browse_folder(&mut self, cx: &mut Context<Self>) {
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

            if let Ok(db) = db.lock() {
                let _ = db.set_setting("folder_path", &folder);
            } else {
                log::error!("[Library] failed to lock db while persisting folder path");
            }

            let _ = this.update(cx, |this, cx| {
                this.folder = Some(folder.clone());
                this.scanning = true;
                this.scan_progress = Some(ScanProgress { done: 0, total: 0 });
                this.tracks = Arc::new(Vec::new());
                this.recompute_filtered_indices();
                this.total_count = 0;
                this.active_track_path = None;
                this.track_started_at_sec = None;
                this.playback_queue_paths.clear();
                this.active_queue_pos = None;
                this.active_shared_playback = None;
                this.reset_detail_navigation();
                cx.notify();
            });

            // Scan with progress polling.
            let db2 = db.clone();
            let folder2 = folder.clone();
            let progress = Arc::new(Mutex::new(ScanProgress { done: 0, total: 0 }));
            let progress_for_scan = progress.clone();
            let scan_finished = Arc::new(AtomicBool::new(false));
            let scan_finished_for_task = scan_finished.clone();

            let scan_task = smol::spawn(async move {
                let result = smol::unblock(move || {
                    let db = db2.lock().map_err(|e| format!("lock: {e}"))?;
                    db.scan_folder(&folder2, |p| {
                        if let Ok(mut prog) = progress_for_scan.lock() {
                            *prog = p;
                        }
                    })
                })
                .await;
                scan_finished_for_task.store(true, std::sync::atomic::Ordering::Release);
                result
            });

            let mut last_progress = (usize::MAX, usize::MAX);
            while !scan_finished.load(std::sync::atomic::Ordering::Acquire) {
                if let Ok(prog) = progress.lock() {
                    let snapshot = prog.clone();
                    if (snapshot.done, snapshot.total) != last_progress {
                        last_progress = (snapshot.done, snapshot.total);
                        let _ = this.update(cx, |this, cx| {
                            this.scan_progress = Some(snapshot);
                            cx.notify();
                        });
                    }
                }
                smol::Timer::after(std::time::Duration::from_millis(120)).await;
            }

            let result = scan_task.await;

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

    pub(in crate::library) fn rescan(&mut self, cx: &mut Context<Self>) {
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
            let progress_for_scan = progress.clone();
            let scan_finished = Arc::new(AtomicBool::new(false));
            let scan_finished_for_task = scan_finished.clone();

            let scan_task = smol::spawn(async move {
                let result = smol::unblock(move || {
                    let db = db2.lock().map_err(|e| format!("lock: {e}"))?;
                    db.scan_folder(&folder2, |p| {
                        if let Ok(mut prog) = progress_for_scan.lock() {
                            *prog = p;
                        }
                    })
                })
                .await;
                scan_finished_for_task.store(true, std::sync::atomic::Ordering::Release);
                result
            });

            let mut last_progress = (usize::MAX, usize::MAX);
            while !scan_finished.load(std::sync::atomic::Ordering::Acquire) {
                if let Ok(prog) = progress.lock() {
                    let snapshot = prog.clone();
                    if (snapshot.done, snapshot.total) != last_progress {
                        last_progress = (snapshot.done, snapshot.total);
                        let _ = this.update(cx, |this, cx| {
                            this.scan_progress = Some(snapshot);
                            cx.notify();
                        });
                    }
                }
                smol::Timer::after(std::time::Duration::from_millis(120)).await;
            }

            let result = scan_task.await;

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
