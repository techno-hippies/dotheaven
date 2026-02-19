//! XMTP messaging service for GPUI.
//!
//! Port of the legacy desktop XMTP module adapted for GPUI:
//! - No desktop commands/events — plain struct with sync methods
//! - Own tokio runtime for network I/O orchestration
//! - Device-local secp256k1 signing for XMTP identity registration

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::shared::address::is_evm_address;
use crate::voice::transport::VoiceSignalEnvelope;
use futures::StreamExt;
use prost::Message;
use serde::{Deserialize, Serialize};

use xmtp_api::ApiClientWrapper;
use xmtp_api_d14n::MessageBackendBuilder;
use xmtp_common::Retry;
use xmtp_content_types::{text::TextCodec, ContentCodec};
use xmtp_db::{
    encrypted_store::consent_record::ConsentState,
    encrypted_store::group::ConversationType,
    encrypted_store::group_message::{GroupMessageKind, MsgQueryArgs, StoredGroupMessage},
    EncryptedMessageStore, NativeDb, StorageOption,
};
use xmtp_id::associations::{ident, unverified::UnverifiedSignature, Identifier};
use xmtp_mls::{
    builder::ClientBuilderError,
    client::ClientError,
    cursor_store::SqliteCursorStore,
    groups::send_message_opts::SendMessageOpts,
    identity::IdentityError,
    identity::IdentityStrategy,
    identity_updates::{
        apply_signature_request_with_verifier, get_association_state_with_verifier,
        load_identity_updates, revoke_installations_with_verifier,
    },
    Client, MlsContext,
};
use xmtp_proto::xmtp::mls::message_contents::EncodedContent;

mod env;
mod helpers;
mod model;
use env::*;
use helpers::*;
use model::XmtpClient;
pub use model::{ConversationInfo, DisappearingMessageSettings, XmtpMessage};

// ---------------------------------------------------------------------------
// XmtpService
// ---------------------------------------------------------------------------

pub struct XmtpService {
    runtime: tokio::runtime::Runtime,
    client: Option<Arc<XmtpClient>>,
    my_inbox_id: Option<String>,
    my_address: Option<String>,
    last_dm_sync_at: std::sync::Mutex<Option<Instant>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::transport::{VoiceCapabilities, VoicePlatform, VoiceTransport};

    #[test]
    fn voice_signal_text_round_trips() {
        let envelope = VoiceSignalEnvelope::offer(
            "session-123",
            VoiceCapabilities::new(
                VoicePlatform::Desktop,
                vec![VoiceTransport::Jacktrip, VoiceTransport::Agora],
            ),
        );

        let encoded = encode_voice_signal_text(&envelope).expect("encode voice signal");
        let decoded = parse_voice_signal_text(&encoded).expect("decode voice signal");

        assert_eq!(decoded, envelope);
    }

    #[test]
    fn plain_text_is_not_parsed_as_voice_signal() {
        assert!(parse_voice_signal_text("hello world").is_none());
    }
}

mod connection;
mod dm;
mod stream;

impl XmtpService {
    pub fn new() -> Result<Self, String> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create tokio runtime: {e}"))?;

        Ok(Self {
            runtime,
            client: None,
            my_inbox_id: None,
            my_address: None,
            last_dm_sync_at: std::sync::Mutex::new(None),
        })
    }

    #[allow(dead_code)]
    pub fn my_inbox_id(&self) -> Option<&str> {
        self.my_inbox_id.as_deref()
    }

    #[allow(dead_code)]
    pub fn my_address(&self) -> Option<&str> {
        self.my_address.as_deref()
    }
}
