use std::time::Instant;

use super::agora_engine::{AgoraEngineEvent, AgoraNativeEngine};
use super::api::{self, ChatHistoryItem, VoiceEndpoints};
use super::auth::WorkerAuthContext;
use super::transport::{VoiceCapabilities, VoiceTransport};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceState {
    Idle,
    Connecting,
    Connected,
    Error,
}

#[derive(Clone, Debug)]
pub struct VoiceSnapshot {
    pub state: VoiceState,
    pub is_muted: bool,
    pub duration_seconds: u64,
    pub bot_speaking: bool,
    pub last_error: Option<String>,
}

impl Default for VoiceSnapshot {
    fn default() -> Self {
        Self {
            state: VoiceState::Idle,
            is_muted: false,
            duration_seconds: 0,
            bot_speaking: false,
            last_error: None,
        }
    }
}

pub struct ScarlettVoiceController {
    endpoints: VoiceEndpoints,
    auth: Option<WorkerAuthContext>,
    engine: Option<AgoraNativeEngine>,
    session_id: Option<String>,
    state: VoiceState,
    is_muted: bool,
    connected_since: Option<Instant>,
    bot_speaking: bool,
    last_error: Option<String>,
}

impl ScarlettVoiceController {
    pub fn call_supported(&self) -> bool {
        VoiceCapabilities::for_current_client().supports(VoiceTransport::Agora)
    }

    pub fn new() -> Self {
        Self {
            endpoints: VoiceEndpoints::default(),
            auth: None,
            engine: None,
            session_id: None,
            state: VoiceState::Idle,
            is_muted: false,
            connected_since: None,
            bot_speaking: false,
            last_error: None,
        }
    }

    pub fn snapshot(&self) -> VoiceSnapshot {
        let duration_seconds = self
            .connected_since
            .map(|started| started.elapsed().as_secs())
            .unwrap_or(0);
        VoiceSnapshot {
            state: self.state,
            is_muted: self.is_muted,
            duration_seconds,
            bot_speaking: self.bot_speaking,
            last_error: self.last_error.clone(),
        }
    }

    pub fn start_call(&mut self) -> Result<(), String> {
        if !self.call_supported() {
            return Err(
                "Scarlett voice calls are not supported in GPUI desktop right now. Desktop voice uses JackTrip for session calls."
                    .to_string(),
            );
        }

        if self.state == VoiceState::Connected || self.state == VoiceState::Connecting {
            return Ok(());
        }
        if self.engine.is_some() || self.session_id.is_some() {
            self.stop_engine();
            self.stop_agent_best_effort();
            self.connected_since = None;
            self.bot_speaking = false;
        }

        self.state = VoiceState::Connecting;
        self.bot_speaking = false;
        self.last_error = None;

        let start = match {
            let endpoints = self.endpoints.clone();
            let auth = self.auth_mut();
            auth.and_then(|auth| api::start_agent(auth, &endpoints))
        } {
            Ok(start) => start,
            Err(err) => {
                self.mark_runtime_error(err.clone());
                return Err(err);
            }
        };

        let mut engine = match AgoraNativeEngine::new(&self.endpoints.agora_app_id) {
            Ok(engine) => engine,
            Err(err) => {
                self.cleanup_after_failed_start(Some(start.session_id.clone()));
                self.mark_runtime_error(err.clone());
                return Err(err);
            }
        };

        if self.endpoints.china_cn_only {
            if let Err(err) = engine.set_cn_only(true) {
                self.cleanup_after_failed_start(Some(start.session_id.clone()));
                self.mark_runtime_error(err.clone());
                return Err(err);
            }
        }

        if let Err(err) = engine.join(&start.channel, &start.agora_token, start.user_uid) {
            self.cleanup_after_failed_start(Some(start.session_id.clone()));
            self.mark_runtime_error(err.clone());
            return Err(err);
        }

        if self.is_muted {
            if let Err(err) = engine.set_mic_enabled(false) {
                log::warn!("[Voice] failed to apply muted state after join: {err}");
            }
        }

        self.session_id = Some(start.session_id);
        self.engine = Some(engine);
        self.connected_since = Some(Instant::now());
        self.state = VoiceState::Connected;
        Ok(())
    }

    pub fn end_call(&mut self) -> Result<(), String> {
        self.stop_engine();
        self.stop_agent_best_effort();
        self.state = VoiceState::Idle;
        self.connected_since = None;
        self.bot_speaking = false;
        self.last_error = None;
        Ok(())
    }

    pub fn toggle_mute(&mut self) -> Result<(), String> {
        self.is_muted = !self.is_muted;
        if let Some(engine) = self.engine.as_mut() {
            engine.set_mic_enabled(!self.is_muted)?;
        }
        Ok(())
    }

    pub fn send_chat_message(
        &mut self,
        message: &str,
        history: &[ChatHistoryItem],
    ) -> Result<String, String> {
        let endpoints = self.endpoints.clone();
        let auth = self.auth_mut()?;
        api::send_chat_message(auth, &endpoints, message, history)
    }

    pub fn tick(&mut self) -> bool {
        let mut changed = false;
        let Some(engine) = self.engine.as_mut() else {
            return false;
        };
        match engine.poll_events() {
            Ok(events) => {
                for event in events {
                    match event {
                        AgoraEngineEvent::BotSpeaking => {
                            if !self.bot_speaking {
                                self.bot_speaking = true;
                                changed = true;
                            }
                        }
                        AgoraEngineEvent::BotSilent => {
                            if self.bot_speaking {
                                self.bot_speaking = false;
                                changed = true;
                            }
                        }
                        AgoraEngineEvent::UserJoined(uid) => {
                            log::info!("[Voice] remote user joined: {uid}");
                        }
                        AgoraEngineEvent::UserLeft(uid) => {
                            log::info!("[Voice] remote user left: {uid}");
                            if self.bot_speaking {
                                self.bot_speaking = false;
                                changed = true;
                            }
                        }
                        AgoraEngineEvent::Error(err) => {
                            self.mark_runtime_error(err);
                            changed = true;
                            break;
                        }
                    }
                }
            }
            Err(err) => {
                self.mark_runtime_error(err);
                changed = true;
            }
        }
        changed
    }

    pub fn reset_auth(&mut self) {
        if let Some(auth) = self.auth.as_mut() {
            auth.clear();
        }
        self.auth = None;
    }

    fn auth_mut(&mut self) -> Result<&mut WorkerAuthContext, String> {
        if self.auth.is_none() {
            self.auth = Some(WorkerAuthContext::from_disk()?);
        }
        self.auth
            .as_mut()
            .ok_or_else(|| "voice auth context unavailable".to_string())
    }

    fn cleanup_after_failed_start(&mut self, session_id: Option<String>) {
        self.stop_engine();
        if let Some(session_id) = session_id {
            let endpoints = self.endpoints.clone();
            if let Ok(auth) = self.auth_mut() {
                if let Err(err) = api::stop_agent(auth, &endpoints, &session_id) {
                    log::warn!("[Voice] failed to stop agent after startup failure: {err}");
                }
            }
        }
        self.session_id = None;
        self.connected_since = None;
        self.bot_speaking = false;
    }

    fn stop_agent_best_effort(&mut self) {
        let Some(session_id) = self.session_id.take() else {
            return;
        };
        let endpoints = self.endpoints.clone();
        if let Ok(auth) = self.auth_mut() {
            if let Err(err) = api::stop_agent(auth, &endpoints, &session_id) {
                log::warn!("[Voice] stop agent failed: {err}");
            }
        }
    }

    fn stop_engine(&mut self) {
        if let Some(mut engine) = self.engine.take() {
            if let Err(err) = engine.leave() {
                log::warn!("[Voice] leave channel failed: {err}");
            }
        }
    }

    fn mark_runtime_error(&mut self, err: String) {
        self.stop_engine();
        self.stop_agent_best_effort();
        self.connected_since = None;
        self.bot_speaking = false;
        self.state = VoiceState::Error;
        self.last_error = Some(err);
    }
}
