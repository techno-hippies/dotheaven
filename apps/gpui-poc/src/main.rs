mod app_bootstrap;
mod app_shell;
mod audio;
mod auth;
mod chat;
mod discover;
mod heaven_http_client;
mod icons;
mod library;
mod lit_action_registry;
mod lit_wallet;
mod load_storage;
mod lyrics;
mod music_db;
mod pages;
mod profile;
mod rooms;
mod schedule;
mod scrobble;
mod scrobble_refresh;
mod settings;
mod shared;
mod shell;
mod side_player;
mod status_center;
mod theme;
mod ui;
mod voice;
mod wallet;
mod xmtp_service;

fn main() {
    app_bootstrap::run();
}
