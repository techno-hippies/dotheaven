use super::*;

pub(super) fn maybe_repair_legacy_content_encryption(
    svc: &mut LoadStorageService,
    auth: &auth::PersistedAuth,
    payload: Value,
    branch: &'static str,
    local_track: Option<&TrackRow>,
    allow_upload: bool,
    title: &str,
    artist: &str,
    album: &str,
) -> Result<(Value, &'static str), String> {
    let content_id =
        super::extract_field_string(&payload, "contentId").unwrap_or_else(|| "n/a".to_string());
    let piece_cid =
        super::extract_field_string(&payload, "pieceCid").unwrap_or_else(|| "n/a".to_string());
    let gateway_url =
        super::extract_field_string(&payload, "gatewayUrl").unwrap_or_else(|| "n/a".to_string());
    let track_id = super::extract_field_string(&payload, "trackId");

    if content_id == "n/a" || piece_cid == "n/a" {
        return Ok((payload, branch));
    }

    // Newly-uploaded payloads are already encrypted with the current scheme (CID-bound
    // decrypt action), so skip extra probing to avoid slow network calls.
    if branch == "uploaded" {
        return Ok((payload, branch));
    }

    let hint = if gateway_url == "n/a" {
        None
    } else {
        Some(gateway_url.as_str())
    };

    match svc.probe_content_decrypt_v1(auth, &content_id, &piece_cid, hint) {
        Ok(()) => Ok((payload, branch)),
        Err(err) => {
            let lower = err.to_ascii_lowercase();
            let incompatible = lower.contains("decryption failure")
                || lower.contains("failed to decrypt and combine");
            if !incompatible {
                return Err(format!("content probe failed: {err}"));
            }

            let Some(local_track) = local_track else {
                return Err(format!(
                    "content is encrypted with a legacy scheme and cannot be played on web; no local file to repair (contentId={})",
                    abbreviate_for_status(&content_id)
                ));
            };
            if !allow_upload {
                return Err(format!(
                    "needs re-encrypt/re-upload to be playable, but uploads are blocked by low Turbo credits (contentId={})",
                    abbreviate_for_status(&content_id)
                ));
            }
            if local_track.file_path.is_empty()
                || !std::path::Path::new(&local_track.file_path).exists()
            {
                return Err(format!(
                    "needs re-encrypt/re-upload to be playable, but local file is missing (contentId={})",
                    abbreviate_for_status(&content_id)
                ));
            }
            let Some(track_id) = track_id else {
                return Err(format!(
                    "needs repair, but trackId is missing (contentId={})",
                    abbreviate_for_status(&content_id)
                ));
            };

            log::warn!(
                "[Library] repairing legacy content encryption: trackId={} contentId={}",
                track_id,
                content_id
            );

            let new_payload = svc.content_encrypt_upload_replace_by_track_id(
                auth,
                &local_track.file_path,
                &track_id,
                title,
                artist,
                album,
            )?;
            Ok((new_payload, "replaced"))
        }
    }
}
