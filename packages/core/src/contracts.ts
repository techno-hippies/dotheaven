/**
 * Centralized contract addresses for Heaven.
 *
 * IMPORTANT: This is the single source of truth for all contract addresses.
 * When deploying new contracts, update ONLY this file.
 */

export const MEGAETH_CHAIN_ID = 6343
export const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'
export const TEMPO_CHAIN_ID = 42431
export const TEMPO_RPC = 'https://rpc.moderato.tempo.xyz'

// ── Scrobble Contracts ─────────────────────────────────────────────

/** ScrobbleV4 — Legacy AA-enabled (MegaETH). Will be replaced by ScrobbleV5 on Tempo. */
export const SCROBBLE_V4 = '0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1'

/** ScrobbleV3 — Legacy sponsor-gated (still used by playlists Lit Action) */
export const SCROBBLE_V3 = '0x144c450cd5B641404EEB5D5eD523399dD94049E0'

// ── Profile & Identity ─────────────────────────────────────────────

/** ProfileV2 — Structured profile data (enums, packed fields) */
export const PROFILE_V2 = '0xe00e82086480E61AaC8d5ad8B05B56A582dD0000'

/** RegistryV2 — .heaven/.pirate name NFTs (Tempo Moderato) */
export const REGISTRY_V1 = '0xA111c5cA16752B09fF16B3B8B24BA55a8486aB23'

/** RecordsV1 — ENS-compatible text records (Tempo Moderato) */
export const RECORDS_V1 = '0x57e36738f02Bb90664d00E4EC0C8507feeF3995c'

/** PremiumNameStore — AlphaUSD premium storefront (Tempo Moderato) */
export const PREMIUM_NAME_STORE = '0x5efE75a72EAE3178A7a4F310e841b1D3fF980D3D'

/** VerificationMirror — Celo verification mirrored to MegaETH */
export const VERIFICATION_MIRROR = '0xb0864603A4d6b62eACB53fbFa32E7665BADCc7Fb'

// ── Playlists ──────────────────────────────────────────────────────

/** PlaylistV1 — On-chain playlists (event-sourced) */
export const PLAYLIST_V1 = '0xF0337C4A335cbB3B31c981945d3bE5B914F7B329'

// ── Content Registry ───────────────────────────────────────────────

/** ContentRegistry — Filecoin uploads + access grants */
export const CONTENT_REGISTRY = '0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2'

// ── Social ─────────────────────────────────────────────────────────

/** PostsV1 — Social posts */
export const POSTS_V1 = '0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6'

/** EngagementV2 — Likes, comments, flags, translations */
export const ENGAGEMENT_V2 = '0xAF769d204e51b64D282083Eb0493F6f37cd93138'

/** FollowV1 — Social follow graph */
export const FOLLOW_V1 = '0x153DbEcA0CEF8563649cf475a687D14997D2c403'

// ── Escrow ─────────────────────────────────────────────────────────

/** SessionEscrowV1 — Meeting booking escrow */
export const SESSION_ESCROW_V1 = '0xb1E233221FB25c65090A75cc60Df5164A2eA4B98'

// ── ENS / Name Resolution ──────────────────────────────────────────

/** Heaven parent node: namehash("heaven.hnsbridge.eth") */
export const HEAVEN_NODE = '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27'

/** Pirate parent node: namehash("pirate.hnsbridge.eth") */
export const PIRATE_NODE = '0xace9c9c435cf933be3564cdbcf7b7e2faee63e4f39034849eacb82d13f32f02a'

// ── Subgraph Endpoints (The Graph via local Cloudflare tunnel) ───────────

const THE_GRAPH_BASE = 'https://graph.dotheaven.org/subgraphs/name/dotheaven'

/** Activity subgraph — posts, scrobbles, engagement, content, follows */
export const SUBGRAPH_ACTIVITY = `${THE_GRAPH_BASE}/activity-feed-tempo`

/** Profiles subgraph — ProfileV2 events (denormalized enums) */
export const SUBGRAPH_PROFILES = `${THE_GRAPH_BASE}/profiles-tempo`
export const SUBGRAPH_PROFILES_FALLBACK = `${THE_GRAPH_BASE}/profiles-tempo`

/** Playlists subgraph — PlaylistV1 events */
export const SUBGRAPH_PLAYLISTS = `${THE_GRAPH_BASE}/playlist-feed-tempo`

// ── Celo (Self.xyz verification) ───────────────────────────────────

export const CELO_CHAIN_ID = 44787 // Celo Alfajores testnet
export const CELO_RPC = 'https://alfajores-forno.celo-testnet.org'

/** SelfProfileVerifier on Celo */
export const SELF_VERIFIER_CELO = '0x9F0fFF861b502118336bCf498606fEa664a8DAdA'
