use super::super::helpers::local_jacktrip_port;
use super::super::*;

impl SettingsView {
    pub(crate) fn jacktrip_start_local_server(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.status = "Starting local JackTrip server...".into();
        self.error = None;
        self.publish_status_progress("settings.jacktrip", self.status.clone(), cx);
        cx.notify();

        let jacktrip = self.jacktrip_test.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut ctrl = jacktrip
                    .lock()
                    .map_err(|e| format!("jacktrip controller lock: {e}"))?;
                ctrl.start_local_server(local_jacktrip_port())
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(msg) => {
                        this.status = msg.clone();
                        this.last_voice_response = Some(msg);
                        this.error = None;
                        this.publish_status_success("settings.jacktrip", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Failed to start local JackTrip server".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.jacktrip",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn jacktrip_stop_local_server(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.status = "Stopping local JackTrip server...".into();
        self.error = None;
        self.publish_status_progress("settings.jacktrip", self.status.clone(), cx);
        cx.notify();

        let jacktrip = self.jacktrip_test.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut ctrl = jacktrip
                    .lock()
                    .map_err(|e| format!("jacktrip controller lock: {e}"))?;
                ctrl.stop_local_server()
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(msg) => {
                        this.status = msg.clone();
                        this.last_voice_response = Some(msg);
                        this.error = None;
                        this.publish_status_success("settings.jacktrip", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Failed to stop local JackTrip server".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.jacktrip",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn jacktrip_connect_local_client(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.status = "Connecting JackTrip client to localhost...".into();
        self.error = None;
        self.publish_status_progress("settings.jacktrip", self.status.clone(), cx);
        cx.notify();

        let jacktrip = self.jacktrip_test.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut ctrl = jacktrip
                    .lock()
                    .map_err(|e| format!("jacktrip controller lock: {e}"))?;
                ctrl.connect("127.0.0.1", local_jacktrip_port())
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(msg) => {
                        this.status = msg.clone();
                        this.last_voice_response = Some(msg);
                        this.error = None;
                        this.publish_status_success("settings.jacktrip", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "JackTrip local connect failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.jacktrip",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn jacktrip_disconnect_client(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.status = "Disconnecting JackTrip client...".into();
        self.error = None;
        self.publish_status_progress("settings.jacktrip", self.status.clone(), cx);
        cx.notify();

        let jacktrip = self.jacktrip_test.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut ctrl = jacktrip
                    .lock()
                    .map_err(|e| format!("jacktrip controller lock: {e}"))?;
                ctrl.disconnect()
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(msg) => {
                        this.status = msg.clone();
                        this.last_voice_response = Some(msg);
                        this.error = None;
                        this.publish_status_success("settings.jacktrip", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "JackTrip disconnect failed".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.jacktrip",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn jacktrip_list_ports(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.status = "Listing JACK ports...".into();
        self.error = None;
        self.publish_status_progress("settings.jacktrip", self.status.clone(), cx);
        cx.notify();

        let jacktrip = self.jacktrip_test.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let ctrl = jacktrip
                    .lock()
                    .map_err(|e| format!("jacktrip controller lock: {e}"))?;
                ctrl.list_ports()
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(ports) => {
                        this.status = format!("Found {} JACK ports", ports.len());
                        this.last_voice_response =
                            Some(serde_json::to_string_pretty(&ports).unwrap_or_default());
                        this.error = None;
                        this.publish_status_success("settings.jacktrip", this.status.clone(), cx);
                    }
                    Err(e) => {
                        this.status = "Failed to list JACK ports".into();
                        this.error = Some(e.clone());
                        this.publish_status_error(
                            "settings.jacktrip",
                            format!("{}: {}", this.status, e),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
