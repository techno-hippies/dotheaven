use super::*;

mod sections;
use sections::{
    render_create_button, render_duet_setup_header, render_partner_section, render_pricing_section,
    render_visibility_audience_section,
};

impl RoomsView {
    pub(super) fn render_duet_setup_modal(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        div()
            .v_flex()
            .gap_4()
            .child(render_duet_setup_header(self, theme, cx))
            .when(self.selected_type == RoomType::DjSet, |el| {
                el.child(div().text_sm().text_color(theme.muted_foreground).child(
                    "Solo room. Use the broadcast page to share app/system audio (or use mic).",
                ))
            })
            .when(self.selected_type == RoomType::Duet, |el| {
                el.child(div().text_sm().text_color(theme.muted_foreground).child(
                    "Payout: for now, ticket revenue routes to your wallet (splits coming later).",
                ))
            })
            .when(self.selected_type == RoomType::Duet, |el| {
                el.child(render_partner_section(self, theme, cx))
            })
            .child(div().border_t_1().border_color(theme.border))
            .child(render_visibility_audience_section(self, theme, cx))
            .when(self.audience_mode == AudienceMode::Ticketed, |el| {
                el.child(div().border_t_1().border_color(theme.border))
                    .child(render_pricing_section(self, theme))
            })
            .when_some(self.modal_error.clone(), |el, error| {
                el.child(
                    div()
                        .px_3()
                        .py_2()
                        .rounded(px(8.))
                        .bg(hsla(0.0, 0.52, 0.22, 0.35))
                        .text_sm()
                        .text_color(hsla(0.0, 0.90, 0.74, 1.0))
                        .child(error),
                )
            })
            .child(render_create_button(self, theme, cx))
    }
}
