use super::*;

impl RoomsView {
    pub(crate) fn copy_active_room_diagnostics(&mut self, cx: &mut Context<Self>) {
        let Some(active) = self.active_host_room.as_ref() else {
            return;
        };
        let room_id = active.room_id.clone();
        let stage = active.stage();
        let broadcaster_online = active.broadcaster_online;
        let default_input_source = active.default_input_source.clone();
        let default_input_is_duet_virtual = active.default_input_is_duet_virtual;
        let diagnostics = format!(
            "Room Diagnostics\nkind={:?}\nroom_id={}\nstage={:?}\nstatus={:?}\nprice_label={}\naudio_source_name={}\naudio_source_label={}\ndefault_input_source={}\ndefault_input_is_duet_virtual={}\nrestore_input_hint={}\nrestore_input_label={}\nbrowser_bridge_opened={}\nbroadcaster_online={}\nbroadcast_state={}\nbroadcast_mode={}\nbroadcast_heartbeat_at={}\naudio_source_error={}\nstart_error={}\njacktrip_error={}\ninfo_message={}",
            active.kind,
            room_id,
            stage,
            active.status,
            active.price_label,
            active.browser_audio_source_name.as_deref().unwrap_or(""),
            active.browser_audio_source_label.as_deref().unwrap_or(""),
            default_input_source.as_deref().unwrap_or(""),
            default_input_is_duet_virtual,
            active.restore_input_source_hint.as_deref().unwrap_or(""),
            active.restore_input_source_label.as_deref().unwrap_or(""),
            active.browser_bridge_opened,
            broadcaster_online,
            active.broadcast_state.as_deref().unwrap_or(""),
            active.broadcast_mode.as_deref().unwrap_or(""),
            active.broadcast_heartbeat_at
                .map(|v| v.to_string())
                .unwrap_or_default(),
            active.audio_source_error.as_deref().unwrap_or(""),
            active.start_error.as_deref().unwrap_or(""),
            active.jacktrip_error.as_deref().unwrap_or(""),
            active.info_message.as_deref().unwrap_or(""),
        );

        cx.write_to_clipboard(ClipboardItem::new_string(diagnostics));
        self.publish_status_success(
            "rooms.host.diagnostics",
            "Diagnostics copied to clipboard.".to_string(),
            cx,
        );
        log::info!(
            "[Rooms] diagnostics copied for room {} (stage={:?}, broadcaster_online={}, default_input={:?}, default_is_duet={})",
            room_id,
            stage,
            broadcaster_online,
            default_input_source,
            default_input_is_duet_virtual
        );
        cx.notify();
    }
}
