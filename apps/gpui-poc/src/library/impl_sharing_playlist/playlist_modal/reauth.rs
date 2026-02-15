use super::*;

impl LibraryView {
    pub(in crate::library) fn trigger_playlist_modal_reauth(&mut self, cx: &mut Context<Self>) {
        if self.playlist_modal_reauth_busy {
            return;
        }

        self.playlist_modal_reauth_busy = true;
        self.playlist_modal_error = None;
        self.set_status_message("Opening browser for wallet auth...", cx);
        cx.update_global::<auth::AuthState, _>(|state, _| {
            state.authing = true;
        });
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = auth::run_auth_callback_server().await;
            let _ = this.update(cx, |this, cx| {
                this.playlist_modal_reauth_busy = false;
                match result {
                    Ok(auth_result) => {
                        let persisted = auth::to_persisted(&auth_result);
                        match auth::save_to_disk(&persisted) {
                            Ok(()) => {
                                let persisted_for_state = persisted.clone();
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.persisted = Some(persisted_for_state);
                                    state.authing = false;
                                });
                                this.playlist_modal_needs_reauth = false;
                                this.playlist_modal_error = None;
                                this.set_status_message(
                                    "Session refreshed. Retrying playlist action...",
                                    cx,
                                );
                                this.submit_playlist_modal(cx);
                            }
                            Err(err) => {
                                let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                                    state.authing = false;
                                });
                                this.playlist_modal_needs_reauth = true;
                                this.playlist_modal_error = Some(format!(
                                    "Sign-in succeeded, but auth could not be persisted: {}",
                                    summarize_status_error(&err)
                                ));
                            }
                        }
                    }
                    Err(err) => {
                        let _ = cx.update_global::<auth::AuthState, _>(|state, _| {
                            state.authing = false;
                        });
                        this.playlist_modal_needs_reauth = true;
                        this.playlist_modal_error =
                            Some(format!("Sign-in failed: {}", summarize_status_error(&err)));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
