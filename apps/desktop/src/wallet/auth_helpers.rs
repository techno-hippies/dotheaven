use super::*;

pub(super) fn preferred_wallet_address(auth: Option<&auth::PersistedAuth>) -> Option<String> {
    auth?.wallet_address.clone()
}
