use super::*;

impl ChatView {
    pub(in crate::chat) fn session_handoff_state(
        &self,
        conversation_id: &str,
    ) -> SessionHandoffState {
        self.session_handoff
            .get(conversation_id)
            .cloned()
            .unwrap_or_default()
    }
}
