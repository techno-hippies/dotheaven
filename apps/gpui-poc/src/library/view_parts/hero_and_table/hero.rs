use super::*;

pub(in crate::library) fn render_hero(
    title: &str,
    count: i64,
    loaded: usize,
    scanning: bool,
    loading: bool,
    progress: Option<&ScanProgress>,
    storage_balance: Option<&str>,
    _storage_monthly: Option<&str>,
    _storage_days: Option<i64>,
    storage_loading: bool,
    add_funds_busy: bool,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let subtitle = if scanning {
        match progress {
            Some(p) if p.total > 0 => format!("Scanning... {}/{} files", p.done, p.total),
            Some(_) => "Discovering files...".to_string(),
            None => "Scanning...".to_string(),
        }
    } else if loading {
        format!("Loading... {}/{} tracks", loaded, count)
    } else {
        format!("{} tracks in {}", count, title)
    };

    div()
        .w_full()
        .px_6()
        .pt_8()
        .pb_6()
        .bg(HERO_BG)
        .v_flex()
        .gap_4()
        .child(
            div()
                .v_flex()
                .gap_1()
                .child(
                    div()
                        .text_2xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .child("Library"),
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(hsla(0., 0., 0.85, 1.))
                        .child(subtitle),
                ),
        )
        .child(
            div()
                .h_flex()
                .gap_2()
                .child(hero_button(
                    "play-all",
                    "icons/play-fill.svg",
                    "Play All",
                    true,
                    cx.listener(|this, _, _w, cx| {
                        this.play_all(cx);
                        cx.notify();
                    }),
                ))
                .child(hero_button_passive(
                    "shuffle",
                    "icons/shuffle.svg",
                    "Shuffle",
                ))
                .child(hero_button(
                    "pick-folder",
                    "icons/folder-open.svg",
                    "Pick Folder",
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.browse_folder(cx);
                    }),
                ))
                .child(hero_button(
                    "rescan",
                    "icons/sort-ascending.svg",
                    "Rescan",
                    false,
                    cx.listener(|this, _, _w, cx| {
                        this.rescan(cx);
                    }),
                )),
        )
        .child(render_turbo_credits_card(
            storage_balance,
            storage_loading,
            add_funds_busy,
            cx,
        ))
}

pub(in crate::library) fn hero_button(
    id: &'static str,
    icon: &'static str,
    label: &'static str,
    primary: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let (bg, text_color) = if primary {
        (TEXT_PRIMARY, hsla(0., 0., 0.09, 1.))
    } else {
        (hsla(0., 0., 1., 0.15), TEXT_PRIMARY)
    };

    div()
        .id(ElementId::Name(id.into()))
        .h_flex()
        .items_center()
        .gap(px(6.))
        .px_4()
        .py(px(8.))
        .rounded_full()
        .bg(bg)
        .cursor_pointer()
        .on_click(move |ev, window, cx| on_click(ev, window, cx))
        .child(gpui::svg().path(icon).size(px(16.)).text_color(text_color))
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(text_color)
                .child(label),
        )
}

fn hero_button_passive(
    id: &'static str,
    icon: &'static str,
    label: &'static str,
) -> impl IntoElement {
    div()
        .id(ElementId::Name(id.into()))
        .h_flex()
        .items_center()
        .gap(px(6.))
        .px_4()
        .py(px(8.))
        .rounded_full()
        .bg(hsla(0., 0., 1., 0.15))
        .cursor_pointer()
        .child(
            gpui::svg()
                .path(icon)
                .size(px(16.))
                .text_color(TEXT_PRIMARY),
        )
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::MEDIUM)
                .text_color(TEXT_PRIMARY)
                .child(label),
        )
}

fn render_turbo_credits_card(
    balance: Option<&str>,
    loading: bool,
    add_funds_busy: bool,
    cx: &mut Context<LibraryView>,
) -> impl IntoElement {
    let balance_str = if loading && balance.is_none() {
        "Loading...".to_string()
    } else {
        balance.unwrap_or("0").to_string()
    };
    let card_bg = hsla(0.63, 0.30, 0.12, 1.);
    let card_border = hsla(0.63, 0.25, 0.20, 1.);
    let icon_bg = hsla(0.63, 0.25, 0.18, 1.);

    div()
        .h_flex()
        .w_full()
        .items_center()
        .gap_4()
        .px_5()
        .py_3()
        .rounded(px(8.))
        .bg(card_bg)
        .border_1()
        .border_color(card_border)
        .child(
            div()
                .flex_none()
                .size(px(48.))
                .rounded_full()
                .bg(icon_bg)
                .h_flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/coin-vertical.svg")
                        .size(px(24.))
                        .text_color(ACCENT_BLUE),
                ),
        )
        .child(
            div()
                .v_flex()
                .gap(px(2.))
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_SECONDARY)
                        .child("Turbo Credits"),
                )
                .child(
                    div()
                        .text_xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY)
                        .child(balance_str),
                ),
        )
        .child(div().flex_1())
        .child(
            div()
                .id("add-credits-btn")
                .h_flex()
                .items_center()
                .gap(px(6.))
                .px_4()
                .py(px(8.))
                .rounded_full()
                .bg(ACCENT_BLUE)
                .cursor_pointer()
                .on_click(cx.listener(|this, _, _w, cx| {
                    this.add_funds(cx);
                }))
                .child(
                    gpui::svg()
                        .path("icons/plus.svg")
                        .size(px(14.))
                        .text_color(hsla(0., 0., 0.09, 1.)),
                )
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(hsla(0., 0., 0.09, 1.))
                        .child(if add_funds_busy {
                            "Adding..."
                        } else {
                            "Add Credits"
                        }),
                ),
        )
}
