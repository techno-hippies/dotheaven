use super::*;

pub(super) fn preferred_wallet_address(auth: Option<&auth::PersistedAuth>) -> Option<String> {
    let auth = auth?;
    if auth.auth_method_type == Some(1) {
        auth.eoa_address
            .clone()
            .or_else(|| auth.pkp_address.clone())
    } else {
        auth.pkp_address
            .clone()
            .or_else(|| auth.eoa_address.clone())
    }
}
