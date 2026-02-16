//! Global app color palette, updated when the theme changes.
//!
//! Provides `colors()` which returns the current palette. All UI code should use
//! `app_colors::colors().bg_hover` etc. instead of hardcoded `const` values.
//! Call `AppColors::sync(cx)` after any theme change to update the palette.

use gpui::{App, Hsla};
use gpui_component::theme::ActiveTheme;
use std::sync::RwLock;

/// The active color palette.
#[derive(Debug, Clone, Copy)]
pub struct AppColors {
    pub bg_page: Hsla,
    pub bg_surface: Hsla,
    pub bg_elevated: Hsla,
    pub bg_hover: Hsla,
    pub bg_highlight: Hsla,
    pub text_primary: Hsla,
    pub text_secondary: Hsla,
    pub text_muted: Hsla,
    pub text_dim: Hsla,
    pub accent_blue: Hsla,
    pub accent_red: Hsla,
    pub border_default: Hsla,
    pub border_subtle: Hsla,
}

static COLORS: RwLock<Option<AppColors>> = RwLock::new(None);

impl Default for AppColors {
    fn default() -> Self {
        Self {
            bg_page: hsla_gray(0.09),
            bg_surface: hsla_gray(0.11),
            bg_elevated: hsla_gray(0.15),
            bg_hover: hsla_gray(0.19),
            bg_highlight: hsla_gray(0.16),
            text_primary: hsla_gray(0.98),
            text_secondary: hsla_gray(0.83),
            text_muted: hsla_gray(0.64),
            text_dim: hsla_gray(0.45),
            accent_blue: Hsla {
                h: 0.62,
                s: 0.93,
                l: 0.76,
                a: 1.,
            },
            accent_red: Hsla {
                h: 0.0,
                s: 0.72,
                l: 0.62,
                a: 1.,
            },
            border_default: hsla_gray(0.25),
            border_subtle: hsla_gray(0.21),
        }
    }
}

impl AppColors {
    /// Sync app colors from the current gpui-component Theme global.
    pub fn sync(cx: &mut App) {
        let theme = cx.theme();
        let c = AppColors {
            bg_page: theme.background,
            bg_surface: theme.sidebar,
            bg_elevated: theme.muted,
            bg_hover: theme.list_hover,
            bg_highlight: theme.sidebar_accent,
            text_primary: theme.foreground,
            text_secondary: theme.sidebar_foreground,
            text_muted: theme.muted_foreground,
            text_dim: theme.muted_foreground,
            accent_blue: theme.primary,
            accent_red: theme.danger,
            border_default: theme.border,
            border_subtle: theme.sidebar_border,
        };
        *COLORS.write().unwrap() = Some(c);
    }
}

/// Get the current app color palette. Fast — just a RwLock read.
pub fn colors() -> AppColors {
    COLORS.read().unwrap().unwrap_or_default()
}

fn hsla_gray(l: f32) -> Hsla {
    Hsla {
        h: 0.,
        s: 0.,
        l,
        a: 1.,
    }
}
