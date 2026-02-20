use std::env;

pub fn non_empty_env(key: &str) -> Option<String> {
    env::var(key).ok().filter(|v| !v.trim().is_empty())
}

pub fn bool_env(key: &str) -> bool {
    env::var(key)
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

pub fn duet_worker_base_url() -> String {
    non_empty_env("DUET_WORKER_URL")
        .or_else(|| non_empty_env("VOICE_CONTROL_PLANE_URL"))
        .or_else(|| non_empty_env("HEAVEN_DUET_WORKER_URL"))
        .or_else(|| non_empty_env("HEAVEN_VOICE_WORKER_URL"))
        .unwrap_or_else(|| {
            panic!(
                "Missing duet worker URL. Set DUET_WORKER_URL (or VOICE_CONTROL_PLANE_URL / HEAVEN_DUET_WORKER_URL / HEAVEN_VOICE_WORKER_URL)."
            )
        })
}
