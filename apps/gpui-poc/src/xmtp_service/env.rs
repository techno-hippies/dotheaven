const XMTP_HOST: &str = "https://grpc.dev.xmtp.network:443";
const XMTP_HOST_PROD: &str = "https://grpc.production.xmtp.network:443";

#[derive(Copy, Clone, Debug)]
enum XmtpEnv {
    Dev,
    Production,
}

fn xmtp_env() -> XmtpEnv {
    let raw = std::env::var("HEAVEN_XMTP_ENV")
        .or_else(|_| std::env::var("XMTP_ENV"))
        .unwrap_or_else(|_| "dev".to_string());

    match raw.trim().to_ascii_lowercase().as_str() {
        "prod" | "production" => XmtpEnv::Production,
        _ => XmtpEnv::Dev,
    }
}

pub(super) fn xmtp_env_name() -> &'static str {
    match xmtp_env() {
        XmtpEnv::Dev => "dev",
        XmtpEnv::Production => "production",
    }
}

pub(super) fn xmtp_host() -> &'static str {
    match xmtp_env() {
        XmtpEnv::Dev => XMTP_HOST,
        XmtpEnv::Production => XMTP_HOST_PROD,
    }
}

pub(super) fn xmtp_nonce_override() -> Option<u64> {
    let raw = std::env::var("HEAVEN_XMTP_NONCE")
        .or_else(|_| std::env::var("XMTP_NONCE"))
        .ok()?;
    match raw.trim().parse::<u64>() {
        Ok(value) => Some(value),
        Err(e) => {
            log::warn!("[XMTP] Invalid XMTP nonce override '{raw}': {e}");
            None
        }
    }
}
