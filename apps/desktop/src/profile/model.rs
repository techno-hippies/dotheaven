#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProfileTab {
    Scrobbles,
    Playlists,
    Rooms,
    Music,
    About,
}

impl ProfileTab {
    pub(super) fn all() -> [ProfileTab; 5] {
        [
            ProfileTab::Scrobbles,
            ProfileTab::Playlists,
            ProfileTab::Rooms,
            ProfileTab::Music,
            ProfileTab::About,
        ]
    }

    pub(super) fn label(self) -> &'static str {
        match self {
            ProfileTab::Scrobbles => "Scrobbles",
            ProfileTab::Playlists => "Playlists",
            ProfileTab::Rooms => "Rooms",
            ProfileTab::Music => "Music",
            ProfileTab::About => "About",
        }
    }

    pub(super) fn indicator_width(self) -> f32 {
        match self {
            ProfileTab::Scrobbles => 86.0,
            ProfileTab::Playlists => 78.0,
            ProfileTab::Rooms => 58.0,
            ProfileTab::Music => 58.0,
            ProfileTab::About => 58.0,
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct ProfileScrobbleRow {
    pub(super) track_id: Option<String>,
    pub(super) played_at_sec: u64,
    pub(super) title: String,
    pub(super) artist: String,
    pub(super) album: String,
    pub(super) cover_cid: Option<String>,
    pub(super) played_ago: String,
}
