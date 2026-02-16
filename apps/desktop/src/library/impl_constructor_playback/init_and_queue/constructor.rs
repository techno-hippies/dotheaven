use super::*;

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
            playlist_share_modal_open: false,
            playlist_share_modal_playlist_id: None,
            playlist_share_modal_playlist_name: None,
            playlist_share_modal_submitting: false,
            playlist_share_modal_error: None,
            share_wallet_input_state: share_wallet_input_state.clone(),
            delete_playlist_modal_open: false,
            delete_playlist_modal_playlist_id: None,
            delete_playlist_modal_playlist_name: None,
            delete_playlist_modal_submitting: false,
            delete_playlist_modal_error: None,
            playlist_cover_update_busy: false,
            playlist_cover_update_playlist_id: None,
            playlist_cover_update_optimistic_path: None,
            playlist_cover_update_error: None,
            playlist_modal_open: false,
            playlist_modal_track_index: None,
            playlist_modal_submitting: false,
            playlist_modal_error: None,
            playlist_modal_loading: false,
            playlist_modal_needs_reauth: false,
            playlist_modal_reauth_busy: false,
            playlist_modal_selected_playlist_id: None,
            playlist_modal_cover_image_path: None,
            playlist_modal_playlists: Vec::new(),
            sidebar_playlists: Vec::new(),
            pending_playlist_mutations: Vec::new(),
            deleted_playlist_tombstones: HashMap::new(),
            playlist_name_input_state: playlist_name_input_state.clone(),
            library_search_input_state: library_search_input_state.clone(),
            track_list_scroll_handle: UniformListScrollHandle::new(),
            shared_track_list_scroll_handle: UniformListScrollHandle::new(),
            artist_detail_track_list_scroll_handle: UniformListScrollHandle::new(),
            album_detail_track_list_scroll_handle: UniformListScrollHandle::new(),
            playlist_detail_track_list_scroll_handle: UniformListScrollHandle::new(),
            search_query: String::new(),
            filtered_indices: Arc::new(Vec::new()),
            search_debounce_seq: 0,
            sort_state: None,
            playback_queue_paths: Vec::new(),
            active_queue_pos: None,
            shared_play_busy: false,
            active_shared_playback: None,
            detail_route: LibraryDetailRoute::Root,
            detail_history: Vec::new(),
            playlist_detail_tracks: Vec::new(),
            playlist_detail_cache: HashMap::new(),
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
                    } else if this.playlist_share_modal_open {
                        this.submit_playlist_share_modal(cx);
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

        cx.observe_global::<auth::AuthState>(|this, cx| {
            match this.mode {
                LibraryMode::Library => this.refresh_uploaded_index_from_auth(),
                LibraryMode::SharedWithMe => this.refresh_shared_records_for_auth(cx),
            }
            this.refresh_sidebar_playlists(cx);
            cx.notify();
        })
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
        this.refresh_sidebar_playlists(cx);
        this
    }
}
