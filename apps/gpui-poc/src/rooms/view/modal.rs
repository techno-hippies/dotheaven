use super::*;

impl RoomsView {
    pub(super) fn render_create_modal(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let modal_width = match self.create_step {
            CreateStep::ChooseType => px(620.),
            CreateStep::DuetSetup => px(560.),
        };

        div()
            .absolute()
            .top_0()
            .left_0()
            .right_0()
            .bottom_0()
            .bg(hsla(0., 0., 0., 0.65))
            .flex()
            .items_start()
            .justify_center()
            .py_6()
            .child(
                div()
                    .w(modal_width)
                    .max_h(px(700.))
                    .mx_5()
                    .rounded(px(14.))
                    .bg(theme.sidebar)
                    .border_1()
                    .border_color(theme.border)
                    .v_flex()
                    .overflow_hidden()
                    .p_5()
                    .child(match self.create_step {
                        CreateStep::ChooseType => self
                            .render_choose_room_type_modal(theme, cx)
                            .into_any_element(),
                        CreateStep::DuetSetup => {
                            self.render_duet_setup_modal(theme, cx).into_any_element()
                        }
                    }),
            )
    }

    fn render_choose_room_type_modal(
        &self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let can_continue = self.selected_type.is_available();

        div()
            .v_flex()
            .gap_4()
            .child(
                div()
                    .h_flex()
                    .items_start()
                    .justify_between()
                    .child(
                        div()
                            .v_flex()
                            .gap_1()
                            .child(
                                div()
                                    .text_3xl()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(theme.foreground)
                                    .child("Create Room"),
                            )
                            .child(
                                div()
                                    .text_color(theme.muted_foreground)
                                    .child("Choose a room type to get started"),
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
                    ),
            )
            .child(
                div()
                    .v_flex()
                    .gap_3()
                    .child(
                        div()
                            .h_flex()
                            .gap_3()
                            .child(self.render_room_type_card(RoomType::DjSet, theme, cx))
                            .child(self.render_room_type_card(RoomType::Duet, theme, cx)),
                    )
                    .child(
                        div()
                            .h_flex()
                            .gap_3()
                            .child(self.render_room_type_card(RoomType::Class, theme, cx))
                            .child(self.render_room_type_card(RoomType::OpenJam, theme, cx)),
                    ),
            )
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
            .child({
                let mut next = div()
                    .id("rooms-create-next-btn")
                    .h(px(46.))
                    .rounded_full()
                    .bg(theme.primary)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.primary_foreground)
                            .child("Next"),
                    );

                if can_continue {
                    next = next
                        .cursor_pointer()
                        .hover({
                            let hover = theme.primary_hover;
                            move |s| s.bg(hover)
                        })
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.modal_error = None;
                            this.create_step = CreateStep::DuetSetup;
                            cx.notify();
                        }));
                } else {
                    next = next.opacity(0.5);
                }

                next
            })
    }

    fn render_room_type_card(
        &self,
        room_type: RoomType,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let selected = self.selected_type == room_type;
        let available = room_type.is_available();

        let mut card = div()
            .id(SharedString::from(format!(
                "rooms-type-{}",
                room_type.label().replace(' ', "-").to_lowercase()
            )))
            .v_flex()
            .flex_1()
            .min_w_0()
            .h(px(156.))
            .p_4()
            .rounded(px(10.))
            .border_1()
            .border_color(if selected {
                theme.primary
            } else {
                theme.border
            })
            .bg(if selected {
                hsla(0.73, 0.50, 0.16, 1.0)
            } else {
                theme.background
            })
            .gap_2()
            .child(
                gpui::svg()
                    .path(room_type.icon_path())
                    .size(px(20.))
                    .text_color(if available {
                        if selected {
                            theme.primary
                        } else {
                            theme.foreground
                        }
                    } else {
                        theme.muted_foreground
                    }),
            )
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(if available {
                        theme.foreground
                    } else {
                        theme.muted_foreground
                    })
                    .child(room_type.label()),
            )
            .child(
                div()
                    .text_xs()
                    .w_full()
                    .text_color(theme.muted_foreground)
                    .child(room_type.subtitle()),
            );

        if !available {
            card = card.opacity(0.7).child(
                div()
                    .pt_1()
                    .text_sm()
                    .text_color(hsla(0.08, 0.80, 0.70, 1.0))
                    .child("Coming soon"),
            );
        } else {
            card = card
                .cursor_pointer()
                .hover(|s| s.border_color(hsla(0.73, 0.74, 0.80, 1.0)))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.selected_type = room_type;
                    this.modal_error = None;
                    cx.notify();
                }));
        }

        card
    }
}
