use super::*;

pub fn maybe_run_duet_bridge_from_cli() -> Option<i32> {
    let args: Vec<String> = env::args().collect();
    if args.get(1).map(|v| v.as_str()) != Some("duet-bridge") {
        return None;
    }

    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("{}", cli_usage());
        return Some(0);
    }

    let cfg = match parse_cli_config(&args[2..]) {
        Ok(cfg) => cfg,
        Err(err) => {
            eprintln!("{err}");
            eprintln!("{}", cli_usage());
            return Some(1);
        }
    };

    match run_bridge(cfg) {
        Ok(()) => Some(0),
        Err(err) => {
            eprintln!("[duet-bridge] {err}");
            Some(1)
        }
    }
}

fn parse_cli_config(args: &[String]) -> Result<CliConfig, String> {
    let mut cfg = CliConfig {
        room_id: String::new(),
        bridge_ticket: String::new(),
        worker_url: duet_worker_base_url(),
        agora_app_id: None,
        china_cn_only: env_truthy("HEAVEN_AGORA_CN_ONLY"),
        refresh_override_seconds: None,
        pulse_source: None,
    };

    let mut idx = 0usize;
    while idx < args.len() {
        let arg = args[idx].as_str();
        match arg {
            "--room" => {
                idx += 1;
                cfg.room_id = args
                    .get(idx)
                    .ok_or_else(|| "missing value for --room".to_string())?
                    .to_string();
            }
            "--bridge-ticket" => {
                idx += 1;
                cfg.bridge_ticket = args
                    .get(idx)
                    .ok_or_else(|| "missing value for --bridge-ticket".to_string())?
                    .to_string();
            }
            "--worker-url" => {
                idx += 1;
                cfg.worker_url = args
                    .get(idx)
                    .ok_or_else(|| "missing value for --worker-url".to_string())?
                    .to_string();
            }
            "--agora-app-id" => {
                idx += 1;
                cfg.agora_app_id = Some(
                    args.get(idx)
                        .ok_or_else(|| "missing value for --agora-app-id".to_string())?
                        .to_string(),
                );
            }
            "--china-cn-only" => {
                cfg.china_cn_only = true;
            }
            "--refresh-seconds" => {
                idx += 1;
                let raw = args
                    .get(idx)
                    .ok_or_else(|| "missing value for --refresh-seconds".to_string())?;
                let parsed = raw
                    .parse::<u64>()
                    .map_err(|_| format!("invalid --refresh-seconds value: {raw}"))?;
                cfg.refresh_override_seconds = Some(parsed.max(DEFAULT_REFRESH_FLOOR_SECONDS));
            }
            "--pulse-source" => {
                idx += 1;
                cfg.pulse_source = Some(
                    args.get(idx)
                        .ok_or_else(|| "missing value for --pulse-source".to_string())?
                        .to_string(),
                );
            }
            other => {
                return Err(format!("unknown argument: {other}"));
            }
        }
        idx += 1;
    }

    if cfg.room_id.trim().is_empty() {
        return Err("--room is required".to_string());
    }
    if cfg.bridge_ticket.trim().is_empty() {
        return Err("--bridge-ticket is required".to_string());
    }

    Ok(cfg)
}

fn run_bridge(cfg: CliConfig) -> Result<(), String> {
    let _source_guard = if let Some(source_name) = cfg.pulse_source.as_ref() {
        Some(DefaultSourceGuard::set(source_name)?)
    } else {
        None
    };

    log::info!(
        "[duet-bridge] starting: room_id={}, worker_url={}",
        cfg.room_id,
        cfg.worker_url
    );

    let mut token = fetch_bridge_token(&cfg.worker_url, &cfg.room_id, &cfg.bridge_ticket)?;

    let app_id = cfg
        .agora_app_id
        .clone()
        .or_else(|| token.agora_app_id.clone())
        .or_else(|| env::var("HEAVEN_AGORA_APP_ID").ok())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| {
            "missing Agora app id. Pass --agora-app-id or set HEAVEN_AGORA_APP_ID".to_string()
        })?;

    let mut engine = connect_engine(&app_id, &token, cfg.china_cn_only)?;
    let mut next_refresh_at = Instant::now() + refresh_after(&token, cfg.refresh_override_seconds);

    loop {
        if Instant::now() >= next_refresh_at {
            match fetch_bridge_token(&cfg.worker_url, &cfg.room_id, &cfg.bridge_ticket) {
                Ok(next_token) => {
                    token = next_token;
                    if let Err(err) = engine.leave() {
                        log::warn!("[duet-bridge] leave before refresh failed: {err}");
                    }
                    engine = connect_engine(&app_id, &token, cfg.china_cn_only)?;
                    next_refresh_at =
                        Instant::now() + refresh_after(&token, cfg.refresh_override_seconds);
                }
                Err(err) => {
                    log::warn!("[duet-bridge] token refresh failed: {err}");
                    next_refresh_at = Instant::now() + Duration::from_secs(DEFAULT_RETRY_SECONDS);
                }
            }
        }

        match engine.poll_events() {
            Ok(events) => {
                for event in events {
                    match event {
                        AgoraEngineEvent::UserJoined(uid) => {
                            log::info!("[duet-bridge] remote user joined: uid={uid}");
                        }
                        AgoraEngineEvent::UserLeft(uid) => {
                            log::info!("[duet-bridge] remote user left: uid={uid}");
                        }
                        AgoraEngineEvent::BotSpeaking => {}
                        AgoraEngineEvent::BotSilent => {}
                        AgoraEngineEvent::Error(err) => {
                            log::warn!("[duet-bridge] agora event error: {err}");
                        }
                    }
                }
            }
            Err(err) => {
                log::warn!("[duet-bridge] poll failed: {err}");
            }
        }

        thread::sleep(Duration::from_millis(DEFAULT_POLL_INTERVAL_MILLIS));
    }
}

fn connect_engine(
    app_id: &str,
    token: &BridgeTokenResponse,
    china_cn_only: bool,
) -> Result<AgoraNativeEngine, String> {
    let channel = token
        .agora_channel
        .as_ref()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "bridge token missing agora_channel".to_string())?;
    let broadcaster_token = token
        .agora_broadcaster_token
        .as_ref()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "bridge token missing agora_broadcaster_token".to_string())?;
    let uid = token
        .agora_broadcaster_uid
        .ok_or_else(|| "bridge token missing agora_broadcaster_uid".to_string())?;

    let mut engine = AgoraNativeEngine::new(app_id)?;
    if china_cn_only {
        engine.set_cn_only(true)?;
    }
    engine.join(channel, broadcaster_token, uid)?;
    engine.set_mic_enabled(true)?;

    log::info!(
        "[duet-bridge] joined agora channel={} uid={} token_ttl={}s",
        channel,
        uid,
        token.token_expires_in_seconds.unwrap_or(0)
    );

    Ok(engine)
}

fn fetch_bridge_token(
    worker_url: &str,
    room_id: &str,
    bridge_ticket: &str,
) -> Result<BridgeTokenResponse, String> {
    let url = format!(
        "{}/duet/{}/bridge/token",
        worker_url.trim_end_matches('/'),
        room_id
    );

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {bridge_ticket}"))
        .send_json(serde_json::json!({}))
        .map_err(|e| format!("bridge token request failed: {e}"))?;

    let status = response.status().as_u16();
    let body_text = response.body_mut().read_to_string().unwrap_or_default();

    if !(200..300).contains(&status) {
        return Err(format!(
            "bridge token failed (HTTP {status}) at {url}: {}",
            parse_error_message(&body_text)
        ));
    }

    let parsed: BridgeTokenResponse =
        serde_json::from_str(&body_text).map_err(|e| format!("invalid bridge token JSON: {e}"))?;
    if parsed.ok == Some(false) {
        return Err(parsed
            .error
            .unwrap_or_else(|| "bridge token returned ok=false".to_string()));
    }

    Ok(parsed)
}

fn refresh_after(token: &BridgeTokenResponse, override_seconds: Option<u64>) -> Duration {
    if let Some(seconds) = override_seconds {
        return Duration::from_secs(seconds.max(DEFAULT_REFRESH_FLOOR_SECONDS));
    }

    let ttl = token.token_expires_in_seconds.unwrap_or(300) as u64;
    if ttl > REFRESH_EARLY_BUFFER_SECONDS {
        Duration::from_secs((ttl - REFRESH_EARLY_BUFFER_SECONDS).max(DEFAULT_REFRESH_FLOOR_SECONDS))
    } else {
        Duration::from_secs(DEFAULT_REFRESH_FLOOR_SECONDS)
    }
}

fn parse_error_message(body: &str) -> String {
    #[derive(Deserialize)]
    struct ErrorBody {
        error: Option<String>,
    }
    serde_json::from_str::<ErrorBody>(body)
        .ok()
        .and_then(|v| v.error)
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| body.trim().to_string())
}

fn env_truthy(key: &str) -> bool {
    env::var(key)
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

fn cli_usage() -> &'static str {
    "Usage:\n  heaven-desktop duet-bridge --room <room_id> --bridge-ticket <ticket> [--worker-url <url>] [--agora-app-id <id>] [--china-cn-only] [--refresh-seconds <n>] [--pulse-source <source_name>]\n\nExample:\n  heaven-desktop duet-bridge --room <room_id> --bridge-ticket <ticket> --worker-url https://session-voice.deletion-backup782.workers.dev"
}
