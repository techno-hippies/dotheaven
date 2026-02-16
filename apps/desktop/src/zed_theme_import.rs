//! Zed theme JSON importer.
//!
//! Bundles Zed's 3 default theme families (One, Ayu, Gruvbox) and supports:
//! 1. Picking a bundled base theme by name
//! 2. Importing a theme-builder JSON (overrides on top of a base theme)
//! 3. Importing a full theme family JSON

use crate::theme::hex_color;
use gpui::{App, Hsla};
use gpui_component::theme::Theme;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

// Bundled Zed theme families (Apache-2.0 licensed assets)
const ONE_JSON: &str = include_str!("../assets/themes/one.json");
const AYU_JSON: &str = include_str!("../assets/themes/ayu.json");
const GRUVBOX_JSON: &str = include_str!("../assets/themes/gruvbox.json");

/// A bundled theme variant.
pub struct BundledTheme {
    pub name: &'static str,
    family_json: &'static str,
}

/// All bundled dark theme variants available for picking.
pub fn bundled_themes() -> Vec<BundledTheme> {
    vec![
        BundledTheme {
            name: "One Dark",
            family_json: ONE_JSON,
        },
        BundledTheme {
            name: "One Light",
            family_json: ONE_JSON,
        },
        BundledTheme {
            name: "Ayu Dark",
            family_json: AYU_JSON,
        },
        BundledTheme {
            name: "Ayu Light",
            family_json: AYU_JSON,
        },
        BundledTheme {
            name: "Ayu Mirage",
            family_json: AYU_JSON,
        },
        BundledTheme {
            name: "Gruvbox Dark",
            family_json: GRUVBOX_JSON,
        },
        BundledTheme {
            name: "Gruvbox Dark Hard",
            family_json: GRUVBOX_JSON,
        },
        BundledTheme {
            name: "Gruvbox Dark Soft",
            family_json: GRUVBOX_JSON,
        },
        BundledTheme {
            name: "Gruvbox Light",
            family_json: GRUVBOX_JSON,
        },
        BundledTheme {
            name: "Gruvbox Light Hard",
            family_json: GRUVBOX_JSON,
        },
        BundledTheme {
            name: "Gruvbox Light Soft",
            family_json: GRUVBOX_JSON,
        },
    ]
}

/// Persist path for the selected theme config.
fn persist_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven");
    std::fs::create_dir_all(&dir).ok();
    dir.join("zed-theme.json")
}

/// Persisted theme config: either a bundled name or a full imported JSON.
#[derive(serde::Serialize, serde::Deserialize)]
struct PersistedTheme {
    /// Bundled theme name (e.g. "One Dark"). If set, base theme is resolved from bundled.
    bundled_name: Option<String>,
    /// Raw override JSON (from theme-builder export). Applied on top of base.
    override_json: Option<String>,
}

/// Try loading a persisted Zed theme on startup.
pub fn load_persisted(cx: &mut App) -> Option<String> {
    let path = persist_path();
    let data = std::fs::read_to_string(&path).ok()?;

    // Try new format first
    if let Ok(persisted) = serde_json::from_str::<PersistedTheme>(&data) {
        let name = apply_persisted(&persisted, cx);
        if let Some(ref n) = name {
            log::info!("Loaded persisted Zed theme: {n}");
        }
        return name;
    }

    // Legacy: raw theme JSON
    if let Ok(name) = apply_imported_json(&data, cx) {
        log::info!("Loaded persisted Zed theme (legacy): {name}");
        return Some(name);
    }

    None
}

fn persist(config: &PersistedTheme) {
    if let Ok(json) = serde_json::to_string(config) {
        if let Err(e) = std::fs::write(persist_path(), json) {
            log::warn!("Failed to persist Zed theme: {e}");
        }
    }
}

/// Remove persisted theme.
pub fn clear_persisted() {
    std::fs::remove_file(persist_path()).ok();
}

/// Apply a bundled theme by name. Returns the name on success.
pub fn apply_bundled(name: &str, cx: &mut App) -> Result<String, String> {
    let themes = bundled_themes();
    let entry = themes
        .iter()
        .find(|t| t.name == name)
        .ok_or_else(|| format!("Unknown bundled theme: {name}"))?;

    let val: Value =
        serde_json::from_str(entry.family_json).map_err(|e| format!("Parse error: {e}"))?;
    let colors = extract_theme_by_name(&val, name)?;
    apply_colors(&colors, cx);

    persist(&PersistedTheme {
        bundled_name: Some(name.to_string()),
        override_json: None,
    });

    Ok(name.to_string())
}

/// Apply an imported theme JSON (theme-builder export or full theme family).
/// For theme-builder overrides, resolves the base theme from bundled and layers overrides.
pub fn apply_imported_json(json: &str, cx: &mut App) -> Result<String, String> {
    let val: Value = serde_json::from_str(json).map_err(|e| format!("Invalid JSON: {e}"))?;

    // Format 1: theme_overrides — resolve base theme + layer overrides
    if let Some(overrides_obj) = val.get("theme_overrides").and_then(|v| v.as_object()) {
        if let Some((base_name, override_style)) = overrides_obj.iter().next() {
            // Apply base theme first
            let themes = bundled_themes();
            if let Some(entry) = themes.iter().find(|t| t.name == base_name) {
                let base_val: Value = serde_json::from_str(entry.family_json)
                    .map_err(|e| format!("Parse error: {e}"))?;
                let base_colors = extract_theme_by_name(&base_val, base_name)?;
                apply_colors(&base_colors, cx);
            }
            // Layer overrides on top
            let override_colors = flatten_colors(override_style);
            if !override_colors.is_empty() {
                apply_colors(&override_colors, cx);
            }

            let display_name = format!("{base_name} (customized)");
            persist(&PersistedTheme {
                bundled_name: Some(base_name.clone()),
                override_json: Some(json.to_string()),
            });
            return Ok(display_name);
        }
    }

    // Format 2: theme family
    if let Some(themes) = val.get("themes").and_then(|v| v.as_array()) {
        if let Some(theme) = themes.first() {
            let name = theme
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Imported Theme")
                .to_string();
            let style = theme.get("style").unwrap_or(theme);
            let colors = flatten_colors(style);
            apply_colors(&colors, cx);
            persist(&PersistedTheme {
                bundled_name: None,
                override_json: Some(json.to_string()),
            });
            return Ok(name);
        }
    }

    // Format 3: bare style object
    if val.get("background").is_some() || val.get("text").is_some() {
        let colors = flatten_colors(&val);
        apply_colors(&colors, cx);
        persist(&PersistedTheme {
            bundled_name: None,
            override_json: Some(json.to_string()),
        });
        return Ok("Imported Theme".to_string());
    }

    Err("Unrecognized Zed theme format".to_string())
}

fn apply_persisted(config: &PersistedTheme, cx: &mut App) -> Option<String> {
    // Apply bundled base if set
    if let Some(ref name) = config.bundled_name {
        let themes = bundled_themes();
        if let Some(entry) = themes.iter().find(|t| t.name == name) {
            if let Ok(val) = serde_json::from_str::<Value>(entry.family_json) {
                if let Ok(colors) = extract_theme_by_name(&val, name) {
                    apply_colors(&colors, cx);
                }
            }
        }
    }

    // Layer overrides if present
    if let Some(ref json) = config.override_json {
        if let Ok(val) = serde_json::from_str::<Value>(json) {
            if let Some(overrides_obj) = val.get("theme_overrides").and_then(|v| v.as_object()) {
                if let Some((_name, style)) = overrides_obj.iter().next() {
                    let colors = flatten_colors(style);
                    if !colors.is_empty() {
                        apply_colors(&colors, cx);
                    }
                }
            }
        }
    }

    // Determine display name
    match (&config.bundled_name, &config.override_json) {
        (Some(name), Some(_)) => Some(format!("{name} (customized)")),
        (Some(name), None) => Some(name.clone()),
        (None, Some(_)) => Some("Imported Theme".to_string()),
        (None, None) => None,
    }
}

/// Extract colors for a specific theme variant from a theme family JSON.
fn extract_theme_by_name(val: &Value, name: &str) -> Result<HashMap<String, String>, String> {
    let themes = val
        .get("themes")
        .and_then(|v| v.as_array())
        .ok_or("No themes array")?;

    let theme = themes
        .iter()
        .find(|t| t.get("name").and_then(|n| n.as_str()) == Some(name))
        .ok_or_else(|| format!("Theme '{name}' not found in family"))?;

    let style = theme.get("style").unwrap_or(theme);
    Ok(flatten_colors(style))
}

/// Flatten a Zed style object into a map of dot-notation keys to color strings.
fn flatten_colors(val: &Value) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Some(obj) = val.as_object() {
        for (key, v) in obj {
            if let Some(color) = v.as_str() {
                map.insert(key.clone(), color.to_string());
            }
        }
    }
    map
}

fn try_color(map: &HashMap<String, String>, key: &str) -> Option<Hsla> {
    map.get(key).map(|c| hex_color(c))
}

/// Apply extracted Zed colors to the gpui-component Theme.
fn apply_colors(colors: &HashMap<String, String>, cx: &mut App) {
    let theme = Theme::global_mut(cx);

    // Backgrounds
    if let Some(c) = try_color(colors, "background") {
        theme.background = c;
        theme.list = c;
        theme.tab_bar = c;
    }
    if let Some(c) = try_color(colors, "surface.background") {
        theme.sidebar = c;
        theme.popover = c;
        theme.list_head = c;
    }
    if let Some(c) = try_color(colors, "panel.background") {
        theme.sidebar = c;
    }
    if let Some(c) = try_color(colors, "elevated_surface.background") {
        theme.muted = c;
        theme.accordion = c;
        theme.secondary = c;
    }

    // Text
    if let Some(c) = try_color(colors, "text") {
        theme.foreground = c;
        theme.popover_foreground = c;
        theme.sidebar_foreground = c;
        theme.secondary_foreground = c;
        theme.tab_active_foreground = c;
        theme.sidebar_accent_foreground = c;
    }
    if let Some(c) = try_color(colors, "text.muted") {
        theme.muted_foreground = c;
        theme.tab_foreground = c;
    }
    if let Some(c) = try_color(colors, "text.accent") {
        theme.primary = c;
        theme.sidebar_primary = c;
        theme.ring = c;
        theme.link = c;
        theme.slider_bar = c;
    }

    // Borders
    if let Some(c) = try_color(colors, "border") {
        theme.border = c;
        theme.input = c;
    }
    if let Some(c) = try_color(colors, "border.variant") {
        theme.sidebar_border = c;
        theme.title_bar_border = c;
    }

    // Element states
    if let Some(c) = try_color(colors, "element.hover") {
        theme.list_hover = c;
        theme.accordion_hover = c;
        theme.secondary_hover = c;
    }
    if let Some(c) = try_color(colors, "element.active") {
        theme.list_active = c;
        theme.secondary_active = c;
    }
    if let Some(c) = try_color(colors, "element.selected") {
        theme.sidebar_accent = c;
    }

    // Title bar / tabs
    if let Some(c) = try_color(colors, "title_bar.background") {
        theme.title_bar = c;
    }
    if let Some(c) = try_color(colors, "tab_bar.background") {
        theme.tab_bar = c;
    }
    if let Some(c) = try_color(colors, "tab.active_background") {
        theme.tab_active = c;
    }
    if let Some(c) = try_color(colors, "tab.inactive_background") {
        theme.tab = c;
    }

    // Scrollbar
    if let Some(c) = try_color(colors, "scrollbar.thumb.background") {
        theme.scrollbar_thumb = c;
    }
    if let Some(c) = try_color(colors, "scrollbar.thumb.hover_background") {
        theme.scrollbar_thumb_hover = c;
    }

    // Semantic / status
    if let Some(c) = try_color(colors, "error") {
        theme.danger = c;
        theme.red = c;
    }
    if let Some(c) = try_color(colors, "success") {
        theme.success = c;
        theme.green = c;
    }
    if let Some(c) = try_color(colors, "warning") {
        theme.warning = c;
        theme.yellow = c;
    }
    if let Some(c) = try_color(colors, "info") {
        theme.info = c;
        theme.blue = c;
    }

    // Primary foreground — derive from background for contrast
    if let Some(bg) = try_color(colors, "background") {
        theme.primary_foreground = bg;
        theme.danger_foreground = bg;
        theme.success_foreground = bg;
        theme.warning_foreground = bg;
        theme.sidebar_primary_foreground = bg;
    }
}
