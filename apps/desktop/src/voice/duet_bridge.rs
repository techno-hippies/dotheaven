use std::env;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::shared::config::duet_worker_base_url as shared_duet_worker_base_url;

use super::agora_engine::{AgoraEngineEvent, AgoraNativeEngine};
mod audio_source;
mod cli_runner;
mod launch;
mod linux_audio_setup;
use audio_source::DefaultSourceGuard;

const DEFAULT_REFRESH_FLOOR_SECONDS: u64 = 30;
const DEFAULT_RETRY_SECONDS: u64 = 10;
const DEFAULT_POLL_INTERVAL_MILLIS: u64 = 500;
const REFRESH_EARLY_BUFFER_SECONDS: u64 = 120;

#[derive(Clone, Debug)]
pub struct NativeBridgeLaunchConfig<'a> {
    pub room_id: &'a str,
    pub bridge_ticket: &'a str,
    pub worker_url: &'a str,
    pub agora_app_id: Option<&'a str>,
    pub china_cn_only: bool,
    pub refresh_seconds: Option<u64>,
    pub pulse_source: Option<&'a str>,
}

pub use cli_runner::maybe_run_duet_bridge_from_cli;
pub use launch::{
    duet_bridge_pulse_source, duet_bridge_refresh_seconds, duet_worker_base_url,
    launch_native_bridge_process, native_bridge_disabled_reason, native_bridge_supported,
};
pub use linux_audio_setup::{
    current_linux_default_source, restore_linux_default_input_source, setup_linux_duet_audio_source,
};

#[derive(Debug, Clone)]
struct CliConfig {
    room_id: String,
    bridge_ticket: String,
    worker_url: String,
    agora_app_id: Option<String>,
    china_cn_only: bool,
    refresh_override_seconds: Option<u64>,
    pulse_source: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct BridgeTokenResponse {
    ok: Option<bool>,
    error: Option<String>,
    agora_app_id: Option<String>,
    agora_channel: Option<String>,
    agora_broadcaster_uid: Option<u32>,
    agora_broadcaster_token: Option<String>,
    token_expires_in_seconds: Option<u32>,
}
