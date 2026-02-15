use std::time::{Duration, Instant};

use super::*;

const BROADCAST_HEALTH_POLL_INTERVAL: Duration = Duration::from_secs(4);

impl RoomsView {
    pub(crate) fn maybe_poll_active_room_broadcast_health(&mut self, cx: &mut Context<Self>) {
        let Some(active) = self.active_host_room.as_ref() else {
            return;
        };
        if active.status != RoomStatus::Live {
            return;
        }
        if self.broadcast_health_poll_in_flight {
            return;
        }

        if let Some(last) = self.last_broadcast_health_poll_at {
            if last.elapsed() < BROADCAST_HEALTH_POLL_INTERVAL {
                return;
            }
        }

        self.broadcast_health_poll_in_flight = true;
        self.last_broadcast_health_poll_at = Some(Instant::now());

        let room_id = active.room_id.clone();
        let room_id_for_update = room_id.clone();
        let endpoints = VoiceEndpoints::default();

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || get_duet_public_info(&endpoints, &room_id)).await;

            let _ = this.update(cx, |this, cx| {
                this.broadcast_health_poll_in_flight = false;

                let Some(active) = this.active_host_room.as_mut() else {
                    return;
                };
                if active.room_id != room_id_for_update {
                    return;
                }

                match result {
                    Ok(info) => {
                        let was_online = active.broadcaster_online;
                        let now_online = info.broadcaster_online.unwrap_or(false);

                        active.broadcaster_online = now_online;
                        active.broadcast_state = info.broadcast_state;
                        active.broadcast_mode = info.broadcast_mode;
                        active.broadcast_heartbeat_at = info.broadcast_heartbeat_at;

                        if now_online && !was_online {
                            active.info_message = Some("Broadcast is live.".to_string());
                        } else if !now_online && was_online {
                            active.info_message = Some(
                                "Broadcast heartbeat lost. Reopen browser bridge if needed."
                                    .to_string(),
                            );
                        }
                    }
                    Err(err) => {
                        log::debug!(
                            "[Rooms] broadcast health poll failed for room {}: {}",
                            short_room_id(&room_id_for_update),
                            truncate_text(&err, 140)
                        );
                    }
                }

                cx.notify();
            });
        })
        .detach();
    }
}
