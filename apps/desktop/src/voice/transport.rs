#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VoiceTransport {
    Jacktrip,
    Agora,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VoicePlatform {
    Desktop,
    Web,
    Mobile,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeRoute {
    JacktripAgora,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BridgeAvailability {
    Disabled,
    Enabled,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VoiceCapabilities {
    pub platform: VoicePlatform,
    pub supported_transports: Vec<VoiceTransport>,
}

impl VoiceCapabilities {
    pub fn new(platform: VoicePlatform, supported_transports: Vec<VoiceTransport>) -> Self {
        let mut deduped = Vec::new();
        for transport in supported_transports {
            if !deduped.contains(&transport) {
                deduped.push(transport);
            }
        }
        Self {
            platform,
            supported_transports: deduped,
        }
    }

    pub fn for_current_client() -> Self {
        if cfg!(target_arch = "wasm32") {
            Self::new(VoicePlatform::Web, vec![VoiceTransport::Agora])
        } else if cfg!(any(target_os = "android", target_os = "ios")) {
            Self::new(VoicePlatform::Mobile, vec![VoiceTransport::Agora])
        } else {
            // GPUI desktop defaults to JackTrip for session/P2P voice.
            Self::new(VoicePlatform::Desktop, vec![VoiceTransport::Jacktrip])
        }
    }

    pub fn supports(&self, transport: VoiceTransport) -> bool {
        self.supported_transports.contains(&transport)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResolvedTransport {
    Direct(VoiceTransport),
    Bridged(BridgeRoute),
}

fn preferred_transports(platform: VoicePlatform) -> [VoiceTransport; 2] {
    match platform {
        VoicePlatform::Desktop => [VoiceTransport::Jacktrip, VoiceTransport::Agora],
        VoicePlatform::Web | VoicePlatform::Mobile => {
            [VoiceTransport::Agora, VoiceTransport::Jacktrip]
        }
        VoicePlatform::Unknown => [VoiceTransport::Jacktrip, VoiceTransport::Agora],
    }
}

pub fn negotiate_transport(
    local: &VoiceCapabilities,
    remote: &VoiceCapabilities,
    bridge: BridgeAvailability,
) -> Result<ResolvedTransport, String> {
    for transport in preferred_transports(local.platform) {
        if local.supports(transport) && remote.supports(transport) {
            return Ok(ResolvedTransport::Direct(transport));
        }
    }

    let mixed_jacktrip_agora = (local.supports(VoiceTransport::Jacktrip)
        && remote.supports(VoiceTransport::Agora))
        || (local.supports(VoiceTransport::Agora) && remote.supports(VoiceTransport::Jacktrip));

    if mixed_jacktrip_agora {
        if matches!(bridge, BridgeAvailability::Enabled) {
            return Ok(ResolvedTransport::Bridged(BridgeRoute::JacktripAgora));
        }
        return Err(
            "No direct shared voice transport. This call needs JackTrip<->Agora bridge routing, but bridge is not enabled yet."
                .to_string(),
        );
    }

    Err(format!(
        "No compatible voice transport between peers. local={:?}, remote={:?}",
        local.supported_transports, remote.supported_transports
    ))
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VoiceSignalEnvelope {
    pub version: u8,
    #[serde(flatten)]
    pub event: VoiceSignalEvent,
}

impl VoiceSignalEnvelope {
    pub fn offer(session_id: impl Into<String>, capabilities: VoiceCapabilities) -> Self {
        Self {
            version: 1,
            event: VoiceSignalEvent::Offer {
                session_id: session_id.into(),
                capabilities,
            },
        }
    }

    pub fn accept(session_id: impl Into<String>, capabilities: VoiceCapabilities) -> Self {
        Self {
            version: 1,
            event: VoiceSignalEvent::Accept {
                session_id: session_id.into(),
                capabilities,
            },
        }
    }

    pub fn reject(session_id: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            version: 1,
            event: VoiceSignalEvent::Reject {
                session_id: session_id.into(),
                reason: reason.into(),
            },
        }
    }

    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(self).map_err(|e| format!("serialize voice signal: {e}"))
    }

    pub fn from_json(raw: &str) -> Result<Self, String> {
        serde_json::from_str(raw).map_err(|e| format!("parse voice signal: {e}"))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VoiceSignalEvent {
    Offer {
        session_id: String,
        capabilities: VoiceCapabilities,
    },
    Accept {
        session_id: String,
        capabilities: VoiceCapabilities,
    },
    Reject {
        session_id: String,
        reason: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_defaults_to_jacktrip() {
        let caps = VoiceCapabilities::for_current_client();
        if caps.platform == VoicePlatform::Desktop {
            assert_eq!(caps.supported_transports, vec![VoiceTransport::Jacktrip]);
        }
    }

    #[test]
    fn desktop_to_desktop_prefers_jacktrip() {
        let local = VoiceCapabilities::new(
            VoicePlatform::Desktop,
            vec![VoiceTransport::Jacktrip, VoiceTransport::Agora],
        );
        let remote = VoiceCapabilities::new(VoicePlatform::Desktop, vec![VoiceTransport::Jacktrip]);

        let selected = negotiate_transport(&local, &remote, BridgeAvailability::Disabled)
            .expect("desktop peers should negotiate direct JackTrip");

        assert_eq!(
            selected,
            ResolvedTransport::Direct(VoiceTransport::Jacktrip)
        );
    }

    #[test]
    fn desktop_to_web_requires_bridge_when_disabled() {
        let desktop =
            VoiceCapabilities::new(VoicePlatform::Desktop, vec![VoiceTransport::Jacktrip]);
        let web = VoiceCapabilities::new(VoicePlatform::Web, vec![VoiceTransport::Agora]);

        let err = negotiate_transport(&desktop, &web, BridgeAvailability::Disabled)
            .expect_err("mixed transport should require bridge");

        assert!(err.contains("JackTrip<->Agora bridge"));
    }

    #[test]
    fn desktop_to_web_uses_bridge_when_enabled() {
        let desktop =
            VoiceCapabilities::new(VoicePlatform::Desktop, vec![VoiceTransport::Jacktrip]);
        let web = VoiceCapabilities::new(VoicePlatform::Web, vec![VoiceTransport::Agora]);

        let selected = negotiate_transport(&desktop, &web, BridgeAvailability::Enabled)
            .expect("bridge-enabled mixed call should resolve");

        assert_eq!(
            selected,
            ResolvedTransport::Bridged(BridgeRoute::JacktripAgora)
        );
    }

    #[test]
    fn voice_signal_round_trip_preserves_supported_transports() {
        let offer = VoiceSignalEnvelope::offer(
            "booking-42",
            VoiceCapabilities::new(
                VoicePlatform::Desktop,
                vec![VoiceTransport::Jacktrip, VoiceTransport::Agora],
            ),
        );

        let json = offer.to_json().expect("signal should serialize");
        let parsed = VoiceSignalEnvelope::from_json(&json).expect("signal should parse");

        assert_eq!(parsed, offer);
    }
}
