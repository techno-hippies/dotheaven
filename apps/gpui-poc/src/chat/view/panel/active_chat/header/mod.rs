use super::*;
use crate::ui::overflow_menu::track_row_overflow_menu;
use gpui_component::menu::PopupMenuItem;

mod scarlett_controls;
mod status;

pub(super) fn render_active_chat_header(
    _view: &ChatView,
    conv_id: &str,
    c: &Colors,
    cx: &mut Context<ChatView>,
    is_scarlett: bool,
    voice_supported: bool,
    voice: VoiceSnapshot,
    display_name: String,
    nationality: Option<String>,
    disappearing_message_seconds: u64,
) -> Div {
    let conv_id_for_copy = conv_id.to_string();
    let conv_id_for_timer = conv_id.to_string();
    let chat_view_entity = cx.entity().clone();
    let menu_trigger_id = ElementId::Name(format!("chat-header-menu-{conv_id}").into());
    let menu_hover_group: gpui::SharedString = format!("chat-header-menu-{conv_id}").into();

    div()
        .h_flex()
        .items_center()
        .justify_between()
        .px_4()
        .h(px(60.))
        .border_b_1()
        .border_color(c.border)
        .flex_shrink_0()
        .child(
            div()
                .h_flex()
                .items_center()
                .gap_3()
                .child(render_avatar_with_flag(40.0, nationality.as_deref(), c))
                .child(
                    div()
                        .v_flex()
                        .gap(px(1.))
                        .child(
                            div()
                                .h_flex()
                                .items_center()
                                .gap_2()
                                .child(
                                    div()
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(c.foreground)
                                        .child(display_name),
                                )
                                .when(disappearing_message_seconds > 0, |el| {
                                    el.child(
                                        div()
                                            .text_sm()
                                            .px_2()
                                            .py(px(2.))
                                            .rounded_full()
                                            .border_1()
                                            .border_color(c.border)
                                            .text_color(c.muted_fg)
                                            .child(format!(
                                                "Disappearing: {}",
                                                format_disappearing_label(
                                                    disappearing_message_seconds
                                                )
                                            )),
                                    )
                                }),
                        )
                        .when_some(
                            status::render_chat_status(c, is_scarlett, voice_supported, &voice),
                            |el, status_line| el.child(status_line),
                        ),
                ),
        )
        .when(is_scarlett && voice_supported, |el| {
            el.child(scarlett_controls::render_scarlett_controls(c, cx, voice))
        })
        .when(!is_scarlett, |el| {
            el.child(track_row_overflow_menu(
                menu_trigger_id,
                menu_hover_group,
                true,
                move |mut menu, _window, _cx| {
                    menu = menu.item(PopupMenuItem::new("Copy wallet address").on_click({
                        let chat_view_entity = chat_view_entity.clone();
                        let conv_id_for_copy = conv_id_for_copy.clone();
                        move |_, _, cx| {
                            let _ = chat_view_entity.update(cx, |this, cx| {
                                this.copy_conversation_wallet_address(conv_id_for_copy.clone(), cx);
                            });
                        }
                    }));
                    menu = menu.separator();
                    menu = menu.item(PopupMenuItem::new("Disappearing messages").disabled(true));

                    for &(seconds, label) in CHAT_DISAPPEARING_OPTIONS.iter() {
                        let label = if seconds == disappearing_message_seconds {
                            format!("{label} (current)")
                        } else {
                            label.to_string()
                        };
                        menu = menu.item(
                            PopupMenuItem::new(label)
                                .disabled(seconds == disappearing_message_seconds)
                                .on_click({
                                    let chat_view_entity = chat_view_entity.clone();
                                    let conv_id_for_timer = conv_id_for_timer.clone();
                                    move |_, _, cx| {
                                        let _ = chat_view_entity.update(cx, |this, cx| {
                                            this.set_disappearing_message_seconds(
                                                conv_id_for_timer.clone(),
                                                seconds,
                                                cx,
                                            );
                                        });
                                    }
                                }),
                        );
                    }
                    menu
                },
            ))
        })
}
