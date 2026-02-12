use gpui::*;
use gpui_component::StyledExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    Home,
    Community,
    Messages,
    Wallet,
    Schedule,
    Profile,
    MusicDiscover,
    MusicLibrary,
    Rooms,
    MusicShared,
    Download,
    Settings,
}

impl Page {
    pub fn title(&self) -> &'static str {
        match self {
            Page::Home => "Home",
            Page::Community => "Search",
            Page::Messages => "Messages",
            Page::Wallet => "Wallet",
            Page::Schedule => "Schedule",
            Page::Profile => "Profile",
            Page::MusicDiscover => "Discover",
            Page::MusicLibrary => "Library",
            Page::Rooms => "Rooms",
            Page::MusicShared => "Shared With Me",
            Page::Download => "Download",
            Page::Settings => "Settings",
        }
    }

    /// Placeholder page content — each will become its own view later.
    pub fn render_placeholder(&self) -> impl IntoElement {
        div()
            .v_flex()
            .size_full()
            .items_center()
            .justify_center()
            .child(
                div()
                    .v_flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .text_2xl()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(hsla(0., 0., 0.98, 1.))
                            .child(self.title()),
                    )
                    .child(
                        div()
                            .text_color(hsla(0., 0., 0.64, 1.))
                            .child("Coming soon"),
                    ),
            )
    }
}
