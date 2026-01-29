mod auth;
mod audio;
mod jacktrip;

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
        .setup(move |app| {
            let app_dir = app.path().app_data_dir().ok();

            // Load persisted auth
            if let Some(ref dir) = app_dir {
                std::fs::create_dir_all(dir).ok();

                if let Some(persisted) = auth::load_from_disk(dir) {
                    log::info!("Loaded persisted auth: {:?}", persisted.pkp_address);
                    let mut st = state.blocking_write();
                    st.auth = Some(persisted);
                    st.app_dir = Some(dir.clone());
                }
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            let audio_state = AudioState::new(app.handle().clone())
                .expect("failed to init audio");
            app.manage(audio_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_authenticated,
            get_auth,
            start_passkey_auth,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
