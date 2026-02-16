use super::*;

pub(in crate::library) fn render_hero(
    _title: &str,
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
    let subtitle: Option<String> = if scanning {
        Some(match progress {
            Some(p) if p.total > 0 => format!("Scanning... {}/{} files", p.done, p.total),
            Some(_) => "Discovering files...".to_string(),
            None => "Scanning...".to_string(),
        })
    } else if loading {
        Some(format!("Loading... {}/{} tracks", loaded, count))
    } else {
        None
    };

    let entity = cx.entity().clone();

    div()
        .w_full()
        .px_6()
        .pt_6()
        .pb_4()
        .v_flex()
        .gap_4()
        // Title row: "Library" on left, three-dot menu on right
        .child(
            div()
                .h_flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .h_flex()
                        .items_center()
                        .gap_3()
                        .child(
                            div()
                                .text_xl()
                                .font_weight(FontWeight::BOLD)
                                .text_color(TEXT_PRIMARY())
                                .child("Library"),
                        )
                        .when_some(subtitle, |el, sub| {
                            el.child(div().text_color(TEXT_MUTED()).child(sub))
                        }),
                )
                .child(render_hero_overflow_menu(entity)),
        )
        // Turbo Credits card (full-width)
        .child(render_turbo_credits_card(
            storage_balance,
            storage_loading,
            add_funds_busy,
            cx,
        ))
}

/// Full-width Turbo Credits card with coin icon, balance, and Add Credits button.
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

    div()
        .h_flex()
        .w_full()
        .items_center()
        .gap_4()
        .px_5()
        .py_3()
        .rounded(px(8.))
        .bg(BG_ELEVATED())
        .border_1()
        .border_color(BORDER_SUBTLE())
        .child(
            div()
                .flex_none()
                .size(px(48.))
                .rounded_full()
                .bg(BG_HOVER())
                .h_flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/coin-vertical.svg")
                        .size(px(24.))
                        .text_color(ACCENT_BLUE()),
                ),
        )
        .child(
            div()
                .v_flex()
                .gap(px(2.))
                .child(
                    div()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(TEXT_SECONDARY())
                        .child("Turbo Credits"),
                )
                .child(
                    div()
                        .text_xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(TEXT_PRIMARY())
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
                .bg(ACCENT_BLUE())
                .cursor_pointer()
                .hover(|s| s.opacity(0.85))
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

/// Three-dot overflow menu for library management actions (Pick Folder, Rescan).
fn render_hero_overflow_menu(entity: Entity<LibraryView>) -> impl IntoElement {
    let folder_entity = entity.clone();
    let rescan_entity = entity;

    Button::new("library-overflow")
        .ghost()
        .small()
        .h(px(32.))
        .w(px(32.))
        .rounded_full()
        .on_click(|_, _, cx| {
            cx.stop_propagation();
        })
        .child(
            gpui::svg()
                .path("icons/dots-three.svg")
                .size(px(18.))
                .text_color(TEXT_SECONDARY()),
        )
        .dropdown_menu_with_anchor(Corner::TopRight, move |menu, _window, _cx| {
            menu.item(PopupMenuItem::new("Pick Folder").on_click({
                let ent = folder_entity.clone();
                move |_, _, cx| {
                    let _ = ent.update(cx, |this, cx| {
                        this.browse_folder(cx);
                    });
                }
            }))
            .item(PopupMenuItem::new("Rescan Library").on_click({
                let ent = rescan_entity.clone();
                move |_, _, cx| {
                    let _ = ent.update(cx, |this, cx| {
                        this.rescan(cx);
                    });
                }
            }))
        })
}

/// Reusable button used by shared page and other hero sections.
pub(in crate::library) fn hero_button(
    id: &'static str,
    icon: &'static str,
    label: &'static str,
    primary: bool,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let (bg, text_color) = if primary {
        (TEXT_PRIMARY(), hsla(0., 0., 0.09, 1.))
    } else {
        (hsla(0., 0., 1., 0.15), TEXT_PRIMARY())
    };

    div()
        .id(ElementId::Name(id.into()))
        .h_flex()
        .items_center()
        .gap(px(6.))
        .px_4()
        .py_2()
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
