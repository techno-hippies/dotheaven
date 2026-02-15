//! Reusable tooltip helpers shared across GPUI views.

use gpui::*;
use gpui_component::tooltip::Tooltip;

pub fn tooltip_for_text(
    text: impl Into<SharedString>,
) -> impl Fn(&mut Window, &mut App) -> AnyView + 'static {
    let text: SharedString = text.into();
    move |window, cx| Tooltip::new(text.clone()).build(window, cx)
}
