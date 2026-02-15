use super::*;

pub(in crate::library) fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
}

fn uploaded_records_path() -> PathBuf {
    app_data_dir().join("uploaded_tracks.json")
}

fn shared_grants_path() -> PathBuf {
    app_data_dir().join("shared_grants.json")
}

pub(in crate::library) fn load_uploaded_track_records_for_owner(
    owner: &str,
) -> Vec<UploadedTrackRecord> {
    let path = uploaded_records_path();
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(records) = serde_json::from_str::<Vec<UploadedTrackRecord>>(&text) else {
        return Vec::new();
    };
    let owner_lc = owner.to_lowercase();
    records
        .into_iter()
        .filter(|r| r.owner_address.to_lowercase() == owner_lc)
        .collect()
}

pub(in crate::library) fn upsert_uploaded_track_record(
    record: UploadedTrackRecord,
) -> Result<(), String> {
    let path = uploaded_records_path();
    let mut all = if let Ok(text) = fs::read_to_string(&path) {
        serde_json::from_str::<Vec<UploadedTrackRecord>>(&text).unwrap_or_default()
    } else {
        Vec::new()
    };

    all.retain(|r| !(r.owner_address == record.owner_address && r.file_path == record.file_path));
    all.push(record);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating app data dir ({}): {e}", parent.display()))?;
    }
    let encoded = serde_json::to_string_pretty(&all)
        .map_err(|e| format!("Failed encoding uploaded track records: {e}"))?;
    fs::write(&path, encoded).map_err(|e| {
        format!(
            "Failed writing uploaded track records ({}): {e}",
            path.display()
        )
    })
}

pub(in crate::library) fn load_shared_grant_records_for_grantee(
    grantee: &str,
) -> Vec<SharedGrantRecord> {
    let path = shared_grants_path();
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(mut records) = serde_json::from_str::<Vec<SharedGrantRecord>>(&text) else {
        return Vec::new();
    };
    let grantee_lc = grantee.to_lowercase();
    records.retain(|r| r.grantee_address.to_lowercase() == grantee_lc);
    records.sort_by(|a, b| b.shared_at_ms.cmp(&a.shared_at_ms));
    records
}

pub(in crate::library) fn append_shared_grant_record(
    record: SharedGrantRecord,
) -> Result<(), String> {
    let path = shared_grants_path();
    let mut all = if let Ok(text) = fs::read_to_string(&path) {
        serde_json::from_str::<Vec<SharedGrantRecord>>(&text).unwrap_or_default()
    } else {
        Vec::new()
    };
    // De-dupe by (grantee, contentId) so re-sharing doesn't spam the list.
    all.retain(|existing| {
        !(existing
            .grantee_address
            .eq_ignore_ascii_case(record.grantee_address.as_str())
            && existing
                .content_id
                .eq_ignore_ascii_case(record.content_id.as_str()))
    });
    all.push(record);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating app data dir ({}): {e}", parent.display()))?;
    }
    let encoded = serde_json::to_string_pretty(&all)
        .map_err(|e| format!("Failed encoding shared grant records: {e}"))?;
    fs::write(&path, encoded).map_err(|e| {
        format!(
            "Failed writing shared grant records ({}): {e}",
            path.display()
        )
    })
}

pub(in crate::library) fn upsert_shared_grant_records_for_grantee(
    grantee: &str,
    records: &[SharedGrantRecord],
) -> Result<(), String> {
    let path = shared_grants_path();
    let mut all = if let Ok(text) = fs::read_to_string(&path) {
        serde_json::from_str::<Vec<SharedGrantRecord>>(&text).unwrap_or_default()
    } else {
        Vec::new()
    };

    let grantee_lc = grantee.to_lowercase();
    all.retain(|r| r.grantee_address.to_lowercase() != grantee_lc);
    all.extend(records.iter().cloned());

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating app data dir ({}): {e}", parent.display()))?;
    }
    let encoded = serde_json::to_string_pretty(&all)
        .map_err(|e| format!("Failed encoding shared grant records: {e}"))?;
    fs::write(&path, encoded).map_err(|e| {
        format!(
            "Failed writing shared grant records ({}): {e}",
            path.display()
        )
    })
}
