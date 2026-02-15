use super::*;

// =============================================================================
// Theme color helpers
// =============================================================================

pub(super) struct Colors {
    pub(super) background: Hsla,
    pub(super) surface: Hsla,
    pub(super) elevated: Hsla,
    pub(super) highlight: Hsla,
    pub(super) highlight_hover: Hsla,
    pub(super) border: Hsla,
    pub(super) foreground: Hsla,
    pub(super) muted_fg: Hsla,
    pub(super) primary: Hsla,
    pub(super) primary_fg: Hsla,
    pub(super) primary_hover: Hsla,
}

impl Colors {
    pub(super) fn from_theme(theme: &Theme) -> Self {
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

pub(super) fn render_avatar_with_flag(
    size_px: f32,
    nationality: Option<&str>,
    c: &Colors,
) -> impl IntoElement {
    helpers::render_avatar_with_flag(size_px, nationality, c)
}
