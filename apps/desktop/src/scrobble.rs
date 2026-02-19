//! Native Rust scrobble submitter for GPUI using Tempo transactions.

use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::{AuthProviderKind, PersistedAuth};
use crate::music_db::TrackRow;

mod tempo;

const DEFAULT_TEMPO_RPC_URL: &str = "https://rpc.moderato.tempo.xyz";
const DEFAULT_TEMPO_FEE_PAYER_URL: &str = "https://sponsor.moderato.tempo.xyz";
const DEFAULT_TEMPO_CHAIN_ID: u64 = 42431;
const DEFAULT_TEMPO_SCROBBLE_V4: &str = "0xe00e82086480E61AaC8d5ad8B05B56A582dD0000";

#[derive(Debug, Clone)]
pub struct TempoScrobbleSession {
    pub wallet_address: String,
    pub chain_id: u64,
    pub rpc_url: String,
    pub fee_payer_url: String,
    pub scrobble_contract: String,
    pub session_private_key: String,
    pub session_address: String,
    pub session_expires_at: u64,
    pub session_key_authorization: String,
}

pub struct ScrobbleService;

#[derive(Debug, Clone)]
pub struct SubmitScrobbleInput {
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
    pub duration_sec: u32,
    pub played_at_sec: u64,
}

#[derive(Debug, Clone)]
pub struct SubmitScrobbleResult {
    pub tx_hash: String,
    pub sender: String,
    pub track_id: String,
    pub already_registered: bool,
}

impl ScrobbleService {
    pub fn new() -> Result<Self, String> {
        Ok(Self)
    }

    pub fn submit_track(
        &mut self,
        auth: &PersistedAuth,
        track: &TrackRow,
        played_at_sec: u64,
    ) -> Result<SubmitScrobbleResult, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        let input = SubmitScrobbleInput {
            artist: track.artist.clone(),
            title: track.title.clone(),
            album: if track.album.trim().is_empty() {
                None
            } else {
                Some(track.album.clone())
            },
            mbid: track.mbid.clone(),
            ip_id: track.ip_id.clone(),
            duration_sec: parse_duration_to_sec(&track.duration).unwrap_or(0),
            played_at_sec,
        };

        tempo::submit_scrobble_tempo(&session, &input)
    }

    pub fn upload_track_cover_ref(
        &mut self,
        auth: &PersistedAuth,
        cover_path: &str,
    ) -> Result<String, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::upload_cover_to_arweave(&session, cover_path)
    }

    pub fn upload_track_lyrics_ref(
        &mut self,
        auth: &PersistedAuth,
        track_id: &str,
        lyrics_payload: &str,
    ) -> Result<String, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::upload_lyrics_to_arweave(&session, track_id, lyrics_payload)
    }

    pub fn ensure_track_cover_synced(
        &mut self,
        auth: &PersistedAuth,
        track_id: &str,
        cover_ref: &str,
    ) -> Result<String, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::ensure_track_cover_tempo(&session, track_id, cover_ref)
    }

    pub fn supports_track_cover_sync(&mut self, auth: &PersistedAuth) -> Result<bool, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::supports_track_cover_sync_tempo(&session)
    }

    pub fn ensure_track_lyrics_synced(
        &mut self,
        auth: &PersistedAuth,
        track_id: &str,
        lyrics_ref: &str,
    ) -> Result<String, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::ensure_track_lyrics_tempo(&session, track_id, lyrics_ref)
    }

    pub fn supports_track_lyrics_sync(&mut self, auth: &PersistedAuth) -> Result<bool, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::supports_track_lyrics_sync_tempo(&session)
    }

    pub fn read_track_cover_ref(
        &mut self,
        auth: &PersistedAuth,
        track_id: &str,
    ) -> Result<Option<String>, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::read_track_cover_ref_tempo(&session, track_id)
    }

    pub fn read_track_lyrics_ref(
        &mut self,
        auth: &PersistedAuth,
        track_id: &str,
    ) -> Result<Option<String>, String> {
        let session = Self::tempo_session_from_auth(auth)?;
        tempo::read_track_lyrics_ref_tempo(&session, track_id)
    }

    fn tempo_session_from_auth(auth: &PersistedAuth) -> Result<TempoScrobbleSession, String> {
        if auth.provider_kind() != AuthProviderKind::TempoPasskey {
            return Err(
                "Scrobble submission requires Tempo passkey auth. Sign in again in Wallet."
                    .to_string(),
            );
        }

        let wallet_address = auth
            .wallet_address()
            .ok_or("Missing authenticated wallet address for Tempo scrobble.")?
            .to_string();

        let session_private_key = auth
            .tempo_session_private_key
            .clone()
            .ok_or("Missing Tempo scrobble session private key. Sign in again to refresh auth.")?;
        let session_address = auth
            .tempo_session_address
            .clone()
            .ok_or("Missing Tempo scrobble session address. Sign in again to refresh auth.")?;
        let session_expires_at = auth
            .tempo_session_expires_at
            .ok_or("Missing Tempo scrobble session expiry. Sign in again to refresh auth.")?;
        let session_key_authorization = auth
            .tempo_session_key_authorization
            .clone()
            .ok_or("Missing Tempo scrobble key authorization. Sign in again to refresh auth.")?;

        if now_epoch_sec() >= session_expires_at {
            return Err(
                "Tempo scrobble session key has expired. Sign in again to refresh it.".to_string(),
            );
        }

        let chain_id = auth.tempo_chain_id.unwrap_or_else(resolve_tempo_chain_id);
        let fee_payer_url = auth
            .tempo_fee_payer_url
            .clone()
            .unwrap_or_else(resolve_tempo_fee_payer_url);

        Ok(TempoScrobbleSession {
            wallet_address,
            chain_id,
            rpc_url: resolve_tempo_rpc_url(),
            fee_payer_url,
            scrobble_contract: resolve_tempo_scrobble_contract(),
            session_private_key,
            session_address,
            session_expires_at,
            session_key_authorization,
        })
    }
}

pub(crate) fn submit_tempo_contract_call(
    auth: &PersistedAuth,
    contract_address: &str,
    call_data: Vec<u8>,
    gas_limit_min: u64,
    op_label: &str,
) -> Result<String, String> {
    let session = ScrobbleService::tempo_session_from_auth(auth)?;
    tempo::submit_contract_call_tempo(
        &session,
        contract_address,
        call_data,
        gas_limit_min,
        op_label,
    )
}

pub fn now_epoch_sec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn parse_duration_to_sec(value: &str) -> Option<u32> {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if parts.len() == 2 {
        let min = parts[0].parse::<u32>().ok()?;
        let sec = parts[1].parse::<u32>().ok()?;
        return Some(min.saturating_mul(60).saturating_add(sec));
    }
    parts.first()?.parse::<u32>().ok()
}

fn resolve_tempo_rpc_url() -> String {
    env_or("HEAVEN_TEMPO_RPC_URL", "TEMPO_RPC_URL")
        .unwrap_or_else(|| DEFAULT_TEMPO_RPC_URL.to_string())
}

fn resolve_tempo_fee_payer_url() -> String {
    env_or("HEAVEN_TEMPO_FEE_PAYER_URL", "TEMPO_FEE_PAYER_URL")
        .unwrap_or_else(|| DEFAULT_TEMPO_FEE_PAYER_URL.to_string())
}

fn resolve_tempo_chain_id() -> u64 {
    env_or("HEAVEN_TEMPO_CHAIN_ID", "TEMPO_CHAIN_ID")
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(DEFAULT_TEMPO_CHAIN_ID)
}

fn resolve_tempo_scrobble_contract() -> String {
    env_or("HEAVEN_TEMPO_SCROBBLE_V4", "TEMPO_SCROBBLE_V4")
        .unwrap_or_else(|| DEFAULT_TEMPO_SCROBBLE_V4.to_string())
}

fn env_or(primary: &str, fallback: &str) -> Option<String> {
    env::var(primary)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var(fallback).ok().filter(|v| !v.trim().is_empty()))
}
