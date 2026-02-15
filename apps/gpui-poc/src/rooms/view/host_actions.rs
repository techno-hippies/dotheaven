use super::*;

impl RoomsView {
    pub(super) fn render_host_room_actions(
        &self,
        active: &ActiveHostRoom,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let stage = active.stage();

        let primary_base = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .h(px(40.))
                .px_6()
                .rounded_full()
                .bg(theme.primary)
                .border_1()
                .border_color(theme.primary)
                .flex()
                .items_center()
                .justify_center()
                .text_color(theme.primary_foreground)
                .font_weight(FontWeight::SEMIBOLD)
                .child(label)
        };

        let secondary_base = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .h(px(40.))
                .px_6()
                .rounded_full()
                .bg(hsla(0.0, 0.0, 0.15, 0.7))
                .border_1()
                .border_color(theme.border)
                .flex()
                .items_center()
                .justify_center()
                .text_color(theme.foreground)
                .font_weight(FontWeight::MEDIUM)
                .child(label)
        };

        let danger_base = |id: &'static str, label: &'static str| {
            div()
                .id(id)
                .h(px(40.))
                .px_6()
                .rounded_full()
                .bg(hsla(0.02, 0.80, 0.50, 0.20))
                .border_1()
                .border_color(hsla(0.02, 0.80, 0.62, 0.72))
                .flex()
                .items_center()
                .justify_center()
                .text_color(hsla(0.02, 0.95, 0.82, 1.0))
                .font_weight(FontWeight::MEDIUM)
                .child(label)
        };

        let (primary_button, secondary_button) = match stage {
            HostRoomStage::Setup => {
                let can_start = !active.start_pending && !active.end_pending;
                let mut primary = primary_base(
                    "rooms-host-primary-start",
                    if active.start_pending {
                        "Starting..."
                    } else {
                        "Start Room"
                    },
                );
                if can_start {
                    primary = primary
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.start_active_host_room(cx);
                        }));
                } else {
                    primary = primary.opacity(0.6);
                }

                (primary, None)
            }
            HostRoomStage::ReadyAudioRoute => {
                let can_connect = !active.audio_source_setup_pending && !active.end_pending;
                let mut primary = primary_base(
                    "rooms-host-primary-connect-audio",
                    if active.audio_source_setup_pending {
                        "Connecting..."
                    } else {
                        "Connect Audio Source"
                    },
                );
                if can_connect {
                    primary = primary
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.setup_jacktrip_audio_source_for_active_room(cx);
                        }));
                } else {
                    primary = primary.opacity(0.6);
                }

                let can_stop = !active.end_pending;
                let mut secondary = danger_base(
                    "rooms-host-secondary-stop-room",
                    if active.end_pending {
                        "Stopping..."
                    } else {
                        "Stop Room"
                    },
                );
                if can_stop {
                    secondary =
                        secondary
                            .cursor_pointer()
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.end_active_host_room(cx);
                            }));
                } else {
                    secondary = secondary.opacity(0.6);
                }

                (primary, Some(secondary))
            }
            HostRoomStage::ReadyGoLive => {
                let can_go_live = !active.end_pending
                    && !active.open_broadcast_pending
                    && active.bridge_ticket.is_some()
                    && active.has_audio_route_ready();
                let mut primary = primary_base(
                    "rooms-host-primary-go-live",
                    if active.open_broadcast_pending {
                        "Opening..."
                    } else if active.browser_bridge_opened {
                        "Reopen Broadcast"
                    } else {
                        "Go Live"
                    },
                );
                if can_go_live {
                    primary = primary
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.open_broadcast_for_active_room(cx);
                        }));
                } else {
                    primary = primary.opacity(0.6);
                }

                let can_stop = !active.end_pending;
                let mut secondary = danger_base(
                    "rooms-host-secondary-stop-room",
                    if active.end_pending {
                        "Stopping..."
                    } else {
                        "Stop Room"
                    },
                );
                if can_stop {
                    secondary =
                        secondary
                            .cursor_pointer()
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.end_active_host_room(cx);
                            }));
                } else {
                    secondary = secondary.opacity(0.6);
                }

                (primary, Some(secondary))
            }
            HostRoomStage::OnAir => {
                let can_share = !active.end_pending;
                let mut primary = primary_base("rooms-host-primary-share-link", "Share Link");
                if can_share {
                    primary = primary
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.share_active_room_link(cx);
                        }));
                } else {
                    primary = primary.opacity(0.6);
                }

                let can_stop = !active.end_pending;
                let mut secondary = danger_base(
                    "rooms-host-secondary-stop-live",
                    if active.end_pending {
                        "Stopping..."
                    } else {
                        "Stop Live"
                    },
                );
                if can_stop {
                    secondary =
                        secondary
                            .cursor_pointer()
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.end_active_host_room(cx);
                            }));
                } else {
                    secondary = secondary.opacity(0.6);
                }

                (primary, Some(secondary))
            }
            HostRoomStage::Ended => {
                let primary = primary_base("rooms-host-primary-back", "Back to Rooms")
                    .cursor_pointer()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.close_host_room_view(cx);
                    }));

                let secondary = secondary_base("rooms-host-secondary-share", "Share Link")
                    .cursor_pointer()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.share_active_room_link(cx);
                    }));

                (primary, Some(secondary))
            }
        };

        let mut row = div().h_flex().items_center().justify_center().gap_3();
        row = row.child(primary_button);
        if let Some(secondary) = secondary_button {
            row = row.child(secondary);
        }
        row
    }
}
