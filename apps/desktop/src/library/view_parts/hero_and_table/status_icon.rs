use super::*;
use crate::ui::tooltip_for_text;
use gpui::InteractiveElement;
use gpui_component::StyledExt;

fn storage_status_tooltip_text(status: StorageStatus) -> &'static str {
    match status {
        StorageStatus::Local => "Local only",
        StorageStatus::Uploaded => "Temporary storage",
        StorageStatus::Permanent => "Stored forever",
    }
}

pub(in crate::library) fn render_storage_status_icon(status: StorageStatus) -> impl IntoElement {
    let mut container = div().w(px(36.)).h_flex().items_center().justify_center();

    match status {
        StorageStatus::Local => {}
        StorageStatus::Uploaded => {
            container = container.child(
                gpui::svg()
                    .path("icons/cloud.svg")
                    .size(px(16.))
                    .text_color(TEXT_SECONDARY()),
            );
        }
        StorageStatus::Permanent => {
            container = container.child(
                gpui::svg()
                    .path("icons/infinity.svg")
                    .size(px(16.))
                    .text_color(TEXT_SECONDARY()),
            );
        }
    }

    container
        .interactivity()
        .tooltip(tooltip_for_text(storage_status_tooltip_text(status)));

    container.into_any_element()
}
