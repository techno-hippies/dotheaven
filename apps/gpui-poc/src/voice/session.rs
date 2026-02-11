#![allow(dead_code)]

use std::time::Instant;

use crate::xmtp_service::XmtpService;

use super::jacktrip::{JackTripConfig, JackTripController};
use super::transport::{
    negotiate_transport, BridgeAvailability, ResolvedTransport, VoiceCapabilities,
    VoiceSignalEnvelope, VoiceSignalEvent,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionVoiceState {
    Idle,
    Connecting,
    Connected,
    Error,
}

#[derive(Clone, Debug)]
pub struct SessionVoiceSnapshot {
    pub state: SessionVoiceState,
    pub active_transport: Option<ResolvedTransport>,
    pub duration_seconds: u64,
    pub last_error: Option<String>,
}

impl Default for SessionVoiceSnapshot {
    fn default() -> Self {
        Self {
            state: SessionVoiceState::Idle,
            active_transport: None,
            duration_seconds: 0,
            last_error: None,
        }
    }
}

pub struct SessionVoiceController {
    jacktrip: JackTripController,
    jacktrip_config: JackTripConfig,
    bridge_availability: BridgeAvailability,
    state: SessionVoiceState,
    active_transport: Option<ResolvedTransport>,
    active_session_id: Option<String>,
    connected_since: Option<Instant>,
    last_error: Option<String>,
}

impl Default for SessionVoiceController {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionVoiceController {
    pub fn new() -> Self {
        Self {
            jacktrip: JackTripController::new(),
            jacktrip_config: JackTripConfig::default(),
            bridge_availability: if env_truthy("HEAVEN_SESSION_BRIDGE_ENABLED") {
                BridgeAvailability::Enabled
            } else {
                BridgeAvailability::Disabled
            },
            state: SessionVoiceState::Idle,
            active_transport: None,
            active_session_id: None,
            connected_since: None,
            last_error: None,
        }
    }

    pub fn snapshot(&self) -> SessionVoiceSnapshot {
        let duration_seconds = self
            .connected_since
            .map(|started| started.elapsed().as_secs())
            .unwrap_or(0);
        SessionVoiceSnapshot {
            state: self.state,
            active_transport: self.active_transport,
            duration_seconds,
            last_error: self.last_error.clone(),
        }
    }

    pub fn local_capabilities(&self) -> VoiceCapabilities {
        VoiceCapabilities::for_current_client()
    }

    pub fn build_offer(&self, session_id: impl Into<String>) -> VoiceSignalEnvelope {
        VoiceSignalEnvelope::offer(session_id, self.local_capabilities())
    }

    pub fn build_accept(&self, session_id: impl Into<String>) -> VoiceSignalEnvelope {
        VoiceSignalEnvelope::accept(session_id, self.local_capabilities())
    }

    pub fn send_offer_signal(
        &self,
        xmtp: &XmtpService,
        conversation_id: &str,
        session_id: &str,
    ) -> Result<VoiceSignalEnvelope, String> {
        let offer = self.build_offer(session_id);
        xmtp.send_voice_signal(conversation_id, &offer)?;
        Ok(offer)
    }

    pub fn send_response_signal(
        &self,
        xmtp: &XmtpService,
        conversation_id: &str,
        session_id: &str,
        remote: &VoiceCapabilities,
    ) -> Result<VoiceSignalEnvelope, String> {
        let response = self.respond_to_offer(session_id, remote);
        xmtp.send_voice_signal(conversation_id, &response)?;
        Ok(response)
    }

    pub fn extract_remote_capabilities(signal: &VoiceSignalEnvelope) -> Option<&VoiceCapabilities> {
        match &signal.event {
            VoiceSignalEvent::Offer { capabilities, .. }
            | VoiceSignalEvent::Accept { capabilities, .. } => Some(capabilities),
            VoiceSignalEvent::Reject { .. } => None,
        }
    }

    pub fn respond_to_offer(
        &self,
        session_id: &str,
        remote: &VoiceCapabilities,
    ) -> VoiceSignalEnvelope {
        match self.negotiate_with_remote(remote) {
            Ok(_) => self.build_accept(session_id),
            Err(err) => VoiceSignalEnvelope::reject(session_id, err),
        }
    }

    pub fn negotiate_with_remote(
        &self,
        remote: &VoiceCapabilities,
    ) -> Result<ResolvedTransport, String> {
        negotiate_transport(&self.local_capabilities(), remote, self.bridge_availability)
    }

    pub fn start_with_remote(
        &mut self,
        session_id: &str,
        remote: &VoiceCapabilities,
    ) -> Result<ResolvedTransport, String> {
        self.state = SessionVoiceState::Connecting;
        self.last_error = None;

        let selected = match self.negotiate_with_remote(remote) {
            Ok(selected) => selected,
            Err(err) => {
                self.mark_error(err.clone());
                return Err(err);
            }
        };

        match selected {
            ResolvedTransport::Direct(super::transport::VoiceTransport::Jacktrip)
            | ResolvedTransport::Bridged(_) => {
                if let Err(err) = self
                    .jacktrip
                    .connect(&self.jacktrip_config.server, self.jacktrip_config.port)
                {
                    self.mark_error(err.clone());
                    return Err(err);
                }
            }
            ResolvedTransport::Direct(super::transport::VoiceTransport::Agora) => {
                let err = "Session voice over direct Agora is not available in GPUI desktop yet."
                    .to_string();
                self.mark_error(err.clone());
                return Err(err);
            }
        }

        self.active_transport = Some(selected);
        self.active_session_id = Some(session_id.to_string());
        self.connected_since = Some(Instant::now());
        self.state = SessionVoiceState::Connected;
        Ok(selected)
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if matches!(
            self.active_transport,
            Some(ResolvedTransport::Direct(
                super::transport::VoiceTransport::Jacktrip
            )) | Some(ResolvedTransport::Bridged(_))
        ) {
            self.jacktrip.disconnect()?;
        }

        self.state = SessionVoiceState::Idle;
        self.active_transport = None;
        self.active_session_id = None;
        self.connected_since = None;
        self.last_error = None;
        Ok(())
    }

    fn mark_error(&mut self, err: String) {
        self.state = SessionVoiceState::Error;
        self.last_error = Some(err);
        self.active_transport = None;
        self.active_session_id = None;
        self.connected_since = None;
    }
}

fn env_truthy(key: &str) -> bool {
    std::env::var(key)
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}
