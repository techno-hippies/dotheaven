use super::*;

impl RoomsView {
    pub(crate) fn launch_jacktrip_for_active_room(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.launch_pending {
            return;
        }

        let room_id = host.room_id.clone();
        if let Some(active) = self.active_host_room.as_mut() {
            active.launch_pending = true;
            active.info_message = Some("Launching JackTrip...".to_string());
            active.jacktrip_error = None;
        }
        self.publish_status_progress("rooms.host.jacktrip", "Launching JackTrip...", cx);
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let launch_result = smol::unblock(launch_jacktrip_desktop).await;

            let _ = this.update(cx, |this, cx| {
                let mut jacktrip_status: Option<(bool, String)> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id {
                        return;
                    }

                    active.launch_pending = false;
                    match launch_result {
                        Ok(msg) => {
                            active.info_message = Some(msg);
                            active.jacktrip_error = None;
                            jacktrip_status =
                                Some((true, "JackTrip launch requested.".to_string()));
                        }
                        Err(err) => {
                            active.info_message = Some("JackTrip launch failed.".to_string());
                            active.jacktrip_error = Some(err.clone());
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: format!(
                                        "JackTrip launch failed: {}",
                                        truncate_text(&err, 96)
                                    ),
                                },
                            );
                            this.activity.truncate(8);
                            jacktrip_status = Some((
                                false,
                                format!("JackTrip launch failed: {}", truncate_text(&err, 120)),
                            ));
                        }
                    }
                }
                if let Some((ok, message)) = jacktrip_status {
                    if ok {
                        this.publish_status_success("rooms.host.jacktrip", message, cx);
                    } else {
                        this.publish_status_error("rooms.host.jacktrip", message, cx);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn open_viewer_for_active_room(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.open_viewer_pending {
            return;
        }

        let room_id = host.room_id.clone();
        let room_id_for_update = room_id.clone();
        let viewer_url = duet_watch_url(&room_id);
        if let Some(active) = self.active_host_room.as_mut() {
            active.open_viewer_pending = true;
            active.info_message = Some("Opening viewer link...".to_string());
        }
        self.publish_status_progress("rooms.host.viewer", "Opening viewer link...", cx);
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || open::that(&viewer_url)).await;

            let _ = this.update(cx, |this, cx| {
                let mut viewer_status: Option<(bool, String)> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id_for_update {
                        return;
                    }
                    active.open_viewer_pending = false;
                    match result {
                        Ok(_) => {
                            active.info_message =
                                Some("Opened viewer link in browser.".to_string());
                            viewer_status = Some((true, "Viewer opened in browser.".to_string()));
                        }
                        Err(err) => {
                            let msg = format!("Failed to open viewer link: {err}");
                            active.info_message = Some(msg.clone());
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: truncate_text(&msg, 96),
                                },
                            );
                            this.activity.truncate(8);
                            viewer_status = Some((false, truncate_text(&msg, 140)));
                        }
                    }
                }
                if let Some((ok, message)) = viewer_status {
                    if ok {
                        this.publish_status_success("rooms.host.viewer", message, cx);
                    } else {
                        this.publish_status_error("rooms.host.viewer", message, cx);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn open_broadcast_for_active_room(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };
        if host.open_broadcast_pending {
            return;
        }
        if host.status != RoomStatus::Live {
            if let Some(active) = self.active_host_room.as_mut() {
                active.info_message = Some("Start room before going live.".to_string());
            }
            cx.notify();
            return;
        }

        let Some(bridge_ticket) = host.bridge_ticket.clone() else {
            if let Some(active) = self.active_host_room.as_mut() {
                active.info_message = Some(
                    "Missing bridge ticket. Start room again to refresh host credentials."
                        .to_string(),
                );
            }
            cx.notify();
            return;
        };

        let room_id = host.room_id.clone();
        let room_id_for_update = room_id.clone();
        let broadcast_url = duet_broadcast_url(&room_id, &bridge_ticket);
        if let Some(active) = self.active_host_room.as_mut() {
            active.open_broadcast_pending = true;
            active.info_message = Some("Opening browser broadcast...".to_string());
        }
        self.publish_status_progress("rooms.host.broadcast", "Opening browser broadcast...", cx);
        cx.notify();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || open::that(&broadcast_url)).await;

            let _ = this.update(cx, |this, cx| {
                let mut broadcast_status: Option<(bool, String)> = None;
                if let Some(active) = this.active_host_room.as_mut() {
                    if active.room_id != room_id_for_update {
                        return;
                    }
                    active.open_broadcast_pending = false;
                    match result {
                        Ok(_) => {
                            active.browser_bridge_opened = true;
                            active.info_message = Some("Browser bridge opened.".to_string());
                            broadcast_status =
                                Some((true, "Browser broadcast page opened.".to_string()));
                        }
                        Err(err) => {
                            let msg = format!("Failed to open host broadcast link: {err}");
                            active.info_message = Some(msg.clone());
                            this.activity.insert(
                                0,
                                ActivityItem {
                                    color: hsla(0.08, 0.80, 0.70, 1.0),
                                    text: truncate_text(&msg, 96),
                                },
                            );
                            this.activity.truncate(8);
                            broadcast_status = Some((false, truncate_text(&msg, 140)));
                        }
                    }
                }
                if let Some((ok, message)) = broadcast_status {
                    if ok {
                        this.publish_status_success("rooms.host.broadcast", message, cx);
                    } else {
                        this.publish_status_error("rooms.host.broadcast", message, cx);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn share_active_room_link(&mut self, cx: &mut Context<Self>) {
        let Some(host) = self.active_host_room.as_ref() else {
            return;
        };

        let viewer_url = duet_watch_url(&host.room_id);
        cx.write_to_clipboard(ClipboardItem::new_string(viewer_url));
        if let Some(active) = self.active_host_room.as_mut() {
            active.info_message = Some("Share link copied.".to_string());
        }
        self.publish_status_success(
            "rooms.host.share",
            "Share link copied to clipboard.".to_string(),
            cx,
        );
        cx.notify();
    }
}
