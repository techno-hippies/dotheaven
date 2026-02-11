//! Reusable three-dot overflow menu trigger used in list rows.

use gpui::*;
use gpui_component::button::{Button, ButtonVariants};
use gpui_component::menu::{DropdownMenu, PopupMenu};
use gpui_component::Sizable;

const TEXT_SECONDARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.83,
    a: 1.,
};
const TEXT_PRIMARY: Hsla = Hsla {
    h: 0.,
    s: 0.,
    l: 0.98,
    a: 1.,
};

pub fn track_row_overflow_menu(
    id: impl Into<ElementId>,
    hover_group: SharedString,
    always_visible: bool,
    menu_builder: impl Fn(PopupMenu, &mut Window, &mut Context<PopupMenu>) -> PopupMenu + 'static,
) -> impl IntoElement {
    let icon_group = hover_group.clone();
    let trigger_id = id.into();
    let mut container = div()
        .w(px(36.))
        .h(px(28.))
        .rounded(px(6.))
        .flex()
        .items_center()
        .justify_center()
        .opacity(if always_visible { 1.0 } else { 0.0 });

    if !always_visible {
        container = container.group_hover(hover_group, |s| s.opacity(1.));
    }

    container.child(
        Button::new(trigger_id)
            .ghost()
            .small()
            .h(px(28.))
            .w(px(28.))
            .rounded(px(6.))
            .on_click(|_, _, cx| {
                cx.stop_propagation();
            })
            .child(
                gpui::svg()
                    .path("icons/dots-three.svg")
                    .size(px(18.))
                    .text_color(TEXT_SECONDARY)
                    .group_hover(icon_group, |s| s.text_color(TEXT_PRIMARY)),
            )
            .dropdown_menu_with_anchor(Corner::TopRight, menu_builder),
    )
}
