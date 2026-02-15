use super::super::*;
use super::common::{render_modal_input, section_label, selectable_chip};

pub(in crate::rooms::view::modal_duet_setup) fn render_duet_setup_header(
    view: &RoomsView,
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> Div {
    let title = match view.selected_type {
        RoomType::DjSet => "Solo Setup",
        _ => "Duet Setup",
    };

    div()
        .h_flex()
        .items_center()
        .justify_between()
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_3()
                .child(
                    div()
                        .id("rooms-duet-back")
                        .size(px(30.))
                        .rounded_full()
                        .bg(theme.muted)
                        .cursor_pointer()
                        .flex()
                        .items_center()
                        .justify_center()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.create_step = CreateStep::ChooseType;
                            this.modal_error = None;
                            cx.notify();
                        }))
                        .child(
                            gpui::svg()
                                .path("icons/arrow-left.svg")
                                .size(px(14.))
                                .text_color(theme.foreground),
                        ),
                )
                .child(
                    div()
                        .text_3xl()
                        .font_weight(FontWeight::BOLD)
                        .text_color(theme.foreground)
                        .child(title),
                ),
        )
        .child(
            div()
                .id("rooms-modal-close")
                .size(px(34.))
                .rounded_full()
                .bg(theme.muted)
                .cursor_pointer()
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(|this, _, _, cx| this.close_create_modal(cx)))
                .child(
                    gpui::svg()
                        .path("icons/x.svg")
                        .size(px(14.))
                        .text_color(theme.foreground),
                ),
        )
}

pub(in crate::rooms::view::modal_duet_setup) fn render_partner_section(
    view: &RoomsView,
    theme: &Theme,
    cx: &mut Context<RoomsView>,
) -> Div {
    let (section_title, open_label, invite_label, invite_prompt) = match view.selected_type {
        RoomType::DjSet => ("Partner", "Open", "Invite", "Invite guest"),
        _ => ("Partner", "Open", "Invite", "Invite guest"),
    };

    let invite_specific = view.partner_mode == PartnerMode::InviteSpecific;
    let open_to_anyone = view.partner_mode == PartnerMode::OpenToAnyone;

    div()
        .v_flex()
        .gap_3()
        .child(section_label(section_title, theme))
        .child(
            div()
                .h_flex()
                .gap_2()
                .child(
                    selectable_chip(open_label, open_to_anyone, theme)
                        .id("rooms-partner-open")
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.partner_mode = PartnerMode::OpenToAnyone;
                            cx.notify();
                        })),
                )
                .child(
                    selectable_chip(invite_label, invite_specific, theme)
                        .id("rooms-partner-invite")
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.partner_mode = PartnerMode::InviteSpecific;
                            cx.notify();
                        })),
                ),
        )
        .when(invite_specific, |el| {
            el.child(
                div()
                    .v_flex()
                    .gap_1()
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.muted_foreground)
                            .child(invite_prompt),
                    )
                    .child(render_modal_input(
                        &view.guest_wallet_input_state,
                        theme,
                        None,
                    )),
            )
        })
}
