use super::*;

impl RoomsView {
    pub(super) fn render_host_room_panel(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some(active) = self.active_host_room.as_ref() else {
            return div().into_any_element();
        };

        let stage = active.stage();
        let (badge_text, badge_bg, badge_fg) = stage_badge_style(stage);
        let stage_hint = stage_hint_text(stage, active);
        let error_message = active_error_text(active);

        div()
            .v_flex()
            .flex_1()
            .h_full()
            .child(
                div()
                    .w_full()
                    .h(px(72.))
                    .px_6()
                    .h_flex()
                    .items_center()
                    .justify_between()
                    .gap_4()
                    .border_b_1()
                    .border_color(theme.border)
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_3()
                            .child(
                                div()
                                    .id("rooms-host-back")
                                    .size(px(36.))
                                    .rounded(px(8.))
                                    .cursor_pointer()
                                    .hover(|s| s.bg(hsla(0.0, 0.0, 0.14, 1.0)))
                                    .h_flex()
                                    .items_center()
                                    .justify_center()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.close_host_room_view(cx);
                                    }))
                                    .child(
                                        gpui::svg()
                                            .path("icons/arrow-left.svg")
                                            .size(px(20.))
                                            .text_color(theme.foreground),
                                    ),
                            )
                            .child(
                                div()
                                    .text_lg()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(theme.foreground)
                                    .child(active.title.clone()),
                            ),
                    )
                    .child(
                        div()
                            .h_flex()
                            .items_center()
                            .gap_2()
                            .px_3()
                            .py(px(4.))
                            .rounded_full()
                            .bg(badge_bg)
                            .child(div().size(px(6.)).rounded_full().bg(badge_fg))
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(badge_fg)
                                    .child(badge_text),
                            ),
                    ),
            )
            .child(
                div()
                    .v_flex()
                    .flex_1()
                    .px_6()
                    .py_6()
                    .items_center()
                    .justify_center()
                    .gap_6()
                    .child(render_performers(active, stage, theme))
                    .when_some(stage_hint.map(str::to_string), |el, hint| {
                        el.child(
                            div()
                                .text_sm()
                                .text_color(theme.muted_foreground)
                                .child(hint),
                        )
                    })
                    .child(self.render_host_room_actions(active, theme, cx))
                    .when_some(error_message, |el, msg| {
                        el.child(
                            div()
                                .px_3()
                                .py_2()
                                .rounded(px(8.))
                                .bg(hsla(0.0, 0.52, 0.22, 0.35))
                                .text_sm()
                                .text_color(hsla(0.0, 0.90, 0.74, 1.0))
                                .child(truncate_text(&msg, 220)),
                        )
                    })
                    .child(render_host_room_utility_actions(
                        active,
                        theme,
                        self.segment_start_pending,
                        cx,
                    ))
                    .when(active.default_input_is_duet_virtual, |el| {
                        el.child(
                            div()
                                .px_3()
                                .py_2()
                                .rounded(px(8.))
                                .bg(hsla(0.09, 0.48, 0.22, 0.35))
                                .border_1()
                                .border_color(hsla(0.09, 0.62, 0.48, 0.55))
                                .text_sm()
                                .text_color(hsla(0.10, 0.88, 0.80, 1.0))
                                .child(format!(
                                    "System default mic currently points to JackTrip virtual source{}.",
                                    active
                                        .default_input_source
                                        .as_deref()
                                        .map(|v| format!(" ({})", truncate_text(v, 40)))
                                        .unwrap_or_default()
                                )),
                        )
                    }),
            )
            .into_any_element()
    }
}

fn stage_badge_style(stage: HostRoomStage) -> (&'static str, Hsla, Hsla) {
    match stage {
        HostRoomStage::Setup => (
            "Setup",
            hsla(0.0, 0.0, 0.20, 1.0),
            hsla(0.0, 0.0, 0.78, 1.0),
        ),
        HostRoomStage::ReadyAudioRoute | HostRoomStage::ReadyGoLive => (
            "Ready",
            hsla(0.40, 0.64, 0.22, 1.0),
            hsla(0.40, 0.86, 0.70, 1.0),
        ),
        HostRoomStage::OnAir => (
            "Live",
            hsla(0.40, 0.70, 0.20, 1.0),
            hsla(0.40, 0.90, 0.74, 1.0),
        ),
        HostRoomStage::Ended => (
            "Ended",
            hsla(0.0, 0.0, 0.20, 1.0),
            hsla(0.0, 0.0, 0.70, 1.0),
        ),
    }
}

fn stage_hint_text(stage: HostRoomStage, active: &ActiveHostRoom) -> Option<&'static str> {
    match stage {
        HostRoomStage::Setup => None,
        HostRoomStage::ReadyAudioRoute => match active.kind {
            RoomKind::Duet => Some("Connect JackTrip audio source before going live."),
            RoomKind::DjSet => Some("Ready to broadcast. Open the broadcast page to choose audio."),
            _ => Some("Connect audio source before going live."),
        },
        HostRoomStage::ReadyGoLive => {
            if active.browser_bridge_opened {
                Some("Broadcast page opened. Click Go Live on that page when ready.")
            } else {
                match active.kind {
                    RoomKind::DjSet => Some(
                        "Press Go Live to open the broadcast page. Use Start App Audio Share to capture app/system audio.",
                    ),
                    _ => Some("Audio source connected. Press Go Live to open the broadcast page."),
                }
            }
        }
        HostRoomStage::OnAir => None,
        HostRoomStage::Ended => Some("Room ended."),
    }
}

fn active_error_text(active: &ActiveHostRoom) -> Option<String> {
    active
        .start_error
        .clone()
        .or(active.audio_source_error.clone())
        .or(active.jacktrip_error.clone())
}

fn render_host_room_utility_actions(
    active: &ActiveHostRoom,
    theme: &Theme,
    segment_start_pending: bool,
    cx: &mut Context<RoomsView>,
) -> Div {
    let utility_button = |id: &'static str| {
        div()
            .id(id)
            .h(px(34.))
            .px_4()
            .rounded_full()
            .bg(hsla(0.0, 0.0, 0.15, 0.7))
            .border_1()
            .border_color(theme.border)
            .text_sm()
            .text_color(theme.muted_foreground)
            .font_weight(FontWeight::MEDIUM)
            .h_flex()
            .items_center()
            .justify_center()
    };

    let mut row = div().h_flex().items_center().justify_center().gap_2();

    if active.status == RoomStatus::Live {
        let mut seg_btn =
            utility_button("rooms-host-utility-new-segment").child(if segment_start_pending {
                "Starting..."
            } else {
                "New Segment"
            });
        if !segment_start_pending {
            seg_btn = seg_btn
                .cursor_pointer()
                .on_click(cx.listener(|this, _, window, cx| {
                    this.open_segment_modal(window, cx);
                }));
        } else {
            seg_btn = seg_btn.opacity(0.7);
        }
        row = row.child(seg_btn);
    }

    if active.default_input_is_duet_virtual {
        let mut restore_btn = utility_button("rooms-host-utility-restore-system-mic").child(
            if active.restore_system_mic_pending {
                "Restoring..."
            } else {
                "Restore System Mic"
            },
        );
        if !active.restore_system_mic_pending {
            restore_btn = restore_btn
                .cursor_pointer()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.restore_system_mic_for_active_room(cx);
                }));
        } else {
            restore_btn = restore_btn.opacity(0.6);
        }
        row = row.child(restore_btn);
    }

    let copy_diag_btn = utility_button("rooms-host-utility-copy-diag")
        .cursor_pointer()
        .on_click(cx.listener(|this, _, _, cx| {
            this.copy_active_room_diagnostics(cx);
        }))
        .child("Copy Diagnostics");

    row.child(copy_diag_btn)
}

fn render_performers(active: &ActiveHostRoom, stage: HostRoomStage, theme: &Theme) -> Div {
    let ended = matches!(stage, HostRoomStage::Ended);

    if active.kind == RoomKind::DjSet {
        return div()
            .h_flex()
            .items_end()
            .gap_10()
            .child(render_performer(
                &active.host_a,
                "Host",
                hsla(0.60, 0.92, 0.74, 1.0),
                ended,
                theme,
            ));
    }

    div()
        .h_flex()
        .items_end()
        .gap_10()
        .child(render_performer(
            &active.host_a,
            "Host",
            hsla(0.60, 0.92, 0.74, 1.0),
            ended,
            theme,
        ))
        .child(
            div()
                .pb(px(44.))
                .text_xl()
                .text_color(theme.muted_foreground)
                .child("&"),
        )
        .child(render_performer(
            &active.host_b,
            "Guest",
            hsla(0.76, 0.90, 0.78, 1.0),
            ended,
            theme,
        ))
}

fn render_performer(name: &str, role: &str, accent: Hsla, ended: bool, theme: &Theme) -> Div {
    let ring = if ended {
        hsla(0.0, 0.0, 0.28, 1.0)
    } else {
        accent
    };

    div()
        .v_flex()
        .items_center()
        .gap_2()
        .child(
            div()
                .size(px(84.))
                .rounded_full()
                .border_2()
                .border_color(ring)
                .bg(hsla(0.0, 0.0, 0.18, 1.0)),
        )
        .child(
            div()
                .text_lg()
                .font_weight(FontWeight::MEDIUM)
                .text_color(theme.foreground)
                .child(name.to_string()),
        )
        .child(
            div()
                .text_sm()
                .text_color(if ended {
                    theme.muted_foreground
                } else {
                    accent
                })
                .child(role.to_string()),
        )
}
