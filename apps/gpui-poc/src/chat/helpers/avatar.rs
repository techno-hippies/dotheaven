use super::*;

fn nationality_to_flag(code: &str) -> Option<String> {
    let alpha2 = match code {
        "USA" => "US",
        "GBR" => "GB",
        "FRA" => "FR",
        "DEU" => "DE",
        "JPN" => "JP",
        "CHN" => "CN",
        "KOR" => "KR",
        "BRA" => "BR",
        "IND" => "IN",
        "CAN" => "CA",
        "AUS" => "AU",
        "MEX" => "MX",
        "ESP" => "ES",
        "ITA" => "IT",
        "RUS" => "RU",
        "ARG" => "AR",
        "NLD" => "NL",
        "TUR" => "TR",
        "SAU" => "SA",
        "ZAF" => "ZA",
        "SWE" => "SE",
        "NOR" => "NO",
        "DNK" => "DK",
        "FIN" => "FI",
        "POL" => "PL",
        "UKR" => "UA",
        "THA" => "TH",
        "VNM" => "VN",
        "PHL" => "PH",
        "IDN" => "ID",
        "MYS" => "MY",
        "SGP" => "SG",
        "TWN" => "TW",
        "HKG" => "HK",
        "NZL" => "NZ",
        "CHE" => "CH",
        "AUT" => "AT",
        "BEL" => "BE",
        "PRT" => "PT",
        "GRC" => "GR",
        "CZE" => "CZ",
        "ROU" => "RO",
        "HUN" => "HU",
        "ISR" => "IL",
        "ARE" => "AE",
        "EGY" => "EG",
        "NGA" => "NG",
        "COL" => "CO",
        "CHL" => "CL",
        "PER" => "PE",
        "IRN" => "IR",
        "PAK" => "PK",
        "BGD" => "BD",
        "IRL" => "IE",
        _ => return None,
    };
    let flag: String = alpha2
        .chars()
        .map(|c| char::from_u32(0x1F1E6 + (c as u32 - 'A' as u32)).unwrap_or(c))
        .collect();
    Some(flag)
}

pub(crate) fn render_avatar_with_flag(
    size_px: f32,
    nationality: Option<&str>,
    c: &Colors,
) -> impl IntoElement {
    let badge_size = (size_px * 0.4).max(16.0);
    let flag_text = nationality.and_then(nationality_to_flag);
    let bg = c.elevated;
    let icon_color = c.muted_fg;
    let badge_bg = c.background;

    div()
        .relative()
        .size(px(size_px))
        .flex_shrink_0()
        .child(
            div()
                .size(px(size_px))
                .rounded_full()
                .bg(bg)
                .flex()
                .items_center()
                .justify_center()
                .child(
                    gpui::svg()
                        .path("icons/user.svg")
                        .size(px(size_px * 0.45))
                        .text_color(icon_color),
                ),
        )
        .when_some(flag_text, |el: Div, flag| {
            el.child(
                div()
                    .absolute()
                    .bottom(px(-2.))
                    .left(px(-2.))
                    .size(px(badge_size))
                    .rounded_full()
                    .bg(badge_bg)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(div().text_size(px(badge_size * 0.7)).child(flag)),
            )
        })
}
