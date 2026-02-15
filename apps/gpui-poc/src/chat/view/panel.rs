use super::*;

mod active_chat;
mod empty_state;

impl ChatView {
    pub(super) fn render_chat_panel(&self, c: &Colors, cx: &mut Context<Self>) -> impl IntoElement {
        match &self.active_conversation_id {
            None => self.render_empty_state(c).into_any_element(),
            Some(conv_id) => self
                .render_active_chat(conv_id.clone(), c, cx)
                .into_any_element(),
        }
    }
}
