use super::*;

pub(super) fn render_chat_status(
    c: &Colors,
    is_scarlett: bool,
    voice_supported: bool,
    voice: &VoiceSnapshot,
) -> Option<Div> {
    if is_scarlett && voice_supported {
        let status = match voice.state {
            VoiceState::Idle => "Idle".to_string(),
            VoiceState::Connecting => "Connecting...".to_string(),
            VoiceState::Connected => {
                if voice.bot_speaking {
                    format!("Speaking • {}", format_duration(voice.duration_seconds))
                } else {
                    format!("In call {}", format_duration(voice.duration_seconds))
                }
            }
            VoiceState::Error => "Call error".to_string(),
        };
        let status_color = if voice.state == VoiceState::Error {
            hsla(0., 0.7, 0.6, 1.)
        } else {
            c.muted_fg
        };
        return Some(div().text_color(status_color).child(status));
    }

    None
}
