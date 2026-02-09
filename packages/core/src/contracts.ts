/**
 * Centralized contract addresses for Heaven.
 *
 * IMPORTANT: This is the single source of truth for all contract addresses.
 * When deploying new contracts, update ONLY this file.
 *
 * Chain: MegaETH Testnet (6343)
 */

export const MEGAETH_CHAIN_ID = 6343
export const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'

// ── Core Contracts ─────────────────────────────────────────────────

/** ERC-4337 EntryPoint v0.7 (canonical deployment) */
export const ENTRYPOINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

/** Heaven SimpleAccountFactory (deploys user accounts) */
export const ACCOUNT_FACTORY = '0xB66BF4066F40b36Da0da34916799a069CBc79408'

/** Heaven SimpleAccount implementation */
export const ACCOUNT_IMPLEMENTATION = '0xA17Fd81A1fFEC9f5694343dd4BFe29847B0eb9E7'

/** VerifyingPaymaster (sponsors gas for approved ops) */
export const PAYMASTER = '0xEb3C4c145AE16d7cC044657D1632ef08d6B2D5d9'

// ── Scrobble Contracts ─────────────────────────────────────────────

/** ScrobbleV4 — AA-enabled, stores duration, cover CID */
export const SCROBBLE_V4 = '0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1'

/** ScrobbleV3 — Legacy sponsor-gated (still used by playlists Lit Action) */
export const SCROBBLE_V3 = '0x144c450cd5B641404EEB5D5eD523399dD94049E0'

// ── Profile & Identity ─────────────────────────────────────────────

/** ProfileV2 — Structured profile data (enums, packed fields) */
export const PROFILE_V2 = '0xa31545D33f6d656E62De67fd020A26608d4601E5'

/** RegistryV1 — .heaven name NFTs */
export const REGISTRY_V1 = '0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2'

/** RecordsV1 — ENS-compatible text records */
export const RECORDS_V1 = '0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3'

/** VerificationMirror — Celo verification mirrored to MegaETH */
export const VERIFICATION_MIRROR = '0xb0864603A4d6b62eACB53fbFa32E7665BADCc7Fb'

// ── Playlists ──────────────────────────────────────────────────────

/** PlaylistV1 — On-chain playlists (event-sourced) */
export const PLAYLIST_V1 = '0xF0337C4A335cbB3B31c981945d3bE5B914F7B329'

// ── Content Registry ───────────────────────────────────────────────

/** ContentRegistry — Filecoin uploads + access grants */
export const CONTENT_REGISTRY = '0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2'

/** ContentAccessMirror — EOA-linked access grants */
export const CONTENT_ACCESS_MIRROR = '0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A'

// ── Social ─────────────────────────────────────────────────────────

/** PostsV1 — Social posts */
export const POSTS_V1 = '0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6'

/** EngagementV2 — Likes, comments, flags, translations */
export const ENGAGEMENT_V2 = '0xAF769d204e51b64D282083Eb0493F6f37cd93138'

/** FollowV1 — Social follow graph */
export const FOLLOW_V1 = '0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb'

// ── Escrow ─────────────────────────────────────────────────────────

/** SessionEscrowV1 — Meeting booking escrow */
export const SESSION_ESCROW_V1 = '0x132212B78C4a7A3F19DE1BF63f119848c765c1d2'

// ── ENS / Name Resolution ──────────────────────────────────────────

/** Heaven parent node: namehash("heaven.hnsbridge.eth") */
export const HEAVEN_NODE = '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27'

// ── Subgraph Endpoints (Goldsky) ─────────────────────────────────────

const GOLDSKY_BASE = 'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs'

/** Activity subgraph — posts, scrobbles, engagement, content, follows */
export const SUBGRAPH_ACTIVITY = `${GOLDSKY_BASE}/dotheaven-activity/14.0.0/gn`

/** Profiles subgraph — ProfileV2 events (denormalized enums) */
export const SUBGRAPH_PROFILES = `${GOLDSKY_BASE}/dotheaven-profiles/1.0.0/gn`

/** Playlists subgraph — PlaylistV1 events */
export const SUBGRAPH_PLAYLISTS = `${GOLDSKY_BASE}/dotheaven-playlists/1.0.0/gn`

// ── Celo (Self.xyz verification) ───────────────────────────────────

export const CELO_CHAIN_ID = 44787 // Celo Alfajores testnet
export const CELO_RPC = 'https://alfajores-forno.celo-testnet.org'

/** SelfProfileVerifier on Celo */
export const SELF_VERIFIER_CELO = '0x9F0fFF861b502118336bCf498606fEa664a8DAdA'
