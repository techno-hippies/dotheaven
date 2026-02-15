use super::*;

pub(crate) fn build_shared_gateway_urls(
    piece_cid: &str,
    gateway_url_hint: Option<&str>,
) -> Vec<String> {
    let mut out = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();
    let piece_cid = piece_cid.trim();

    let push = |seen: &mut HashSet<String>, out: &mut Vec<String>, candidate: String| {
        if candidate.is_empty() {
            return;
        }
        if seen.insert(candidate.clone()) {
            out.push(candidate);
        }
    };

    if let Some(hint) = gateway_url_hint {
        let hint = hint.trim();
        if !hint.is_empty() {
            if hint.contains("/resolve/") {
                push(&mut seen, &mut out, hint.to_string());
            } else if hint.starts_with("http://") || hint.starts_with("https://") {
                push(
                    &mut seen,
                    &mut out,
                    format!("{}/resolve/{piece_cid}", hint.trim_end_matches('/')),
                );
            }
        }
    }

    push(
        &mut seen,
        &mut out,
        format!("{}/resolve/{piece_cid}", load_gateway_url()),
    );
    push(
        &mut seen,
        &mut out,
        format!("https://gateway.s3-node-1.load.network/resolve/{piece_cid}"),
    );
    push(
        &mut seen,
        &mut out,
        format!("https://arweave.net/{piece_cid}"),
    );

    out
}

pub(crate) fn parse_content_blob(blob: &[u8]) -> Result<ParsedContentBlob, String> {
    match parse_content_blob_raw(blob) {
        Ok(parsed) => Ok(parsed),
        Err(raw_err) => {
            let item = DataItem::from_bytes(blob)
                .map_err(|_| format!("Failed parsing content blob: {raw_err}"))?;
            parse_content_blob_raw(&item.data)
                .map_err(|inner| format!("Failed parsing content blob dataitem payload: {inner}"))
        }
    }
}

pub(crate) fn parse_content_blob_raw(blob: &[u8]) -> Result<ParsedContentBlob, String> {
    fn take<'a>(
        blob: &'a [u8],
        offset: &mut usize,
        len: usize,
        label: &str,
    ) -> Result<&'a [u8], String> {
        if *offset + len > blob.len() {
            return Err(format!(
                "Malformed content blob: truncated {label} (need {}, have {})",
                len,
                blob.len().saturating_sub(*offset)
            ));
        }
        let out = &blob[*offset..*offset + len];
        *offset += len;
        Ok(out)
    }

    fn take_u32(blob: &[u8], offset: &mut usize, label: &str) -> Result<usize, String> {
        let bytes = take(blob, offset, 4, label)?;
        let mut arr = [0u8; 4];
        arr.copy_from_slice(bytes);
        Ok(u32::from_be_bytes(arr) as usize)
    }

    let mut offset = 0usize;
    let ct_len = take_u32(blob, &mut offset, "ciphertext length")?;
    let ct = take(blob, &mut offset, ct_len, "ciphertext")?;

    let hash_len = take_u32(blob, &mut offset, "hash length")?;
    let hash = take(blob, &mut offset, hash_len, "hash")?;

    let algo = *take(blob, &mut offset, 1, "algorithm byte")?
        .first()
        .ok_or("Missing algorithm byte")?;

    let iv_len = *take(blob, &mut offset, 1, "iv length byte")?
        .first()
        .ok_or("Missing iv length byte")? as usize;
    let iv = take(blob, &mut offset, iv_len, "iv")?.to_vec();

    let audio_len = take_u32(blob, &mut offset, "audio length")?;
    let audio = take(blob, &mut offset, audio_len, "encrypted audio")?.to_vec();
    if offset != blob.len() {
        return Err(format!(
            "Malformed content blob: trailing bytes detected ({})",
            blob.len() - offset
        ));
    }

    let lit_ciphertext_base64 = String::from_utf8(ct.to_vec())
        .map_err(|e| format!("Invalid UTF-8 ciphertext in content blob: {e}"))?;
    let data_to_encrypt_hash_hex = String::from_utf8(hash.to_vec())
        .map_err(|e| format!("Invalid UTF-8 hash in content blob: {e}"))?;

    Ok(ParsedContentBlob {
        lit_ciphertext_base64,
        data_to_encrypt_hash_hex,
        algo,
        iv,
        encrypted_audio: audio,
    })
}

pub(crate) fn shared_audio_cache_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
        .join("shared-audio-cache")
}

pub(crate) fn sanitize_shared_file_stem(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "shared-track".to_string()
    } else {
        trimmed
    }
}

pub(crate) fn shared_audio_cache_path(
    content_id_hex: &str,
    file_stem_hint: &str,
    ext: &str,
) -> PathBuf {
    let normalized = normalize_content_id_hex(content_id_hex)
        .unwrap_or_else(|_| content_id_hex.trim().to_string());
    let id = normalized.trim_start_matches("0x");
    let short = &id[..id.len().min(8)];
    let stem = sanitize_shared_file_stem(file_stem_hint);
    shared_audio_cache_dir().join(format!("{stem}-{short}.{ext}"))
}

pub(crate) fn find_cached_shared_audio_path(content_id_hex: &str) -> Option<PathBuf> {
    let normalized = normalize_content_id_hex(content_id_hex).ok()?;
    let id = normalized.trim_start_matches("0x");
    let short = &id[..id.len().min(8)];
    let cache_dir = shared_audio_cache_dir();

    // Backward compatibility with older cache naming (`<contentId>.<ext>`).
    for ext in ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "bin"] {
        let path = cache_dir.join(format!("{id}.{ext}"));
        if path.exists() {
            return Some(path);
        }
    }

    // New cache naming (`<sanitized-title>-<contentIdPrefix>.<ext>`).
    let suffixes = [
        format!("-{short}.mp3"),
        format!("-{short}.m4a"),
        format!("-{short}.aac"),
        format!("-{short}.flac"),
        format!("-{short}.wav"),
        format!("-{short}.ogg"),
        format!("-{short}.opus"),
        format!("-{short}.bin"),
    ];
    let Ok(entries) = fs::read_dir(&cache_dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if suffixes.iter().any(|suffix| name.ends_with(suffix)) {
            return Some(path);
        }
    }
    None
}

pub(crate) fn infer_audio_extension(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 3 && bytes.starts_with(b"ID3") {
        return "mp3";
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0 {
        return "mp3";
    }
    if bytes.len() >= 4 && bytes.starts_with(b"fLaC") {
        return "flac";
    }
    if bytes.len() >= 4 && bytes.starts_with(b"OggS") {
        return "ogg";
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE" {
        return "wav";
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        return "m4a";
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xF0) == 0xF0 {
        return "aac";
    }
    "bin"
}
