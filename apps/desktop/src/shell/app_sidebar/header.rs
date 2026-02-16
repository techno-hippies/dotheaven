use super::*;
use gpui_component::sidebar::SidebarHeader;

pub(super) fn build_sidebar_header() -> SidebarHeader {
    let size = px(64.);
    let logo = div()
        .size(size)
        .rounded(px(14.))
        .flex()
        .items_center()
        .justify_center()
        .overflow_hidden()
        .child(
            gpui::img("app_icon/icon.png")
                .size(size)
                .object_fit(ObjectFit::Contain)
                .with_fallback(|| {
                    gpui::svg()
                        .path("icons/music-notes.svg")
                        .size(px(32.))
                        .text_color(gpui::white())
                        .into_any_element()
                }),
        );

    SidebarHeader::new().child(div().h_flex().items_center().px_1().child(logo))
}
