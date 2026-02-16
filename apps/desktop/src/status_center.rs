use std::time::{Duration, Instant};

use gpui::prelude::FluentBuilder;
use gpui::*;
use gpui_component::{ActiveTheme, StyledExt};

const MAX_STATUS_ENTRIES: usize = 8;
const INFO_TTL: Duration = Duration::from_secs(5);
const SUCCESS_TTL: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusKind {
    Progress,
    Info,
    Success,
    Error,
}

#[derive(Debug, Clone)]
pub struct StatusEntry {
    pub id: u64,
    pub key: String,
    pub kind: StatusKind,
    pub message: String,
    pub progress: Option<f32>,
    pub sticky: bool,
    pub expires_at: Option<Instant>,
}

#[derive(Clone, Default)]
pub struct StatusCenter {
    entries: Vec<StatusEntry>,
    next_id: u64,
}

impl gpui::Global for StatusCenter {}

impl StatusCenter {
    pub fn publish_auto(&mut self, key: impl Into<String>, message: impl Into<String>) {
        let key = key.into();
        let message = message.into();
        let lower = message.to_ascii_lowercase();

        if message.contains("...") {
            self.publish_progress(key, message, None);
        } else if lower.contains("failed")
            || lower.contains("error")
            || lower.contains("invalid")
            || lower.contains("missing")
            || lower.contains("unavailable")
        {
            self.publish_error(key, message);
        } else if lower.contains("complete")
            || lower.contains("submitted")
            || lower.starts_with("shared ")
            || lower.starts_with("playing ")
            || lower.starts_with("downloaded ")
            || lower.contains("saved to chain")
            || lower.contains("playlist updated")
            || lower.contains("session refreshed")
        {
            self.publish_success(key, message);
        } else {
            self.publish_info(key, message);
        }
    }

    pub fn publish_progress(
        &mut self,
        key: impl Into<String>,
        message: impl Into<String>,
        progress: Option<f32>,
    ) {
        self.upsert(
            key.into(),
            StatusKind::Progress,
            message.into(),
            progress,
            true,
            None,
        );
    }

    pub fn publish_info(&mut self, key: impl Into<String>, message: impl Into<String>) {
        self.upsert(
            key.into(),
            StatusKind::Info,
            message.into(),
            None,
            false,
            Some(INFO_TTL),
        );
    }

    pub fn publish_success(&mut self, key: impl Into<String>, message: impl Into<String>) {
        self.upsert(
            key.into(),
            StatusKind::Success,
            message.into(),
            None,
            false,
            Some(SUCCESS_TTL),
        );
    }

    pub fn publish_error(&mut self, key: impl Into<String>, message: impl Into<String>) {
        self.upsert(
            key.into(),
            StatusKind::Error,
            message.into(),
            None,
            true,
            None,
        );
    }

    pub fn dismiss(&mut self, id: u64) -> bool {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.id != id);
        before != self.entries.len()
    }

    pub fn dismiss_key(&mut self, key: &str) -> bool {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.key != key);
        before != self.entries.len()
    }

    pub fn sweep_expired(&mut self) -> bool {
        let now = Instant::now();
        let before = self.entries.len();
        self.entries.retain(|entry| match entry.expires_at {
            Some(expires_at) => expires_at > now,
            None => true,
        });
        before != self.entries.len()
    }

    pub fn entries(&self) -> &[StatusEntry] {
        &self.entries
    }

    fn upsert(
        &mut self,
        key: String,
        kind: StatusKind,
        message: String,
        progress: Option<f32>,
        sticky: bool,
        ttl: Option<Duration>,
    ) {
        let expires_at = ttl.map(|dur| Instant::now() + dur);
        let mut entry = if let Some(index) = self.entries.iter().position(|entry| entry.key == key)
        {
            self.entries.remove(index)
        } else {
            self.next_id = self.next_id.saturating_add(1);
            StatusEntry {
                id: self.next_id,
                key,
                kind,
                message: String::new(),
                progress: None,
                sticky: false,
                expires_at: None,
            }
        };

        entry.kind = kind;
        entry.message = message;
        entry.progress = progress.map(|value| value.clamp(0.0, 1.0));
        entry.sticky = sticky;
        entry.expires_at = expires_at;
        self.entries.push(entry);

        if self.entries.len() > MAX_STATUS_ENTRIES {
            let overflow = self.entries.len() - MAX_STATUS_ENTRIES;
            self.entries.drain(0..overflow);
        }
    }
}

pub fn render_status_overlay(cx: &App) -> Option<AnyElement> {
    let status = cx.try_global::<StatusCenter>()?;
    let latest = status.entries().last()?.clone();
    let queued = status.entries().len().saturating_sub(1);

    let theme = cx.theme();
    let surface = theme.sidebar;
    let border = theme.border;
    let foreground = theme.foreground;
    let muted = theme.muted_foreground;
    let muted_bg = theme.muted;

    let dot_color = match latest.kind {
        StatusKind::Progress => theme.primary,
        StatusKind::Info => theme.blue,
        StatusKind::Success => theme.success,
        StatusKind::Error => theme.danger,
    };

    let progress_text = latest
        .progress
        .map(|value| format!("{:.0}%", (value * 100.0).clamp(0.0, 100.0)));
    let dismiss_id = latest.id;

    Some(
        div()
            .id("global-status-overlay")
            .absolute()
            .left_0()
            .right_0()
            .bottom_0()
            .child(
                div()
                    .h(px(46.))
                    .w_full()
                    .h_flex()
                    .items_center()
                    .gap_3()
                    .px_4()
                    .bg(surface)
                    .border_t_1()
                    .border_color(border)
                    .child(div().size(px(8.)).rounded_full().bg(dot_color))
                    .child(
                        div()
                            .text_sm()
                            .text_color(foreground)
                            .truncate()
                            .min_w_0()
                            .flex_1()
                            .child(latest.message),
                    )
                    .when_some(progress_text, |el, progress| {
                        el.child(div().text_xs().text_color(muted).child(progress))
                    })
                    .when(queued > 0, |el| {
                        el.child(
                            div()
                                .text_xs()
                                .text_color(muted)
                                .child(format!("+{}", queued)),
                        )
                    })
                    .when(latest.sticky, |el| {
                        el.child(
                            div()
                                .id(ElementId::Name(
                                    format!("global-status-dismiss-{}", dismiss_id).into(),
                                ))
                                .size(px(24.))
                                .rounded_full()
                                .bg(muted_bg)
                                .cursor_pointer()
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(move |_, _, cx| {
                                    cx.update_global::<StatusCenter, _>(|status, _| {
                                        status.dismiss(dismiss_id);
                                    });
                                })
                                .child(
                                    gpui::svg()
                                        .path("icons/x.svg")
                                        .size(px(12.))
                                        .text_color(foreground),
                                ),
                        )
                    }),
            )
            .into_any_element(),
    )
}
