use super::*;

pub(super) fn binary_exists(name: &str) -> bool {
    find_binary_in_path(name).is_some()
}

fn find_binary_in_path(name: &str) -> Option<PathBuf> {
    let candidate_names: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    };

    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        for candidate in &candidate_names {
            let path = dir.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

pub(super) fn jacktrip_bind_port(peer_port: u16) -> u16 {
    if let Some(explicit) = env::var("HEAVEN_JACKTRIP_BIND_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
    {
        return explicit;
    }

    if peer_port == u16::MAX {
        peer_port
    } else {
        peer_port.saturating_add(1)
    }
}
