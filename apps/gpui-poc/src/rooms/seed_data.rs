use super::*;

pub(super) fn seed_room_cards() -> Vec<RoomCard> {
    vec![
        RoomCard {
            title: "Jazz Standards Night".to_string(),
            status: RoomStatus::Live,
            kind: RoomKind::Duet,
            host_a: "alice.heaven".to_string(),
            host_b: "bob.heaven".to_string(),
            meta_line: "12 watching".to_string(),
            price_label: "$0.10 USDC".to_string(),
            mine: false,
        },
        RoomCard {
            title: "Guitar Duet Improv".to_string(),
            status: RoomStatus::Live,
            kind: RoomKind::Duet,
            host_a: "dana.heaven".to_string(),
            host_b: "eve.heaven".to_string(),
            meta_line: "5 watching".to_string(),
            price_label: "$0.25 USDC".to_string(),
            mine: false,
        },
        RoomCard {
            title: "Blues Jam Session".to_string(),
            status: RoomStatus::Scheduled,
            kind: RoomKind::OpenJam,
            host_a: "charlie.heaven".to_string(),
            host_b: "open slot".to_string(),
            meta_line: "Tomorrow 8pm".to_string(),
            price_label: "Free".to_string(),
            mine: true,
        },
        RoomCard {
            title: "Classical Piano Duet".to_string(),
            status: RoomStatus::Ended,
            kind: RoomKind::Duet,
            host_a: "frank.heaven".to_string(),
            host_b: "grace.heaven".to_string(),
            meta_line: "Replay available".to_string(),
            price_label: "$0.10 replay".to_string(),
            mine: false,
        },
    ]
}

pub(super) fn seed_activity_items() -> Vec<ActivityItem> {
    vec![
        ActivityItem {
            color: hsla(0.76, 0.83, 0.72, 1.0),
            text: "alice started Jazz Standards Night".to_string(),
        },
        ActivityItem {
            color: hsla(0.60, 0.80, 0.72, 1.0),
            text: "bob joined as guest".to_string(),
        },
        ActivityItem {
            color: hsla(0.07, 0.90, 0.78, 1.0),
            text: "3 viewers entered Jazz Standards".to_string(),
        },
        ActivityItem {
            color: hsla(0.40, 0.78, 0.70, 1.0),
            text: "charlie scheduled Blues Jam".to_string(),
        },
    ]
}
