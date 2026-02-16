use super::*;

pub(super) fn infer_track_meta_from_path(path: &Path) -> TrackMetaInput {
    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Track")
        .trim()
        .to_string();

    let split: Vec<&str> = file_name.split(" - ").collect();
    if split.len() >= 2 {
        let artist = split[0].trim().to_string();
        let title = split[1..].join(" - ").trim().to_string();
        if !title.is_empty() && !artist.is_empty() {
            return TrackMetaInput {
                title: Some(title),
                artist: Some(artist),
                album: Some(String::new()),
                mbid: None,
                ip_id: None,
            };
        }
    }

    TrackMetaInput {
        title: Some(file_name),
        artist: Some("Unknown Artist".to_string()),
        album: Some(String::new()),
        mbid: None,
        ip_id: None,
    }
}

pub(super) fn info_line(label: &str, value: &str) -> impl IntoElement {
    div()
        .h_flex()
        .gap_2()
        .child(
            div()
                .text_sm()
                .text_color(TEXT_DIM())
                .min_w(px(120.))
                .child(format!("{label}:")),
        )
        .child(
            div()
                .text_sm()
                .text_color(TEXT_PRIMARY())
                .child(value.to_string()),
        )
}

pub(super) fn result_box(title: &str, body: &str) -> impl IntoElement {
    div()
        .v_flex()
        .gap_2()
        .p_4()
        .rounded(px(10.))
        .bg(BG_ELEVATED())
        .border_1()
        .border_color(BORDER_SUBTLE())
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(TEXT_PRIMARY())
                .child(title.to_string()),
        )
        .child(
            div()
                .text_xs()
                .text_color(TEXT_MUTED())
                .child(body.to_string()),
        )
}

pub(super) fn action_button(
    label: &'static str,
    enabled: bool,
    primary: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let bg = if primary {
        ACCENT_BLUE()
    } else {
        BG_ELEVATED()
    };
    let text = if primary {
        hsla(0., 0., 0.09, 1.)
    } else {
        TEXT_PRIMARY()
    };

    div()
        .id(ElementId::Name(format!("settings-{label}").into()))
        .h_flex()
        .items_center()
        .justify_center()
        .px_4()
        .py(px(9.))
        .rounded(px(8.))
        .border_1()
        .border_color(BORDER_SUBTLE())
        .bg(if enabled { bg } else { BG_HOVER() })
        .text_sm()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(text)
        .cursor_pointer()
        .when(enabled, |el| {
            el.on_click(move |ev, window, cx| on_click(ev, window, cx))
        })
        .child(label)
}

pub(super) fn local_jacktrip_port() -> u16 {
    std::env::var("HEAVEN_JACKTRIP_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(4464)
}
