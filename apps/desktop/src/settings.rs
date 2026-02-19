//! Settings page for account/session actions and developer tooling.

use std::path::Path;
use std::sync::{Arc, Mutex};

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::select::{SelectEvent, SelectState};
use gpui_component::StyledExt;

use crate::auth;
use crate::load_storage::{LoadStorageService, TrackMetaInput};
use crate::voice::jacktrip::JackTripController;

mod helpers;
mod impl_actions;
mod render;

use crate::app_colors;

macro_rules! define_color_fns {
    ($($name:ident => $field:ident),* $(,)?) => {
        $(
            #[allow(non_snake_case)]
            fn $name() -> Hsla { app_colors::colors().$field }
        )*
    };
}

define_color_fns! {
    BG_ELEVATED => bg_elevated,
    BG_HOVER => bg_hover,
    BORDER_SUBTLE => border_subtle,
    TEXT_PRIMARY => text_primary,
    TEXT_MUTED => text_muted,
    TEXT_DIM => text_dim,
    ACCENT_BLUE => accent_blue,
    ACCENT_RED => accent_red,
}

pub struct SettingsView {
    storage: Arc<Mutex<LoadStorageService>>,
    jacktrip_test: Arc<Mutex<JackTripController>>,
    busy: bool,
    status: String,
    last_storage_response: Option<String>,
    last_voice_response: Option<String>,
    error: Option<String>,
    show_dev_tools: bool,
    pub imported_theme_name: Option<String>,
    pub theme_select: Entity<SelectState<Vec<String>>>,
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
