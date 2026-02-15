use super::*;

impl ChatView {
    pub(in crate::chat) fn open_jacktrip_desktop_handoff(
        &mut self,
        conversation_id: String,
        cx: &mut Context<Self>,
    ) {
        let state = self
            .session_handoff
            .entry(conversation_id.clone())
            .or_default();
        if state.opening {
            return;
        }
        state.opening = true;
        state.last_error = None;
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(|| {
                run_with_timeout(
                    "open JackTrip desktop",
                    Duration::from_secs(8),
                    launch_jacktrip_desktop,
                )
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let state = this.session_handoff.entry(conversation_id).or_default();
                state.opening = false;
                match result {
                    Ok(info) => {
                        state.last_info = Some(info);
                        state.last_error = None;
                    }
                    Err(err) => {
                        state.last_info = None;
                        state.last_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::chat) fn open_jacktrip_web_handoff(
        &mut self,
        conversation_id: String,
        cx: &mut Context<Self>,
    ) {
        let state = self
            .session_handoff
            .entry(conversation_id.clone())
            .or_default();
        if state.opening {
            return;
        }
        state.opening = true;
        state.last_error = None;
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(|| {
                run_with_timeout("open JackTrip web", Duration::from_secs(8), || {
                    let url = jacktrip_web_url();
                    open::that(&url)
                        .map_err(|e| format!("Failed to open JackTrip web URL: {e}"))?;
                    Ok(format!("Opened JackTrip web: {url}"))
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let state = this.session_handoff.entry(conversation_id).or_default();
                state.opening = false;
                match result {
                    Ok(info) => {
                        state.last_info = Some(info);
                        state.last_error = None;
                    }
                    Err(err) => {
                        state.last_info = None;
                        state.last_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::chat) fn join_jacktrip_invite(
        &mut self,
        conversation_id: String,
        invite: JackTripRoomInvite,
        cx: &mut Context<Self>,
    ) {
        let state = self
            .session_handoff
            .entry(conversation_id.clone())
            .or_default();
        if state.opening {
            return;
        }
        state.opening = true;
        state.last_error = None;
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let join_url = invite.join_url.clone();
            let fallback_msg = format!(
                "Failed opening invite URL ({join_url}); launched JackTrip desktop instead."
            );
            let result = smol::unblock(move || {
                run_with_timeout("join JackTrip invite", Duration::from_secs(12), move || {
                    match open::that(&join_url) {
                        Ok(()) => Ok::<String, String>(format!("Opened invite: {join_url}")),
                        Err(_) => {
                            launch_jacktrip_desktop()?;
                            Ok::<String, String>(fallback_msg)
                        }
                    }
                })
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let state = this.session_handoff.entry(conversation_id).or_default();
                state.opening = false;
                match result {
                    Ok(info) => {
                        state.last_info = Some(info);
                        state.last_error = None;
                    }
                    Err(err) => {
                        state.last_info = None;
                        state.last_error = Some(format!("Failed to join invite: {err}"));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
