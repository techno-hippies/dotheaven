//! Chat — two-panel messaging UI with XMTP-backed conversations.
//!
//! Auto-connects to XMTP when authenticated. Falls back to empty state
//! when not connected. Messages stream in real-time.

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use alloy_primitives::keccak256;
use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::input::{Input, InputEvent, InputState};
use gpui_component::theme::Theme;
use gpui_component::{ActiveTheme, StyledExt};

use crate::lit_wallet::LitWalletService;
use crate::voice::{ChatHistoryItem, ScarlettVoiceController, VoiceSnapshot, VoiceState};
use crate::xmtp_service::XmtpService;

// =============================================================================
// Data types (UI-side — mapped from xmtp_service types)
// =============================================================================

#[derive(Debug, Clone)]
pub struct ConversationItem {
    pub id: String,
    pub peer_address: String,
    pub peer_display_name: String,
    pub peer_nationality: Option<String>,
    pub last_message: Option<String>,
    pub last_message_at: Option<i64>, // unix millis
    pub unread: bool,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub sender_address: String,
    pub content: String,
    pub sent_at_ns: i64,
    pub is_own: bool,
}

// =============================================================================
// Theme color helpers
// =============================================================================

struct Colors {
    background: Hsla,
    surface: Hsla,
    elevated: Hsla,
    highlight: Hsla,
    highlight_hover: Hsla,
    border: Hsla,
    foreground: Hsla,
    muted_fg: Hsla,
    primary: Hsla,
    primary_fg: Hsla,
    primary_hover: Hsla,
}

impl Colors {
    fn from_theme(theme: &Theme) -> Self {
        Self {
            background: theme.background,
            surface: theme.sidebar,
            elevated: theme.muted,
            highlight: theme.sidebar_accent,
            highlight_hover: theme.secondary_hover,
            border: theme.border,
            foreground: theme.foreground,
            muted_fg: theme.muted_foreground,
            primary: theme.primary,
            primary_fg: theme.primary_foreground,
            primary_hover: theme.primary_hover,
        }
    }
}

// =============================================================================
// Avatar with country flag
// =============================================================================

fn nationality_to_flag(code: &str) -> Option<String> {
    let alpha2 = match code {
        "USA" => "US",
        "GBR" => "GB",
        "FRA" => "FR",
        "DEU" => "DE",
        "JPN" => "JP",
        "CHN" => "CN",
        "KOR" => "KR",
        "BRA" => "BR",
        "IND" => "IN",
        "CAN" => "CA",
        "AUS" => "AU",
        "MEX" => "MX",
        "ESP" => "ES",
        "ITA" => "IT",
        "RUS" => "RU",
        "ARG" => "AR",
        "NLD" => "NL",
        "TUR" => "TR",
        "SAU" => "SA",
        "ZAF" => "ZA",
        "SWE" => "SE",
        "NOR" => "NO",
        "DNK" => "DK",
        "FIN" => "FI",
        "POL" => "PL",
        "UKR" => "UA",
        "THA" => "TH",
        "VNM" => "VN",
        "PHL" => "PH",
        "IDN" => "ID",
        "MYS" => "MY",
        "SGP" => "SG",
        "TWN" => "TW",
        "HKG" => "HK",
        "NZL" => "NZ",
        "CHE" => "CH",
        "AUT" => "AT",
        "BEL" => "BE",
        "PRT" => "PT",
        "GRC" => "GR",
        "CZE" => "CZ",
        "ROU" => "RO",
        "HUN" => "HU",
        "ISR" => "IL",
        "ARE" => "AE",
        "EGY" => "EG",
        "NGA" => "NG",
        "COL" => "CO",
        "CHL" => "CL",
        "PER" => "PE",
        "IRN" => "IR",
        "PAK" => "PK",
        "BGD" => "BD",
        "IRL" => "IE",
        _ => return None,
    };
    let flag: String = alpha2
        .chars()
        .map(|c| char::from_u32(0x1F1E6 + (c as u32 - 'A' as u32)).unwrap_or(c))
        .collect();
    Some(flag)
}

fn render_avatar_with_flag(
    size_px: f32,
    nationality: Option<&str>,
    c: &Colors,
) -> impl IntoElement {
    let badge_size = (size_px * 0.4).max(16.0);
    let flag_text = nationality.and_then(nationality_to_flag);
    let bg = c.elevated;
    let icon_color = c.muted_fg;
    let badge_bg = c.background;

    div()
        .relative()
        .size(px(size_px))
        .flex_shrink_0()
        .child(
            div()
                .size(px(size_px))
                .rounded_full()
                .bg(bg)
                .flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/user.svg")
                        .size(px(size_px * 0.45))
                        .text_color(icon_color),
                ),
        )
        .when_some(flag_text, |el: Div, flag| {
            el.child(
                div()
                    .absolute()
                    .bottom(px(-2.))
                    .left(px(-2.))
                    .size(px(badge_size))
                    .rounded_full()
                    .bg(badge_bg)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(div().text_size(px(badge_size * 0.7)).child(flag)),
            )
        })
}

// =============================================================================
// Time formatting
// =============================================================================

fn format_relative_time(millis: Option<i64>) -> String {
    let ts = match millis {
        Some(ms) => ms,
        None => return String::new(),
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let diff_secs = (now - ts) / 1000;

    if diff_secs < 60 {
        "now".to_string()
    } else if diff_secs < 3600 {
        format!("{}m", diff_secs / 60)
    } else if diff_secs < 86400 {
        format!("{}h", diff_secs / 3600)
    } else if diff_secs < 604800 {
        format!("{}d", diff_secs / 86400)
    } else {
        format!("{}w", diff_secs / 604800)
    }
}

fn format_ns_to_time(ns: i64) -> String {
    let secs = ns / 1_000_000_000;
    let hour = (secs / 3600) % 24;
    let minute = (secs / 60) % 60;
    let (h12, ampm) = if hour == 0 {
        (12, "AM")
    } else if hour < 12 {
        (hour, "AM")
    } else if hour == 12 {
        (12, "PM")
    } else {
        (hour - 12, "PM")
    };
    format!("{}:{:02} {}", h12, minute, ampm)
}

fn format_duration(seconds: u64) -> String {
    let mins = seconds / 60;
    let secs = seconds % 60;
    format!("{mins}:{secs:02}")
}

/// Abbreviate an Ethereum address: 0x1234...abcd
fn abbreviate_address(addr: &str) -> String {
    if addr.len() > 12 {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    } else {
        addr.to_string()
    }
}

fn normalize_preview_text(input: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 72;
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut iter = normalized.chars();
    let head: String = iter.by_ref().take(MAX_PREVIEW_CHARS).collect();
    if iter.next().is_some() {
        format!("{head}...")
    } else {
        head
    }
}

fn lock_xmtp<'a>(xmtp: &'a Arc<Mutex<XmtpService>>) -> std::sync::MutexGuard<'a, XmtpService> {
    match xmtp.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::error!("[Chat] XMTP mutex was poisoned by a prior panic; recovering lock");
            poisoned.into_inner()
        }
    }
}

fn now_unix_ns() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as i64
}

fn make_user_message(content: String) -> ChatMessage {
    let sent_at_ns = now_unix_ns();
    ChatMessage {
        id: format!("msg-user-{sent_at_ns}"),
        sender_address: "you".to_string(),
        content,
        sent_at_ns,
        is_own: true,
    }
}

fn make_scarlett_message(content: String) -> ChatMessage {
    let sent_at_ns = now_unix_ns();
    ChatMessage {
        id: format!("msg-scarlett-{sent_at_ns}"),
        sender_address: SCARLETT_NAME.to_string(),
        content,
        sent_at_ns,
        is_own: false,
    }
}

const DEFAULT_MEGAETH_RPC_URL: &str = "https://carrot.megaeth.com/rpc";
const DEFAULT_ETHEREUM_MAINNET_RPC_URL: &str = "https://ethereum-rpc.publicnode.com";
const REGISTRY_V1: &str = "0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2";
const HEAVEN_NODE_HEX: &str = "8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27";
const ENS_REGISTRY: &str = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const SCARLETT_CONVERSATION_ID: &str = "ai-scarlett";
const SCARLETT_NAME: &str = "Scarlett";
const SCARLETT_INTRO: &str = "Hey, I'm Scarlett. I will match you with other users who like your music and meet your preferences to make new friends or date!\n\nThen one of you can book a karaoke room and sing with each other. A great way to break the ice and make new friends in the metaverse.";

fn is_evm_address(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.len() != 42 || !trimmed.starts_with("0x") {
        return false;
    }
    trimmed
        .as_bytes()
        .iter()
        .skip(2)
        .all(|b| char::from(*b).is_ascii_hexdigit())
}

fn resolve_recipient_identifier(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Enter a wallet address, heaven username, or name.eth".to_string());
    }

    if is_evm_address(trimmed) {
        return Ok(trimmed.to_lowercase());
    }

    let lowered = trimmed.to_lowercase();
    if lowered.ends_with(".eth") {
        return resolve_ens_name_to_address(&lowered);
    }

    // Heaven username: "alice" or "alice.heaven" (also allow "@alice")
    let label = lowered
        .trim_start_matches('@')
        .strip_suffix(".heaven")
        .unwrap_or(lowered.trim_start_matches('@'))
        .trim();

    if label.is_empty() {
        return Err("Invalid heaven username".to_string());
    }
    if label.contains('.') {
        return Err(
            "Unsupported name format. Use 0x..., alice, alice.heaven, or alice.eth".to_string(),
        );
    }

    resolve_heaven_name_to_address(label)
}

fn resolve_heaven_name_to_address(label: &str) -> Result<String, String> {
    let rpc_url = std::env::var("HEAVEN_AA_RPC_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MEGAETH_RPC_URL.to_string());

    let heaven_node_bytes =
        hex::decode(HEAVEN_NODE_HEX).map_err(|e| format!("Invalid HEAVEN_NODE constant: {e}"))?;
    if heaven_node_bytes.len() != 32 {
        return Err("Invalid HEAVEN_NODE constant length".to_string());
    }

    let label_hash = keccak256(label.as_bytes());
    let mut packed = Vec::with_capacity(64);
    packed.extend_from_slice(&heaven_node_bytes);
    packed.extend_from_slice(label_hash.as_slice());
    let node = keccak256(&packed);

    // ownerOf(uint256) selector = 0x6352211e
    let data = format!("0x6352211e{}", hex::encode(node.as_slice()));
    let owner = eth_call_address(&rpc_url, REGISTRY_V1, &data)?;
    if owner == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{label}.heaven not found"));
    }
    Ok(owner.to_lowercase())
}

fn resolve_ens_name_to_address(name: &str) -> Result<String, String> {
    let rpc_url = std::env::var("HEAVEN_MAINNET_RPC_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ETHEREUM_MAINNET_RPC_URL.to_string());

    let node = ens_namehash(name);

    // resolver(bytes32) selector = 0x0178b8bf
    let resolver_call_data = format!("0x0178b8bf{}", hex::encode(node));
    let resolver = eth_call_address(&rpc_url, ENS_REGISTRY, &resolver_call_data)?;
    if resolver == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{name} not found"));
    }

    // addr(bytes32) selector = 0x3b3b57de
    let addr_call_data = format!("0x3b3b57de{}", hex::encode(node));
    let address = eth_call_address(&rpc_url, &resolver, &addr_call_data)?;
    if address == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{name} not found"));
    }
    Ok(address.to_lowercase())
}

fn ens_namehash(name: &str) -> [u8; 32] {
    let mut node = [0u8; 32];
    for label in name.trim().trim_end_matches('.').rsplit('.') {
        if label.is_empty() {
            continue;
        }
        let label_hash = keccak256(label.as_bytes());
        let mut packed = [0u8; 64];
        packed[..32].copy_from_slice(&node);
        packed[32..].copy_from_slice(label_hash.as_slice());
        node = keccak256(packed).into();
    }
    node
}

fn eth_call_address(rpc_url: &str, to: &str, data: &str) -> Result<String, String> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to,
                "data": data,
            },
            "latest"
        ]
    });

    let result = rpc_json(rpc_url, payload)?;
    let hex = result
        .as_str()
        .ok_or("eth_call returned non-string result".to_string())?;
    let clean = hex.strip_prefix("0x").unwrap_or(hex);
    if clean.len() < 64 {
        return Err(format!("eth_call result too short: {}", hex));
    }
    let word = &clean[clean.len() - 64..];
    Ok(format!("0x{}", &word[24..64]))
}

fn rpc_json(rpc_url: &str, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut resp = ureq::post(rpc_url)
        .header("content-type", "application/json")
        .send_json(payload)
        .map_err(|e| format!("RPC request failed: {e}"))?;
    let body: serde_json::Value = resp
        .body_mut()
        .read_json()
        .map_err(|e| format!("RPC parse failed: {e}"))?;
    if let Some(err) = body.get("error") {
        return Err(format!("RPC error: {err}"));
    }
    body.get("result")
        .cloned()
        .ok_or("RPC response missing result".to_string())
}

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
        let scarlett_messages = vec![make_scarlett_message(SCARLETT_INTRO.to_string())];

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
        };
        view.ensure_scarlett_conversation();

        // If already authenticated on construction, connect immediately
        if own_address.is_some() {
            view.try_connect(cx);
        }

        // Voice event ticker for speaking status + call state updates.
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                smol::Timer::after(Duration::from_millis(300)).await;
                let voice_changed = match voice_controller.lock() {
                    Ok(mut voice) => voice.tick(),
                    Err(poisoned) => poisoned.into_inner().tick(),
                };

                let should_continue = this
                    .update(cx, |this, cx| {
                        if voice_changed || this.is_scarlett_active() {
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

    fn on_auth_changed(&mut self, cx: &mut Context<Self>) {
        let auth = cx.global::<crate::auth::AuthState>();
        let new_address = auth.display_address().map(|a| a.to_string());

        if new_address != self.own_address {
            match self.voice_controller.lock() {
                Ok(mut voice) => voice.reset_auth(),
                Err(poisoned) => poisoned.into_inner().reset_auth(),
            }
            self.own_address = new_address;
            if self.own_address.is_some() && !self.connected && !self.connecting {
                self.try_connect(cx);
            } else if self.own_address.is_none() {
                // Logged out
                lock_xmtp(&self.xmtp).disconnect();
                self.connected = false;
                self.conversations.clear();
                self.messages = self.scarlett_messages.clone();
                self.active_conversation_id = None;
                self.ai_sending = false;
                self.voice_error = None;
                match self.voice_controller.lock() {
                    Ok(mut voice) => {
                        let _ = voice.end_call();
                        voice.reset_auth();
                    }
                    Err(poisoned) => {
                        let mut voice = poisoned.into_inner();
                        let _ = voice.end_call();
                        voice.reset_auth();
                    }
                }
                self.ensure_scarlett_conversation();
                cx.notify();
            }
        }
    }

    fn ensure_scarlett_conversation(&mut self) {
        let last = self.scarlett_messages.last().cloned();
        let row = ConversationItem {
            id: SCARLETT_CONVERSATION_ID.to_string(),
            peer_address: SCARLETT_CONVERSATION_ID.to_string(),
            peer_display_name: SCARLETT_NAME.to_string(),
            peer_nationality: None,
            last_message: last.as_ref().map(|m| normalize_preview_text(&m.content)),
            last_message_at: last.as_ref().map(|m| m.sent_at_ns / 1_000_000),
            unread: false,
        };

        self.conversations
            .retain(|c| c.id != SCARLETT_CONVERSATION_ID);
        self.conversations.insert(0, row);
    }

    fn rebuild_conversations(&mut self, mut xmpt: Vec<ConversationItem>) {
        xmpt.retain(|c| c.id != SCARLETT_CONVERSATION_ID);
        self.conversations = xmpt;
        self.ensure_scarlett_conversation();
    }

    fn is_scarlett_active(&self) -> bool {
        self.active_conversation_id.as_deref() == Some(SCARLETT_CONVERSATION_ID)
    }

    fn voice_snapshot(&self) -> VoiceSnapshot {
        match self.voice_controller.lock() {
            Ok(voice) => voice.snapshot(),
            Err(poisoned) => poisoned.into_inner().snapshot(),
        }
    }

    fn voice_call_supported(&self) -> bool {
        match self.voice_controller.lock() {
            Ok(voice) => voice.call_supported(),
            Err(poisoned) => poisoned.into_inner().call_supported(),
        }
    }

    fn try_connect(&mut self, cx: &mut Context<Self>) {
        let address = match &self.own_address {
            Some(a) => a.clone(),
            None => return,
        };

        self.connecting = true;
        self.connect_error = None;
        cx.notify();

        // Grab persisted auth for PKP signing (needed if XMTP identity isn't registered yet)
        let persisted_auth = cx
            .try_global::<crate::auth::AuthState>()
            .and_then(|auth| auth.persisted.clone());

        // Connect on a background thread to avoid blocking the UI
        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            // Perform XMTP connection (this blocks on tokio internally)
            let result = std::thread::spawn({
                let xmtp = xmtp.clone();
                let address = address.clone();
                move || {
                    let mut service = lock_xmtp(&xmtp);
                    service.connect(&address, |sig_text| {
                        // XMTP identity needs signing — use LitWalletService PKP personal sign
                        let persisted = persisted_auth.as_ref().ok_or(
                            "No persisted auth — cannot sign XMTP identity. Please log in via the web app first.".to_string(),
                        )?;

                        log::info!("[Chat] Initializing LitWalletService for XMTP signing...");
                        let mut lit = LitWalletService::new()
                            .map_err(|e| format!("LitWalletService::new: {e}"))?;
                        lit.initialize_from_auth(persisted)
                            .map_err(|e| format!("LitWallet init: {e}"))?;

                        let message = std::str::from_utf8(sig_text)
                            .map_err(|e| format!("XMTP signature_text is not valid UTF-8: {e}"))?
                            .to_string();
                        log::info!("[Chat] PKP personal signing XMTP identity text ({} bytes)", message.len());
                        lit.pkp_personal_sign(&message)
                    })
                }
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                this.connecting = false;
                match result {
                    Ok(inbox_id) => {
                        log::info!("[Chat] XMTP connected: {inbox_id}");
                        this.connected = true;
                        this.connect_error = None;
                        this.refresh_conversations(cx);
                    }
                    Err(e) => {
                        log::error!("[Chat] XMTP connect failed: {e}");
                        this.connect_error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn open_compose_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.compose_open = true;
        self.compose_submitting = false;
        self.compose_error = None;
        self.compose_input_state.update(cx, |state, cx| {
            state.set_value("", window, cx);
        });
        cx.notify();
    }

    fn close_compose_modal(&mut self, cx: &mut Context<Self>) {
        self.compose_open = false;
        self.compose_submitting = false;
        self.compose_error = None;
        cx.notify();
    }

    fn handle_compose_submit(&mut self, cx: &mut Context<Self>) {
        if self.compose_submitting {
            return;
        }
        let raw = self.compose_input_state.read(cx).value().trim().to_string();
        if raw.is_empty() {
            self.compose_error =
                Some("Enter a wallet address, heaven username, or name.eth".to_string());
            cx.notify();
            return;
        }

        self.compose_submitting = true;
        self.compose_error = None;
        cx.notify();

        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let recipient = resolve_recipient_identifier(&raw)?;
                let conv_id = lock_xmtp(&xmtp).get_or_create_dm(&recipient)?;
                Ok::<(String, String), String>((recipient, conv_id))
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                this.compose_submitting = false;
                match result {
                    Ok((_recipient, conv_id)) => {
                        this.compose_open = false;
                        this.compose_error = None;
                        this.refresh_conversations(cx);
                        this.select_conversation(conv_id, cx);
                    }
                    Err(e) => {
                        log::error!("[Chat] Failed to start new chat: {e}");
                        this.compose_error = Some(e);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn touch_conversation_preview(
        &mut self,
        conversation_id: &str,
        content: &str,
        sent_at_ns: i64,
    ) {
        let Some(idx) = self
            .conversations
            .iter()
            .position(|c| c.id == conversation_id)
        else {
            return;
        };

        let mut conv = self.conversations.remove(idx);
        conv.last_message = Some(normalize_preview_text(content));
        conv.last_message_at = Some(sent_at_ns / 1_000_000);
        self.conversations.insert(0, conv);
    }

    fn refresh_conversations(&mut self, cx: &mut Context<Self>) {
        let xmtp = self.xmtp.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn({
                let xmtp = xmtp.clone();
                move || lock_xmtp(&xmtp).list_conversations()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(convos) => {
                        let mapped = convos
                            .into_iter()
                            .map(|c| ConversationItem {
                                id: c.id,
                                peer_display_name: abbreviate_address(&c.peer_address),
                                peer_nationality: None, // TODO: resolve from profile
                                last_message: c
                                    .last_message
                                    .map(|msg| normalize_preview_text(&msg)),
                                last_message_at: c.last_message_at,
                                unread: false, // TODO: track unread state
                                peer_address: c.peer_address,
                            })
                            .collect();
                        this.rebuild_conversations(mapped);
                        log::info!("[Chat] Loaded {} conversations", this.conversations.len());
                    }
                    Err(e) => {
                        log::error!("[Chat] Failed to list conversations: {e}");
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn select_conversation(&mut self, id: String, cx: &mut Context<Self>) {
        if self.is_scarlett_active() && id != SCARLETT_CONVERSATION_ID {
            self.end_scarlett_call(cx);
        }
        self.active_conversation_id = Some(id.clone());
        if id == SCARLETT_CONVERSATION_ID {
            self.messages = self.scarlett_messages.clone();
            cx.notify();
            return;
        }

        self.messages.clear();
        cx.notify();

        // Load messages from XMTP
        let xmtp = self.xmtp.clone();
        let conv_id = id.clone();
        let own_inbox = lock_xmtp(&xmtp)
            .my_inbox_id()
            .map(|s| s.to_string())
            .unwrap_or_default();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn({
                let xmtp = xmtp.clone();
                let conv_id = conv_id.clone();
                move || lock_xmtp(&xmtp).load_messages(&conv_id, None)
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                // Only update if this conversation is still active
                if this.active_conversation_id.as_ref() != Some(&conv_id) {
                    return;
                }
                match result {
                    Ok(msgs) => {
                        this.messages = msgs
                            .into_iter()
                            .map(|m| {
                                let is_own = m.sender_address == own_inbox;
                                ChatMessage {
                                    id: m.id,
                                    sender_address: m.sender_address,
                                    content: m.content,
                                    sent_at_ns: m.sent_at_ns.parse().unwrap_or(0),
                                    is_own,
                                }
                            })
                            .collect();
                        if let Some(last) = this.messages.last().cloned() {
                            this.touch_conversation_preview(
                                &conv_id,
                                &last.content,
                                last.sent_at_ns,
                            );
                        }
                    }
                    Err(e) => {
                        log::error!("[Chat] Failed to load messages: {e}");
                    }
                }
                cx.notify();
            });

            // Start streaming new messages for this conversation via channel
            let xmtp2 = xmtp.clone();
            let conv_id2 = conv_id.clone();
            let own_inbox2 = own_inbox.clone();

            let (tx, rx) = smol::channel::unbounded::<ChatMessage>();

            // Spawn the XMTP stream on a background thread (sends to channel)
            std::thread::spawn(move || {
                let service = lock_xmtp(&xmtp2);
                let _ = service.stream_messages(&conv_id2, move |msg| {
                    let is_own = msg.sender_address == own_inbox2;
                    let chat_msg = ChatMessage {
                        id: msg.id,
                        sender_address: msg.sender_address,
                        content: msg.content,
                        sent_at_ns: msg.sent_at_ns.parse().unwrap_or(0),
                        is_own,
                    };
                    let _ = tx.send_blocking(chat_msg);
                });
            });

            // Poll the channel on the GPUI side (same async task)
            let conv_id_for_poll = conv_id.clone();
            while let Ok(chat_msg) = rx.recv().await {
                let should_continue = this
                    .update(cx, |this, cx: &mut Context<ChatView>| {
                        if this.active_conversation_id.as_ref() == Some(&conv_id_for_poll) {
                            if !this.messages.iter().any(|m| m.id == chat_msg.id) {
                                this.messages.push(chat_msg);
                                if let Some(last) = this.messages.last().cloned() {
                                    this.touch_conversation_preview(
                                        &conv_id_for_poll,
                                        &last.content,
                                        last.sent_at_ns,
                                    );
                                }
                                cx.notify();
                            }
                        }
                    })
                    .is_ok();
                if !should_continue {
                    break;
                }
            }
        })
        .detach();
    }

    fn handle_send_message(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let text = self.input_state.read(cx).value().to_string();
        let text = text.trim().to_string();
        if text.is_empty() {
            return;
        }

        let conv_id = match &self.active_conversation_id {
            Some(id) => id.clone(),
            None => return,
        };

        // Clear input
        self.input_state.update(cx, |state, cx| {
            state.set_value("", window, cx);
        });
        if conv_id == SCARLETT_CONVERSATION_ID {
            self.handle_send_scarlett_message(text, cx);
            return;
        }
        cx.notify();

        // Send via XMTP in background
        let xmtp = self.xmtp.clone();
        cx.spawn(async move |_this: WeakEntity<Self>, _cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || lock_xmtp(&xmtp).send_message(&conv_id, &text))
                .join()
                .map_err(|_| "Thread panicked".to_string())
                .and_then(|r| r);

            if let Err(e) = result {
                log::error!("[Chat] Failed to send message: {e}");
                // TODO: mark message as failed in UI
            }
        })
        .detach();
    }

    fn handle_send_scarlett_message(&mut self, text: String, cx: &mut Context<Self>) {
        if self.ai_sending {
            return;
        }

        let user_msg = make_user_message(text.clone());
        self.scarlett_messages.push(user_msg.clone());
        self.messages = self.scarlett_messages.clone();
        self.ai_sending = true;
        self.voice_error = None;
        self.touch_conversation_preview(
            SCARLETT_CONVERSATION_ID,
            &user_msg.content,
            user_msg.sent_at_ns,
        );
        self.ensure_scarlett_conversation();
        cx.notify();

        let history: Vec<ChatHistoryItem> = self
            .scarlett_messages
            .iter()
            .rev()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|m| ChatHistoryItem {
                role: if m.is_own {
                    "user".to_string()
                } else {
                    "assistant".to_string()
                },
                content: m.content,
            })
            .collect();
        let voice = self.voice_controller.clone();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.send_chat_message(&text, &history)
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                this.ai_sending = false;
                match result {
                    Ok(reply) => {
                        let msg = make_scarlett_message(reply);
                        this.scarlett_messages.push(msg.clone());
                        if this.is_scarlett_active() {
                            this.messages = this.scarlett_messages.clone();
                        }
                        this.touch_conversation_preview(
                            SCARLETT_CONVERSATION_ID,
                            &msg.content,
                            msg.sent_at_ns,
                        );
                        this.ensure_scarlett_conversation();
                    }
                    Err(err) => {
                        this.voice_error = Some(err.clone());
                        let msg = make_scarlett_message(
                            "Sorry, something went wrong. Please try again.".to_string(),
                        );
                        this.scarlett_messages.push(msg.clone());
                        if this.is_scarlett_active() {
                            this.messages = this.scarlett_messages.clone();
                        }
                        this.touch_conversation_preview(
                            SCARLETT_CONVERSATION_ID,
                            &msg.content,
                            msg.sent_at_ns,
                        );
                        this.ensure_scarlett_conversation();
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn start_scarlett_call(&mut self, cx: &mut Context<Self>) {
        if !self.voice_call_supported() {
            return;
        }

        self.voice_error = None;
        cx.notify();

        let voice = self.voice_controller.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.start_call()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                if let Err(err) = result {
                    this.voice_error = Some(err);
                } else {
                    this.voice_error = None;
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn end_scarlett_call(&mut self, cx: &mut Context<Self>) {
        let voice = self.voice_controller.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.end_call()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                if let Err(err) = result {
                    this.voice_error = Some(err);
                } else {
                    this.voice_error = None;
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn toggle_scarlett_mute(&mut self, cx: &mut Context<Self>) {
        let voice = self.voice_controller.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = std::thread::spawn(move || {
                let mut voice = match voice.lock() {
                    Ok(v) => v,
                    Err(poisoned) => poisoned.into_inner(),
                };
                voice.toggle_mute()
            })
            .join()
            .map_err(|_| "Thread panicked".to_string())
            .and_then(|r| r);

            let _ = this.update(cx, |this, cx| {
                if let Err(err) = result {
                    this.voice_error = Some(err);
                }
                cx.notify();
            });
        })
        .detach();
    }

    // =========================================================================
    // Render: left panel (conversation list)
    // =========================================================================

    fn render_conversation_list(&self, c: &Colors, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .v_flex()
            .w(px(360.))
            .h_full()
            .flex_shrink_0()
            .bg(c.surface)
            .border_r_1()
            .border_color(c.border)
            .overflow_hidden()
            // Header
            .child(
                div()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .px_4()
                    .py_3()
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .text_color(c.foreground)
                            .child("Messages"),
                    )
                    .child(
                        div()
                            .id("compose-btn")
                            .size(px(36.))
                            .rounded_full()
                            .bg(c.elevated)
                            .cursor_pointer()
                            .hover(|s| s.bg(hsla(0., 0., 0.19, 1.)))
                            .flex()
                            .items_center()
                            .justify_center()
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.open_compose_modal(window, cx);
                            }))
                            .child(
                                gpui::svg()
                                    .path("icons/pencil-simple.svg")
                                    .size(px(20.))
                                    .text_color(c.foreground),
                            ),
                    ),
            )
            // Status indicator
            .when(self.connecting, |el| {
                let muted = c.muted_fg;
                el.child(
                    div()
                        .px_4()
                        .py_2()
                        .text_color(muted)
                        .child("Connecting to XMTP..."),
                )
            })
            .when_some(self.connect_error.clone(), |el: Div, err| {
                el.child(
                    div()
                        .px_4()
                        .py_2()
                        .text_color(hsla(0., 0.7, 0.6, 1.)) // red-ish
                        .child(format!("Error: {}", &err[..err.len().min(60)])),
                )
            })
            // Scrollable conversation list
            .child(
                div()
                    .id("conv-list-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .children(
                        self.conversations
                            .iter()
                            .enumerate()
                            .map(|(i, conv)| self.render_conversation_row(conv, i, c, cx)),
                    ),
            )
    }

    fn render_conversation_row(
        &self,
        conv: &ConversationItem,
        index: usize,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let is_active = self.active_conversation_id.as_ref() == Some(&conv.id);
        let conv_id = conv.id.clone();
        let hover_bg = c.highlight_hover;
        let active_bg = c.highlight;

        div()
            .id(ElementId::NamedInteger("conv-row".into(), index as u64))
            .h_flex()
            .w_full()
            .gap_3()
            .px_3()
            .py(px(10.))
            .cursor_pointer()
            .when(is_active, move |el| el.bg(active_bg))
            .hover(move |s| s.bg(hover_bg))
            .on_click(cx.listener(move |this, _, _window, cx| {
                this.select_conversation(conv_id.clone(), cx);
            }))
            .child(render_avatar_with_flag(
                44.0,
                conv.peer_nationality.as_deref(),
                c,
            ))
            .child(
                div()
                    .v_flex()
                    .flex_1()
                    .min_w_0()
                    .gap(px(2.))
                    .child(
                        div()
                            .h_flex()
                            .justify_between()
                            .gap_2()
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(c.foreground)
                                    .truncate()
                                    .child(conv.peer_display_name.clone()),
                            )
                            .child(
                                div()
                                    .text_color(c.muted_fg)
                                    .flex_shrink_0()
                                    .child(format_relative_time(conv.last_message_at)),
                            ),
                    )
                    .child(
                        div().text_color(c.muted_fg).truncate().child(
                            conv.last_message
                                .as_deref()
                                .map(normalize_preview_text)
                                .unwrap_or_else(|| "No messages yet".to_string()),
                        ),
                    ),
            )
            .when(conv.unread, |el| {
                let blue = c.primary;
                el.child(div().size(px(10.)).rounded_full().bg(blue).flex_shrink_0())
            })
    }

    // =========================================================================
    // Render: right panel (chat or empty state)
    // =========================================================================

    fn render_chat_panel(&self, c: &Colors, cx: &mut Context<Self>) -> impl IntoElement {
        match &self.active_conversation_id {
            None => self.render_empty_state(c).into_any_element(),
            Some(conv_id) => self
                .render_active_chat(conv_id.clone(), c, cx)
                .into_any_element(),
        }
    }

    fn render_empty_state(&self, c: &Colors) -> impl IntoElement {
        div()
            .flex_1()
            .h_full()
            .bg(c.background)
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .v_flex()
                    .items_center()
                    .gap_3()
                    .child(
                        div()
                            .size(px(64.))
                            .rounded_full()
                            .bg(c.elevated)
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(
                                gpui::svg()
                                    .path("icons/chat-circle.svg")
                                    .size(px(32.))
                                    .text_color(c.muted_fg),
                            ),
                    )
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .text_color(c.foreground)
                            .child("Start Conversation"),
                    )
                    .child(
                        div()
                            .text_color(c.muted_fg)
                            .child("Messages are e2e encrypted over XMTP."),
                    ),
            )
    }

    fn render_active_chat(
        &self,
        conv_id: String,
        c: &Colors,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let is_scarlett = conv_id == SCARLETT_CONVERSATION_ID;
        let voice_supported = if is_scarlett {
            self.voice_call_supported()
        } else {
            false
        };
        let voice = if is_scarlett {
            self.voice_snapshot()
        } else {
            VoiceSnapshot::default()
        };
        let scarlett_error = if is_scarlett {
            self.voice_error
                .clone()
                .or_else(|| voice.last_error.clone())
        } else {
            None
        };
        let conv = self.conversations.iter().find(|cv| cv.id == conv_id);
        let display_name = conv
            .map(|cv| cv.peer_display_name.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        let nationality = conv.and_then(|cv| cv.peer_nationality.clone());

        div()
            .flex_1()
            .h_full()
            .v_flex()
            .overflow_hidden()
            .bg(c.background)
            // Chat header
            .child(
                div()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .px_4()
                    .h(px(60.))
                    .border_b_1()
                    .border_color(c.border)
                    .flex_shrink_0()
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_3()
                            .child(render_avatar_with_flag(40.0, nationality.as_deref(), c))
                            .child(
                                div()
                                    .v_flex()
                                    .gap(px(1.))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(c.foreground)
                                            .child(display_name),
                                    )
                                    .when(is_scarlett && voice_supported, |el| {
                                        let status = match voice.state {
                                            VoiceState::Idle => "Idle".to_string(),
                                            VoiceState::Connecting => "Connecting...".to_string(),
                                            VoiceState::Connected => {
                                                if voice.bot_speaking {
                                                    format!(
                                                        "Speaking • {}",
                                                        format_duration(voice.duration_seconds)
                                                    )
                                                } else {
                                                    format!(
                                                        "In call {}",
                                                        format_duration(voice.duration_seconds)
                                                    )
                                                }
                                            }
                                            VoiceState::Error => "Call error".to_string(),
                                        };
                                        let status_color = if voice.state == VoiceState::Error {
                                            hsla(0., 0.7, 0.6, 1.)
                                        } else {
                                            c.muted_fg
                                        };
                                        el.child(div().text_color(status_color).child(status))
                                    }),
                            ),
                    )
                    .when(is_scarlett && voice_supported, |el| {
                        el.child(
                            div()
                                .h_flex()
                                .items_center()
                                .gap_2()
                                .when(voice.state == VoiceState::Connected, |row| {
                                    row.child(
                                        div()
                                            .id("scarlett-mute-btn")
                                            .px_3()
                                            .h(px(32.))
                                            .rounded_full()
                                            .bg(if voice.is_muted {
                                                hsla(0., 0.55, 0.26, 1.)
                                            } else {
                                                c.elevated
                                            })
                                            .cursor_pointer()
                                            .hover(|s| s.bg(hsla(0., 0., 0.23, 1.)))
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .on_click(cx.listener(|this, _, _window, cx| {
                                                this.toggle_scarlett_mute(cx);
                                            }))
                                            .child(if voice.is_muted { "Unmute" } else { "Mute" }),
                                    )
                                    .child(
                                        div()
                                            .id("scarlett-end-btn")
                                            .px_3()
                                            .h(px(32.))
                                            .rounded_full()
                                            .bg(hsla(0., 0.58, 0.28, 1.))
                                            .cursor_pointer()
                                            .hover(|s| s.bg(hsla(0., 0.65, 0.34, 1.)))
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .on_click(cx.listener(|this, _, _window, cx| {
                                                this.end_scarlett_call(cx);
                                            }))
                                            .child("End"),
                                    )
                                })
                                .when(voice.state == VoiceState::Connecting, |row| {
                                    row.child(
                                        div()
                                            .px_3()
                                            .h(px(32.))
                                            .rounded_full()
                                            .bg(c.elevated)
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .child("Starting..."),
                                    )
                                    .child(
                                        div()
                                            .id("scarlett-cancel-btn")
                                            .px_3()
                                            .h(px(32.))
                                            .rounded_full()
                                            .bg(hsla(0., 0.58, 0.28, 1.))
                                            .cursor_pointer()
                                            .hover(|s| s.bg(hsla(0., 0.65, 0.34, 1.)))
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .on_click(cx.listener(|this, _, _window, cx| {
                                                this.end_scarlett_call(cx);
                                            }))
                                            .child("Cancel"),
                                    )
                                })
                                .when(
                                    voice_supported
                                        && voice.state != VoiceState::Connected
                                        && voice.state != VoiceState::Connecting,
                                    |row| {
                                        row.child(
                                            div()
                                                .id("scarlett-start-btn")
                                                .px_3()
                                                .h(px(32.))
                                                .rounded_full()
                                                .bg(c.primary)
                                                .cursor_pointer()
                                                .hover(|s| s.bg(c.primary_hover))
                                                .flex()
                                                .items_center()
                                                .justify_center()
                                                .on_click(cx.listener(|this, _, _window, cx| {
                                                    this.start_scarlett_call(cx);
                                                }))
                                                .child("Call"),
                                        )
                                    },
                                ),
                        )
                    }),
            )
            // Message list (scrollable)
            .child(
                div()
                    .id("messages-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .px_4()
                    .py_3()
                    .child(
                        div().v_flex().gap_1().children(
                            self.messages
                                .iter()
                                .map(|msg| render_message_bubble(msg, c)),
                        ),
                    ),
            )
            .when_some(scarlett_error, |el: Div, err| {
                if is_scarlett {
                    el.child(
                        div()
                            .px_4()
                            .py_2()
                            .text_color(hsla(0., 0.7, 0.6, 1.))
                            .child(format!("Scarlett: {}", err)),
                    )
                } else {
                    el
                }
            })
            // Message input bar
            .child(self.render_input_bar(c, cx))
    }

    fn render_input_bar(&self, c: &Colors, cx: &mut Context<Self>) -> impl IntoElement {
        let sending_disabled = self.ai_sending && self.is_scarlett_active();
        let send_bg = if sending_disabled {
            c.elevated
        } else {
            c.primary
        };
        let send_fg = c.primary_fg;
        let send_hover = c.primary_hover;

        div()
            .h_flex()
            .w_full()
            .items_center()
            .gap_2()
            .px_4()
            .py_3()
            .border_t_1()
            .border_color(c.border)
            .flex_shrink_0()
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(40.))
                    .rounded_full()
                    .bg(c.elevated)
                    .px_3()
                    .flex()
                    .items_center()
                    .child(
                        div().flex_1().child(
                            Input::new(&self.input_state)
                                .appearance(false)
                                .cleanable(false),
                        ),
                    ),
            )
            .child(
                div()
                    .id("send-btn")
                    .size(px(36.))
                    .rounded_full()
                    .bg(send_bg)
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(!sending_disabled, |el| {
                        el.cursor_pointer()
                            .hover(move |s| s.bg(send_hover))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.handle_send_message(window, cx);
                            }))
                    })
                    .child(if sending_disabled {
                        div().text_color(c.muted_fg).child("...")
                    } else {
                        div().child(
                            gpui::svg()
                                .path("icons/paper-plane-right.svg")
                                .size(px(20.))
                                .text_color(send_fg),
                        )
                    }),
            )
    }

    fn render_compose_modal(&self, c: &Colors, cx: &mut Context<Self>) -> impl IntoElement {
        let start_bg = c.primary;
        let start_fg = c.primary_fg;

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.55))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .relative()
                    .w(px(520.))
                    .max_w(px(620.))
                    .mx_4()
                    .rounded(px(14.))
                    .bg(c.surface)
                    .border_1()
                    .border_color(c.border)
                    .v_flex()
                    .gap_3()
                    .p_4()
                    .child(
                        div().h_flex().items_start().pr_12().child(
                            div()
                                .v_flex()
                                .gap_1()
                                .child(
                                    div()
                                        .text_lg()
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(c.foreground)
                                        .child("New Message"),
                                )
                                .child(div().text_color(c.muted_fg).child(
                                    "Enter a wallet address, Heaven username, or ENS name.",
                                )),
                        ),
                    )
                    .child(
                        div()
                            .id("compose-close-btn")
                            .absolute()
                            .top(px(14.))
                            .right(px(14.))
                            .size(px(36.))
                            .rounded_full()
                            .bg(c.elevated)
                            .cursor_pointer()
                            .flex()
                            .items_center()
                            .justify_center()
                            .on_click(cx.listener(|this, _, _window, cx| {
                                this.close_compose_modal(cx);
                            }))
                            .child(
                                gpui::svg()
                                    .path("icons/x.svg")
                                    .size(px(15.))
                                    .text_color(c.foreground),
                            ),
                    )
                    .child(
                        div()
                            .h(px(44.))
                            .rounded_full()
                            .bg(c.elevated)
                            .px_3()
                            .flex()
                            .items_center()
                            .child(
                                div().flex_1().child(
                                    Input::new(&self.compose_input_state)
                                        .appearance(false)
                                        .cleanable(false),
                                ),
                            ),
                    )
                    .when_some(self.compose_error.clone(), |el: Div, err| {
                        el.child(div().text_color(hsla(0., 0.7, 0.6, 1.)).child(err))
                    })
                    .child(
                        div()
                            .h_flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                div()
                                    .id("compose-cancel-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(c.elevated)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.close_compose_modal(cx);
                                    }))
                                    .child(div().text_color(c.foreground).child("Cancel")),
                            )
                            .child(
                                div()
                                    .id("compose-start-btn")
                                    .px_4()
                                    .h(px(34.))
                                    .rounded_full()
                                    .bg(start_bg)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _window, cx| {
                                        this.handle_compose_submit(cx);
                                    }))
                                    .child(div().text_color(start_fg).child(
                                        if self.compose_submitting {
                                            "Starting..."
                                        } else {
                                            "Start Chat"
                                        },
                                    )),
                            ),
                    ),
            )
    }
}

impl Render for ChatView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let c = Colors::from_theme(cx.theme());

        div()
            .id("chat-root")
            .relative()
            .h_flex()
            .size_full()
            .child(self.render_conversation_list(&c, cx))
            .child(self.render_chat_panel(&c, cx))
            .when(self.compose_open, |el| {
                el.child(self.render_compose_modal(&c, cx))
            })
    }
}

// =============================================================================
// Message bubble
// =============================================================================

fn render_message_bubble(msg: &ChatMessage, c: &Colors) -> impl IntoElement {
    let time_str = format_ns_to_time(msg.sent_at_ns);
    let own_bubble_bg = Hsla {
        h: c.primary.h,
        s: c.primary.s * 0.4,
        l: 0.22,
        a: 1.,
    };
    let bubble_bg = if msg.is_own {
        own_bubble_bg
    } else {
        c.elevated
    };

    let bubble = div()
        .max_w(DefiniteLength::Fraction(0.7))
        .v_flex()
        .gap(px(2.))
        .child(
            div()
                .px_4()
                .py_2()
                .rounded(px(16.))
                .bg(bubble_bg)
                .child(div().text_color(c.foreground).child(msg.content.clone())),
        )
        .child(
            div()
                .text_color(c.muted_fg)
                .text_size(px(12.))
                .child(time_str),
        );

    div()
        .w_full()
        .h_flex()
        .py(px(2.))
        .when(msg.is_own, |el| el.justify_end())
        .when(!msg.is_own, |el| el.justify_start())
        .child(bubble)
}
