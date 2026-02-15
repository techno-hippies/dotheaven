use gpui::*;
use gpui_component::theme::Theme;
use gpui_component::Root;

use crate::app_shell::{register_zoom_keys, HeavenApp, DEFAULT_FONT_SIZE};
use crate::heaven_http_client::HeavenHttpClient;
use crate::icons::CombinedAssets;
use crate::theme::apply_heaven_theme;
use crate::{auth, scrobble_refresh, status_center, voice};
use std::sync::Arc;

pub(crate) fn run() {
    dotenvy::dotenv().ok();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    if let Some(exit_code) = voice::duet_bridge::maybe_run_duet_bridge_from_cli() {
        std::process::exit(exit_code);
    }

    let app = Application::new()
        .with_assets(CombinedAssets)
        .with_http_client(Arc::new(HeavenHttpClient::new()));

    app.run(move |cx| {
        gpui_component::init(cx);
        apply_heaven_theme(cx);
        register_zoom_keys(cx);

        // Set comfortable default font size (18px).
        Theme::global_mut(cx).font_size = px(DEFAULT_FONT_SIZE);

        // Initialize auth state from disk before rendering the first window.
        let mut initial_auth = auth::AuthState::default();
        if let Some(persisted) = auth::load_from_disk() {
            auth::log_persisted_auth("App startup", &persisted);
            initial_auth.persisted = Some(persisted);
        }
        cx.set_global(initial_auth);
        cx.set_global(scrobble_refresh::ScrobbleRefreshSignal::default());
        cx.set_global(status_center::StatusCenter::default());

        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1400.), px(900.)),
                    cx,
                ))),
                // Ensures Linux/Wayland `app_id` + X11 `WM_CLASS` match a `.desktop` entry,
                // which controls the "desktop icon"/app launcher icon.
                app_id: Some("heaven-gpui-poc".to_string()),
                ..Default::default()
            },
            |window, cx| {
                window.set_rem_size(px(DEFAULT_FONT_SIZE));
                let view = cx.new(|cx| HeavenApp::new(window, cx));
                cx.new(|cx| Root::new(view, window, cx))
            },
        )
        .unwrap();
    });
}
