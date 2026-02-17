//! Chat — two-panel messaging UI with XMTP-backed conversations.
//!
//! Auto-connects to XMTP when authenticated. Falls back to empty state
//! when not connected. Messages stream in real-time.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::input::{Input, InputEvent, InputState};
use gpui_component::theme::Theme;
use gpui_component::{ActiveTheme, StyledExt};
use serde::{Deserialize, Serialize};

use crate::shared::address::{abbreviate_address, is_evm_address};
use crate::voice::desktop_handoff::{jacktrip_web_url, launch_jacktrip_desktop};
use crate::voice::{ChatHistoryItem, ScarlettVoiceController, VoiceSnapshot, VoiceState};
use crate::xmtp_service::{XmtpMessage, XmtpService};
use identity::resolve_recipient_identifier;

mod compose;
mod conversations;
mod handoff;
mod helpers;
mod identity;
mod messaging;
mod model;
mod status;
mod streams;
mod theme;
mod view;
mod voice;

pub(super) use model::*;
use theme::{render_avatar_with_flag, Colors};

pub(super) use helpers::{
    encode_jacktrip_invite, format_duration, format_ns_to_time, format_relative_time,
    is_xmtp_identity_validation_error, load_messages_with_dm_reactivate, load_scarlett_messages,
    lock_xmtp, make_scarlett_message, make_user_message, normalize_preview_text, now_unix_ns,
    parse_jacktrip_invite, persist_scarlett_messages, preview_text_for_content, run_with_timeout,
    send_with_dm_reactivate, should_trigger_xmtp_hard_reset, JackTripRoomInvite,
};

const SCARLETT_CONVERSATION_ID: &str = "ai-scarlett";
const SCARLETT_NAME: &str = "Scarlett";
const SCARLETT_INTRO: &str = "Hey, I'm Scarlett. I will match you with other users who like your music and meet your preferences to make new friends or date!\n\nThen one of you can book a karaoke room and sing with each other. A great way to break the ice and make new friends in the metaverse.";

// =============================================================================
// ChatView
// =============================================================================

pub struct ChatView {
    xmtp: Arc<Mutex<XmtpService>>,
    conversations: Vec<ConversationItem>,
    active_conversation_id: Option<String>,
    messages: Vec<ChatMessage>,
    scarlett_messages: Vec<ChatMessage>,
    input_state: Entity<InputState>,
    compose_input_state: Entity<InputState>,
    own_address: Option<String>,
    /// XMTP connection status
    connected: bool,
    connecting: bool,
    connect_error: Option<String>,
    compose_open: bool,
    compose_submitting: bool,
    compose_error: Option<String>,
    ai_sending: bool,
    voice_controller: Arc<Mutex<ScarlettVoiceController>>,
    voice_error: Option<String>,
    session_handoff: HashMap<String, SessionHandoffState>,
    disappearing_message_seconds: HashMap<String, DisappearingMessageState>,
    xmtp_hard_reset_attempted: bool,
    global_stream_generation: u64,
    last_stream_refresh_at: Option<Instant>,
}

impl ChatView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input_state = cx.new(|cx| InputState::new(window, cx).placeholder("Type a message..."));
        let compose_input_state = cx.new(|cx| {
            InputState::new(window, cx).placeholder("0x..., alice, alice.heaven, alice.eth")
        });

        cx.subscribe_in(
            &input_state,
            window,
            |this: &mut Self, _entity, event: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { secondary: false } = event {
                    this.handle_send_message(window, cx);
                }
            },
        )
        .detach();
        cx.subscribe_in(
            &compose_input_state,
            window,
            |this: &mut Self, _entity, event: &InputEvent, _window, cx| {
                if let InputEvent::PressEnter { secondary: false } = event {
                    if this.compose_open {
                        this.handle_compose_submit(cx);
                    }
                }
            },
        )
        .detach();

        let own_address = cx
            .try_global::<crate::auth::AuthState>()
            .and_then(|auth| auth.display_address().map(|a| a.to_string()));

        let xmtp = Arc::new(Mutex::new(
            XmtpService::new().expect("Failed to create XmtpService"),
        ));
        let voice_controller = Arc::new(Mutex::new(ScarlettVoiceController::new()));
        let scarlett_messages = Self::load_or_init_scarlett_messages(own_address.as_deref());

        // Observe auth state changes — auto-connect when authenticated
        cx.observe_global::<crate::auth::AuthState>(|this, cx| {
            this.on_auth_changed(cx);
        })
        .detach();

        let mut view = Self {
            xmtp,
            conversations: Vec::new(),
            active_conversation_id: None,
            messages: Vec::new(),
            scarlett_messages,
            input_state,
            compose_input_state,
            own_address: own_address.clone(),
            connected: false,
            connecting: false,
            connect_error: None,
            compose_open: false,
            compose_submitting: false,
            compose_error: None,
            ai_sending: false,
            voice_controller: voice_controller.clone(),
            voice_error: None,
            session_handoff: HashMap::new(),
            disappearing_message_seconds: HashMap::new(),
            xmtp_hard_reset_attempted: false,
            global_stream_generation: 0,
            last_stream_refresh_at: None,
        };
        view.ensure_scarlett_conversation();

        // If already authenticated on construction, connect immediately
        if own_address.is_some() {
            view.try_connect(cx);
        }

        // Voice event ticker for speaking status + call state updates.
        // Only ticks at 300ms when a voice call is active; sleeps at 2s otherwise.
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                let is_call_active = voice_controller
                    .lock()
                    .map(|v| !matches!(v.snapshot().state, VoiceState::Idle))
                    .unwrap_or(false);
                let interval = if is_call_active { 300 } else { 2000 };
                smol::Timer::after(Duration::from_millis(interval)).await;

                let voice_changed = match voice_controller.lock() {
                    Ok(mut voice) => voice.tick(),
                    Err(poisoned) => poisoned.into_inner().tick(),
                };

                let should_continue = this
                    .update(cx, |_this, cx| {
                        if voice_changed {
                            cx.notify();
                        }
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
            },
        )
        .detach();

        // Disappearing messages ticker: prune expired messages while a thread is open.
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                smol::Timer::after(Duration::from_millis(1000)).await;
                let should_continue = this
                    .update(cx, |this, cx| {
                        if this.messages.is_empty() {
                            return;
                        }
                        let now_ns = now_unix_ns();
                        let before = this.messages.len();
                        this.messages.retain(|m| {
                            m.expires_at_ns
                                .map(|expires_at| now_ns < expires_at)
                                .unwrap_or(true)
                        });
                        if this.messages.len() != before {
                            cx.notify();
                        }
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
            },
        )
        .detach();

        view
    }

    fn load_or_init_scarlett_messages(owner_address: Option<&str>) -> Vec<ChatMessage> {
        let mut scarlett_messages = load_scarlett_messages(owner_address);
        if scarlett_messages.is_empty() {
            log::info!(
                "[Chat] Initializing Scarlett history for owner={} with intro message",
                owner_address.unwrap_or("<none>")
            );
            scarlett_messages.push(make_scarlett_message(SCARLETT_INTRO.to_string()));
            if let Err(err) = persist_scarlett_messages(owner_address, &scarlett_messages) {
                log::warn!("[Chat] Failed to persist initial Scarlett history: {err}");
            }
        }
        scarlett_messages
    }

    pub(super) fn reload_scarlett_history_for_current_owner(&mut self) {
        log::info!(
            "[Chat] Reloading Scarlett history for owner={}",
            self.own_address.as_deref().unwrap_or("<none>")
        );
        self.scarlett_messages = Self::load_or_init_scarlett_messages(self.own_address.as_deref());
        if self.active_conversation_id.as_deref() == Some(SCARLETT_CONVERSATION_ID)
            || self.active_conversation_id.is_none()
        {
            self.messages = self.scarlett_messages.clone();
        }
        self.ensure_scarlett_conversation();
    }
}
