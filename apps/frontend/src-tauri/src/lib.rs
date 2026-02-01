mod auth;
mod audio;
mod jacktrip;
mod music_db;
mod xmtp;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::RwLock;

use auth::{AuthResult, PersistedAuth};
use audio::{
    audio_pause, audio_play, audio_resume, audio_seek, audio_set_volume, audio_stop, AudioState,
};
use jacktrip::{
    check_jacktrip_dependencies, connect_jack_port, connect_jacktrip, disconnect_jack_port,
    disconnect_jacktrip, is_jacktrip_connected, list_jack_ports, JacktripState,
};

// =============================================================================
// State
// =============================================================================

pub struct AppState {
    pub auth: Option<PersistedAuth>,
    pub app_dir: Option<PathBuf>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            auth: None,
            app_dir: None,
        }
    }
}

pub type SharedState = Arc<RwLock<AppState>>;

// =============================================================================
// Commands - Auth
// =============================================================================

#[tauri::command]
async fn is_authenticated(state: State<'_, SharedState>) -> Result<bool, String> {
    let st = state.read().await;
    Ok(st.auth.is_some())
}

#[tauri::command]
async fn get_auth(state: State<'_, SharedState>) -> Result<Option<PersistedAuth>, String> {
    let st = state.read().await;
    Ok(st.auth.clone())
}

#[tauri::command]
async fn start_passkey_auth(app: tauri::AppHandle) -> Result<(), String> {
    auth::start_passkey_auth(app).await
}

#[tauri::command]
async fn start_eoa_auth(app: tauri::AppHandle) -> Result<(), String> {
    auth::start_eoa_auth(app).await
}

#[tauri::command]
async fn save_auth(
    app: tauri::AppHandle,
    state: State<'_, SharedState>,
    auth_result: AuthResult,
) -> Result<(), String> {
    let persisted = PersistedAuth {
        pkp_address: auth_result.pkp_address,
        pkp_public_key: auth_result.pkp_public_key,
        pkp_token_id: auth_result.pkp_token_id,
        auth_method_type: auth_result.auth_method_type,
        auth_method_id: auth_result.auth_method_id,
        access_token: auth_result.access_token,
    };

    // Update in-memory state
    {
        let mut st = state.write().await;
        st.auth = Some(persisted.clone());
    }

    // Persist to disk
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app_data_dir: {}", e))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    auth::save_to_disk(&app_dir, &persisted)?;

    log::info!("Auth saved to disk");
    Ok(())
}

#[tauri::command]
async fn sign_out(app: tauri::AppHandle, state: State<'_, SharedState>) -> Result<(), String> {
    // Clear in-memory state
    {
        let mut st = state.write().await;
        st.auth = None;
    }

    // Delete from disk
    if let Ok(app_dir) = app.path().app_data_dir() {
        auth::delete_from_disk(&app_dir);
    }

    log::info!("Signed out");
    Ok(())
}

// =============================================================================
// App Entry Point
// =============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let state: SharedState = Arc::new(RwLock::new(AppState::default()));
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state.clone())
        .manage(JacktripState::default())
        .manage(xmtp::XmtpState::default())
        .manage(music_db::MusicDbState::empty())
        .setup(move |app| {
            // Audio thread — cheap: just spawns a thread + channel, no device probing
            let audio_state = AudioState::new(app.handle().clone())
                .expect("failed to init audio");
            app.manage(audio_state);

            // Defer all disk I/O off the main thread so the window paints immediately
            let app_handle = app.handle().clone();
            let app_dir = app.path().app_data_dir().ok();
            let music_db_state: music_db::MusicDbState = app.state::<music_db::MusicDbState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                // Load persisted auth
                if let Some(ref dir) = app_dir {
                    let dir = dir.clone();
                    let state = state.clone();
                    let loaded = tokio::task::spawn_blocking(move || {
                        std::fs::create_dir_all(&dir).ok();
                        auth::load_from_disk(&dir).map(|p| (p, dir))
                    })
                    .await
                    .ok()
                    .flatten();

                    if let Some((persisted, dir)) = loaded {
                        log::info!("Loaded persisted auth: {:?}", persisted.pkp_address);
                        let mut st = state.write().await;
                        st.auth = Some(persisted);
                        st.app_dir = Some(dir);
                    }
                }

                // Open MusicDb (SQLite open + schema creation)
                let db_dir = app_handle.path().app_data_dir().ok();
                if let Some(dir) = db_dir {
                    match tokio::task::spawn_blocking(move || music_db::MusicDb::open(&dir)).await {
                        Ok(Ok(db)) => {
                            music_db_state.init(db);
                            log::info!("MusicDb ready");
                        }
                        Ok(Err(e)) => log::error!("Failed to open MusicDb: {e}"),
                        Err(e) => log::error!("MusicDb task panicked: {e}"),
                    }
                }

                // DevTools — deferred so it doesn't block window paint
                #[cfg(debug_assertions)]
                {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        window.open_devtools();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_authenticated,
            get_auth,
            start_passkey_auth,
            start_eoa_auth,
            save_auth,
            sign_out,
            audio_play,
            audio_pause,
            audio_resume,
            audio_seek,
            audio_stop,
            audio_set_volume,
            check_jacktrip_dependencies,
            connect_jack_port,
            connect_jacktrip,
            disconnect_jack_port,
            disconnect_jacktrip,
            is_jacktrip_connected,
            list_jack_ports,
            xmtp::xmtp_init,
            xmtp::xmtp_resolve_signature,
            xmtp::xmtp_disconnect,
            xmtp::xmtp_is_connected,
            xmtp::xmtp_get_inbox_id,
            xmtp::xmtp_list_conversations,
            xmtp::xmtp_get_or_create_conversation,
            xmtp::xmtp_send_message,
            xmtp::xmtp_load_messages,
            xmtp::xmtp_stream_messages,
            xmtp::xmtp_stream_all_messages,
            xmtp::xmtp_update_consent,
            music_db::music_scan_folder,
            music_db::music_get_tracks,
            music_db::music_get_track_count,
            music_db::music_get_folder,
            music_db::music_set_folder,
            music_db::music_set_cover_cid,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
