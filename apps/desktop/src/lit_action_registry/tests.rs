use super::*;

#[test]
fn test_cid_maps_load_both_networks() {
    let maps = cid_maps();
    assert!(maps.contains_key("naga-dev"), "naga-dev map missing");
    assert!(maps.contains_key("naga-test"), "naga-test map missing");
}

#[test]
fn test_action_cid_known_actions() {
    // These must be present in dev.json
    assert!(action_cid("naga-dev", "playlistV1").is_some());
    assert!(action_cid("naga-dev", "contentRegisterMegaethV1").is_some());
    assert!(action_cid("naga-dev", "contentRegisterV1").is_some());
    assert!(action_cid("naga-dev", "contentAccessV1").is_some());
    assert!(action_cid("naga-dev", "trackCoverV4").is_some());

    // These must be present in test.json
    assert!(action_cid("naga-test", "playlistV1").is_some());
    assert!(action_cid("naga-test", "contentRegisterV1").is_some());
    assert!(action_cid("naga-test", "contentAccessV1").is_some());
    assert!(action_cid("naga-test", "trackCoverV4").is_some());
}

#[test]
fn test_empty_cid_returns_none() {
    // naga-test contentRegisterV2 is "" in test.json
    assert!(action_cid("naga-test", "contentRegisterV2").is_none());
}

#[test]
fn test_unknown_network_returns_none() {
    assert!(action_cid("naga-unknown", "playlistV1").is_none());
}

#[test]
fn test_unknown_action_returns_none() {
    assert!(action_cid("naga-dev", "nonExistentAction").is_none());
}

#[test]
fn test_resolve_action_cid_map_default() {
    // Without any env vars set, should resolve from CID map
    let result = resolve_action("naga-dev", "playlistV1", &[], None);
    let action = result.expect("should resolve playlistV1 from CID map");
    assert!(action.is_ipfs());
    assert!(
        action.source().starts_with("cid-map:"),
        "source should be cid-map:*, got {}",
        action.source()
    );
}

#[test]
fn test_resolve_action_unknown_fails() {
    let result = resolve_action("naga-dev", "totallyFakeAction", &[], None);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("No CID available"));
}

#[test]
fn test_content_register_prefers_megaeth_v1_when_available() {
    let action = resolve_content_register("naga-dev")
        .expect("should resolve content register action on naga-dev");
    assert!(action.is_ipfs());
    let source = action.source();
    assert!(
        source.contains("contentRegisterMegaethV1"),
        "should prefer megaeth-v1 on naga-dev, got {}",
        source
    );
}

#[test]
fn test_content_register_requires_megaeth_v1() {
    let err = resolve_content_register("naga-test")
        .expect_err("should fail when megaeth-v1 is unavailable");
    let lower = err.to_ascii_lowercase();
    assert!(
        lower.contains("contentregistermegaethv1 is required"),
        "unexpected error: {}",
        err
    );
}

#[test]
fn test_cid_parity_with_json_files() {
    // Verify the CIDs we get match the raw JSON parse
    let dev: HashMap<String, String> = serde_json::from_str(DEV_JSON).unwrap();
    let test: HashMap<String, String> = serde_json::from_str(TEST_JSON).unwrap();

    for (action, expected_cid) in &dev {
        if expected_cid.is_empty() {
            assert!(action_cid("naga-dev", action).is_none());
        } else {
            assert_eq!(
                action_cid("naga-dev", action).as_deref(),
                Some(expected_cid.as_str()),
                "CID mismatch for naga-dev:{action}"
            );
        }
    }
    for (action, expected_cid) in &test {
        if expected_cid.is_empty() {
            assert!(action_cid("naga-test", action).is_none());
        } else {
            assert_eq!(
                action_cid("naga-test", action).as_deref(),
                Some(expected_cid.as_str()),
                "CID mismatch for naga-test:{action}"
            );
        }
    }
}
