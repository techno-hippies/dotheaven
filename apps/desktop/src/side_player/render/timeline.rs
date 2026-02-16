use super::*;

pub(super) fn render_seek_timeline(
    this: &mut SidePlayerView,
    cx: &mut Context<SidePlayerView>,
    position: f64,
    duration: f64,
) -> impl IntoElement {
    div()
        .v_flex()
        .gap_1()
        .child(
            div()
                .h_flex()
                .justify_between()
                .child(
                    div()
                        .text_xs()
                        .text_color(hsla(0., 0., 0.64, 1.))
                        .child(format_time(position)),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(hsla(0., 0., 0.64, 1.))
                        .child(format_time(duration)),
                ),
        )
        .child(
            div()
                .id("side-player-seek")
                .w_full()
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _ev, _window, cx| {
                        this.seek_scrub_in_progress = true;
                        cx.notify();
                    }),
                )
                .capture_any_mouse_up(cx.listener(|this, _ev, _window, cx| {
                    if !this.seek_scrub_in_progress {
                        return;
                    }
                    this.seek_scrub_in_progress = false;
                    let fraction = this
                        .seek_scrub_fraction
                        .take()
                        .unwrap_or_else(|| this.seek_slider.read(cx).value().end().clamp(0.0, 1.0));
                    if this.last_playback_duration > 0.0 {
                        let seek_to = (this.last_playback_duration * fraction as f64)
                            .clamp(0.0, this.last_playback_duration);
                        this.pending_seek_position = Some(seek_to);
                        this.pending_seek_started_at = Some(std::time::Instant::now());
                        this.audio.seek(seek_to, this.last_playback_playing);
                    }
                    cx.notify();
                }))
                .child(
                    Slider::new(&this.seek_slider)
                        .horizontal()
                        .disabled(duration <= 0.0)
                        .bg(hsla(0., 0., 0.98, 1.))
                        .text_color(hsla(0., 0., 0.98, 1.)),
                ),
        )
}

fn format_time(secs: f64) -> String {
    let s = secs as u64;
    format!("{}:{:02}", s / 60, s % 60)
}
