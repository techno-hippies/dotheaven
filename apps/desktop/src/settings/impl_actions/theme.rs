use super::super::*;
use crate::app_colors::AppColors;
use crate::theme::apply_heaven_theme;
use crate::zed_theme_import;

impl SettingsView {
    pub(crate) fn apply_bundled_theme(&mut self, name: String, cx: &mut Context<Self>) {
        apply_heaven_theme(cx);
        match zed_theme_import::apply_bundled(&name, cx) {
            Ok(applied) => {
                self.imported_theme_name = Some(applied.clone());
                self.status = format!("Applied theme: {applied}");
                self.error = None;
                self.publish_status_success("settings.theme", self.status.clone(), cx);
            }
            Err(e) => {
                self.error = Some(format!("Theme failed: {e}"));
            }
        }
        AppColors::sync(cx);
        cx.notify();
    }

    pub(crate) fn import_zed_theme(&mut self, cx: &mut Context<Self>) {
        let paths = cx.prompt_for_paths(gpui::PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Select Zed Theme JSON".into()),
        });

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let paths = match paths.await {
                Ok(Ok(Some(paths))) if !paths.is_empty() => paths,
                _ => return,
            };

            let path = &paths[0];
            let json = match std::fs::read_to_string(path) {
                Ok(j) => j,
                Err(e) => {
                    let _ = this.update(cx, |this, cx| {
                        this.error = Some(format!("Failed to read file: {e}"));
                        cx.notify();
                    });
                    return;
                }
            };

            let _ = this.update(cx, |this, cx| {
                apply_heaven_theme(cx);
                match zed_theme_import::apply_imported_json(&json, cx) {
                    Ok(name) => {
                        this.imported_theme_name = Some(name.clone());
                        this.status = format!("Applied Zed theme: {name}");
                        this.error = None;
                        this.publish_status_success("settings.theme", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.error = Some(format!("Theme import failed: {e}"));
                    }
                }
                AppColors::sync(cx);
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn reset_theme(&mut self, cx: &mut Context<Self>) {
        zed_theme_import::clear_persisted();
        apply_heaven_theme(cx);
        AppColors::sync(cx);
        self.imported_theme_name = None;
        self.status = "Restored default Heaven theme".into();
        self.error = None;
        self.publish_status_success("settings.theme", self.status.clone(), cx);
        cx.notify();
    }
}
