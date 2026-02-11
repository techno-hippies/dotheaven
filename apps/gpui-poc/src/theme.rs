use gpui::*;
use gpui_component::theme::{Theme, ThemeMode};

/// Apply the Heaven dark theme (Catppuccin Mocha) to gpui-component's theme system.
pub fn apply_heaven_theme(cx: &mut App) {
    // Force dark mode
    Theme::change(ThemeMode::Dark, None, cx);

    let theme = Theme::global_mut(cx);

    // -- Backgrounds --
    theme.background = hex_color("#171717"); // bg-page
    theme.foreground = hex_color("#fafafa"); // text-primary
    theme.border = hex_color("#363636"); // border-subtle
    theme.muted = hex_color("#262626"); // bg-elevated
    theme.muted_foreground = hex_color("#a3a3a3"); // text-muted

    // -- Sidebar --
    theme.sidebar = hex_color("#1c1c1c"); // bg-surface
    theme.sidebar_foreground = hex_color("#d4d4d4"); // text-secondary
    theme.sidebar_border = hex_color("#363636");
    theme.sidebar_accent = hex_color("#262626"); // bg-highlight (active item)
    theme.sidebar_accent_foreground = hex_color("#fafafa");
    theme.sidebar_primary = hex_color("#89b4fa"); // accent-blue
    theme.sidebar_primary_foreground = hex_color("#171717");

    // -- Primary accent (Catppuccin blue) --
    theme.primary = hex_color("#89b4fa");
    theme.primary_foreground = hex_color("#171717");
    theme.primary_hover = hex_color("#b4befe"); // lavender
    theme.primary_active = hex_color("#74c7ec"); // sapphire

    // -- Secondary --
    theme.secondary = hex_color("#262626");
    theme.secondary_foreground = hex_color("#fafafa");
    theme.secondary_hover = hex_color("#303030");
    theme.secondary_active = hex_color("#363636");

    // -- Accent (hover bg) --
    theme.accent = hex_color("#262626");
    theme.accent_foreground = hex_color("#fafafa");

    // -- Input --
    theme.input = hex_color("#404040"); // border-default
    theme.ring = hex_color("#89b4fa");

    // -- List --
    theme.list = hex_color("#171717");
    theme.list_hover = hex_color("#262626");
    theme.list_active = hex_color("#30303088");
    theme.list_head = hex_color("#1c1c1c");

    // -- Popover --
    theme.popover = hex_color("#1c1c1c");
    theme.popover_foreground = hex_color("#fafafa");

    // -- Scrollbar --
    theme.scrollbar = hsla(0., 0., 0., 0.);
    theme.scrollbar_thumb = hex_color("#40404088");

    // -- Tab bar --
    theme.tab_bar = hex_color("#171717");
    theme.tab = hex_color("#171717");
    theme.tab_active = hex_color("#1c1c1c");
    theme.tab_foreground = hex_color("#a3a3a3");
    theme.tab_active_foreground = hex_color("#fafafa");

    // -- Title bar --
    theme.title_bar = hex_color("#1c1c1c");
    theme.title_bar_border = hex_color("#363636");

    // -- Base palette (Catppuccin Mocha) --
    theme.blue = hex_color("#89b4fa");
    theme.blue_light = hex_color("#b4befe");
    theme.red = hex_color("#f38ba8");
    theme.red_light = hex_color("#eba0ac");
    theme.green = hex_color("#a6e3a1");
    theme.green_light = hex_color("#94e2d5");
    theme.yellow = hex_color("#f9e2af");
    theme.yellow_light = hex_color("#f5e0dc");
    theme.magenta = hex_color("#cba6f7");
    theme.magenta_light = hex_color("#f5c2e7");
    theme.cyan = hex_color("#89dceb");
    theme.cyan_light = hex_color("#94e2d5");

    // -- Semantic --
    theme.danger = hex_color("#f38ba8");
    theme.danger_foreground = hex_color("#171717");
    theme.danger_hover = hex_color("#eba0ac");
    theme.danger_active = hex_color("#f38ba8");
    theme.success = hex_color("#a6e3a1");
    theme.success_foreground = hex_color("#171717");
    theme.warning = hex_color("#f9e2af");
    theme.warning_foreground = hex_color("#171717");
}

/// Parse a hex color string to Hsla.
fn hex_color(hex: &str) -> Hsla {
    let hex = hex.trim_start_matches('#');

    let (r, g, b, a) = match hex.len() {
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            (r, g, b, 255u8)
        }
        8 => {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            let a = u8::from_str_radix(&hex[6..8], 16).unwrap_or(255);
            (r, g, b, a)
        }
        _ => (0, 0, 0, 255),
    };

    rgba((r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | a as u32).into()
}
