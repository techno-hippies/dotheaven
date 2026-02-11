use gpui::{App, AssetSource, IntoElement, RenderOnce, SharedString, Window};
use gpui_component::{Icon, IconNamed};
use rust_embed::RustEmbed;
use std::borrow::Cow;

/// Phosphor icons used in the Heaven app (256x256 viewBox, currentColor fill).
#[derive(Clone)]
pub enum PhosphorIcon {
    House,
    MagnifyingGlass,
    ChatCircle,
    Wallet,
    CalendarBlank,
    User,
    Compass,
    List,
    ShareNetwork,
    DownloadSimple,
    Gear,
    Plus,
    MusicNotes,
    PlayFill,
    SkipBackFill,
    SkipForwardFill,
    Shuffle,
    Repeat,
    Image,
    ShareFat,
    DotsThree,
    Globe,
    FolderOpen,
    Clock,
    Hash,
    MusicNote,
    VinylRecord,
    SortAscending,
    PaperPlaneRight,
    ArrowLeft,
    PencilSimple,
}

impl IconNamed for PhosphorIcon {
    fn path(self) -> SharedString {
        match self {
            Self::House => "icons/house.svg",
            Self::MagnifyingGlass => "icons/magnifying-glass.svg",
            Self::ChatCircle => "icons/chat-circle.svg",
            Self::Wallet => "icons/wallet.svg",
            Self::CalendarBlank => "icons/calendar-blank.svg",
            Self::User => "icons/user.svg",
            Self::Compass => "icons/compass.svg",
            Self::List => "icons/list.svg",
            Self::ShareNetwork => "icons/share-network.svg",
            Self::DownloadSimple => "icons/download-simple.svg",
            Self::Gear => "icons/gear.svg",
            Self::Plus => "icons/plus.svg",
            Self::MusicNotes => "icons/music-notes.svg",
            Self::PlayFill => "icons/play-fill.svg",
            Self::SkipBackFill => "icons/skip-back-fill.svg",
            Self::SkipForwardFill => "icons/skip-forward-fill.svg",
            Self::Shuffle => "icons/shuffle.svg",
            Self::Repeat => "icons/repeat.svg",
            Self::Image => "icons/image.svg",
            Self::ShareFat => "icons/share-fat.svg",
            Self::DotsThree => "icons/dots-three.svg",
            Self::Globe => "icons/globe.svg",
            Self::FolderOpen => "icons/folder-open.svg",
            Self::Clock => "icons/clock.svg",
            Self::Hash => "icons/hash.svg",
            Self::MusicNote => "icons/music-note.svg",
            Self::VinylRecord => "icons/vinyl-record.svg",
            Self::SortAscending => "icons/sort-ascending.svg",
            Self::PaperPlaneRight => "icons/paper-plane-right.svg",
            Self::ArrowLeft => "icons/arrow-left.svg",
            Self::PencilSimple => "icons/pencil-simple.svg",
        }
        .into()
    }
}

impl IntoElement for PhosphorIcon {
    type Element = <Icon as IntoElement>::Element;

    fn into_element(self) -> Self::Element {
        Icon::new(self).into_element()
    }
}

impl RenderOnce for PhosphorIcon {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        Icon::new(self)
    }
}

/// Embed our custom Phosphor SVGs.
#[derive(RustEmbed)]
#[folder = "assets"]
#[include = "icons/*.svg"]
#[include = "icons/**/*.svg"]
pub struct HeavenAssets;

/// Combined asset source: tries our icons first, falls back to gpui-component-assets.
pub struct CombinedAssets;

impl AssetSource for CombinedAssets {
    fn load(&self, path: &str) -> gpui::Result<Option<Cow<'static, [u8]>>> {
        if path.is_empty() {
            return Ok(None);
        }

        // Try our Phosphor icons first
        if let Some(file) = HeavenAssets::get(path) {
            return Ok(Some(file.data));
        }

        // Fall back to gpui-component's Lucide icons
        gpui_component_assets::Assets.load(path)
    }

    fn list(&self, path: &str) -> gpui::Result<Vec<SharedString>> {
        let mut items: Vec<SharedString> = HeavenAssets::iter()
            .filter(|p| p.starts_with(path))
            .map(|p| p.into())
            .collect();

        if let Ok(base_items) = gpui_component_assets::Assets.list(path) {
            for item in base_items {
                if !items.contains(&item) {
                    items.push(item);
                }
            }
        }

        Ok(items)
    }
}
