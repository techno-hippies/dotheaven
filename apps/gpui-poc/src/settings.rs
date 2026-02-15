//! Settings page for account/session actions and developer tooling.

use std::path::Path;
use std::sync::{Arc, Mutex};

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::StyledExt;

use crate::auth;
use crate::lit_wallet::LitWalletService;
use crate::load_storage::{LoadStorageService, TrackMetaInput};
use crate::voice::jacktrip::JackTripController;

mod helpers;
mod impl_actions;
mod render;

const BG_ELEVATED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.15,
    a: 1.,
};
const BG_HOVER: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.19,
    a: 1.,
};
const BORDER_SUBTLE: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.21,
    a: 1.,
};
const TEXT_PRIMARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.98,
    a: 1.,
};
const TEXT_MUTED: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.64,
    a: 1.,
};
const TEXT_DIM: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.45,
    a: 1.,
};
const ACCENT_BLUE: Hsla = Hsla {
    h: 0.62,
    s: 0.93,
    l: 0.76,
    a: 1.,
};
const ACCENT_RED: Hsla = Hsla {
    h: 0.0,
    s: 0.72,
    l: 0.62,
    a: 1.,
};

const SMOKE_ACTION_CODE: &str = r#"(async () => {
  const now = new Date().toISOString();
  Lit.Actions.setResponse({ response: JSON.stringify({ ok: true, source: "gpui-rust", now }) });
})();"#;

pub struct SettingsView {
    service: Arc<Mutex<LitWalletService>>,
    storage: Arc<Mutex<LoadStorageService>>,
    jacktrip_test: Arc<Mutex<JackTripController>>,
    busy: bool,
    status: String,
    last_action_response: Option<String>,
    last_signature: Option<String>,
    last_storage_response: Option<String>,
    last_voice_response: Option<String>,
    error: Option<String>,
    show_dev_tools: bool,
}

impl SettingsView {
    pub(super) fn publish_status_progress(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_progress(key.clone(), message.clone(), None);
        });
    }

    pub(super) fn publish_status_info(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_info(key.clone(), message.clone());
        });
    }

    pub(super) fn publish_status_success(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_success(key.clone(), message.clone());
        });
    }

    pub(super) fn publish_status_error(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_error(key.clone(), message.clone());
        });
    }
}
