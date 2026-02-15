use super::*;

impl RoomsView {
    pub(super) fn publish_status_progress(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_progress(key.clone(), message.clone(), None);
        });
    }

    pub(super) fn publish_status_info(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_info(key.clone(), message.clone());
        });
    }

    pub(super) fn publish_status_success(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_success(key.clone(), message.clone());
        });
    }

    pub(super) fn publish_status_error(
        &mut self,
        key: &str,
        message: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        let key = key.to_string();
        let message = message.into();
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.publish_error(key.clone(), message.clone());
        });
    }
}
