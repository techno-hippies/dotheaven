use super::*;

const VOICE_SIGNAL_PREFIX: &str = "[heaven-voice-v1]";

pub(super) fn dm_consent_states() -> Vec<ConsentState> {
    vec![ConsentState::Allowed, ConsentState::Unknown]
}

pub(super) fn decode_text(msg: &StoredGroupMessage) -> Option<String> {
    if msg.kind != GroupMessageKind::Application {
        return None;
    }
    let encoded = EncodedContent::decode(msg.decrypted_message_bytes.as_slice()).ok()?;
    let type_id = encoded.r#type.as_ref()?.type_id.as_str();
    if type_id != "text" && type_id != "markdown" {
        return None;
    }
    TextCodec::decode(encoded).ok()
}

pub(super) fn encode_voice_signal_text(signal: &VoiceSignalEnvelope) -> Result<String, String> {
    let json = signal.to_json()?;
    Ok(format!("{VOICE_SIGNAL_PREFIX}{json}"))
}

pub(super) fn parse_voice_signal_text(content: &str) -> Option<VoiceSignalEnvelope> {
    let trimmed = content.trim();
    if !trimmed.starts_with(VOICE_SIGNAL_PREFIX) {
        return None;
    }
    let payload = &trimmed[VOICE_SIGNAL_PREFIX.len()..];
    VoiceSignalEnvelope::from_json(payload).ok()
}

pub(super) fn msg_to_json(msg: &StoredGroupMessage, conversation_id: &str) -> Option<XmtpMessage> {
    let content = decode_text(msg)?;
    if parse_voice_signal_text(&content).is_some() {
        return None;
    }
    Some(XmtpMessage {
        id: hex::encode(&msg.id),
        conversation_id: conversation_id.to_string(),
        sender_address: msg.sender_inbox_id.clone(),
        content,
        sent_at_ns: msg.sent_at_ns.to_string(),
        kind: "application".to_string(),
    })
}

pub(super) fn get_client(client: &Option<Arc<XmtpClient>>) -> Result<Arc<XmtpClient>, String> {
    client
        .as_ref()
        .cloned()
        .ok_or_else(|| "XMTP not connected".to_string())
}

pub(super) fn app_data_dir() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("heaven-gpui")
}

#[derive(Debug)]
pub(super) enum ConnectBuildError {
    TooManyInstallations {
        inbox_id: String,
        count: usize,
        max: usize,
    },
    Other(String),
}

pub(super) fn map_builder_error(err: ClientBuilderError) -> ConnectBuildError {
    match err {
        ClientBuilderError::Identity(IdentityError::TooManyInstallations {
            inbox_id,
            count,
            max,
        }) => ConnectBuildError::TooManyInstallations {
            inbox_id,
            count,
            max,
        },
        ClientBuilderError::ClientError(ClientError::Identity(
            IdentityError::TooManyInstallations {
                inbox_id,
                count,
                max,
            },
        )) => ConnectBuildError::TooManyInstallations {
            inbox_id,
            count,
            max,
        },
        other => ConnectBuildError::Other(format!("build: {other}")),
    }
}
