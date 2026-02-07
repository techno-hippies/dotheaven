/**
 * Centralized route paths for Heaven.
 *
 * IMPORTANT: This is the single source of truth for all routes.
 * When adding new routes, update ONLY this file.
 *
 * Naming conventions:
 * - Static routes: SCREAMING_SNAKE_CASE constants
 * - Dynamic routes: camelCase builder functions
 * - Route params use semantic names (e.g., :peer not :username)
 */

// ── Static Routes ─────────────────────────────────────────────────

/** Home / Community feed */
export const HOME = '/'

/** Authentication page (standalone, no shell) */
export const AUTH = '/auth'

/** Onboarding flow (standalone, no shell) */
export const ONBOARDING = '/onboarding'

/** Own profile (edit mode) */
export const PROFILE = '/profile'

/** Wallet page */
export const WALLET = '/wallet'

/** Schedule / booking page */
export const SCHEDULE = '/schedule'

/** Schedule availability editor */
export const SCHEDULE_AVAILABILITY = '/schedule/availability'

/** Liked songs collection */
export const LIKED_SONGS = '/liked-songs'

/** Free weekly curated tracks */
export const FREE_WEEKLY = '/free-weekly'

/** Music library (redirects to default tab) */
export const MUSIC = '/music'

/** Chat hub (shows conversation list) */
export const CHAT = '/chat'

/** Community discovery */
export const COMMUNITY = '/community'

/** Settings page */
export const SETTINGS = '/settings'

/** Claim profile (standalone, no shell) */
export const CLAIM = '/c'

// ── Dynamic Route Builders ────────────────────────────────────────

/**
 * Public profile page.
 * @param id - Address (0x...), heaven name (alice), domain (alice.heaven), or ENS (alice.eth)
 */
export const publicProfile = (id: string) => `/u/${id}`

/**
 * Playlist page.
 * @param id - Playlist ID (from PlaylistV1 contract)
 */
export const playlist = (id: string) => `/playlist/${id}`

/**
 * Artist page.
 * @param mbid - MusicBrainz artist ID
 */
export const artist = (mbid: string) => `/artist/${mbid}`

/**
 * Album page.
 * @param mbid - MusicBrainz release-group ID
 */
export const album = (mbid: string) => `/album/${mbid}`

/**
 * Music library with specific tab.
 * @param tab - 'local' | 'cloud' | 'shared' | 'publish'
 */
export const musicTab = (tab: 'local' | 'cloud' | 'shared' | 'publish') => `/music/${tab}`

/**
 * Peer-to-peer chat (XMTP).
 * @param peer - Address or heaven name of chat target
 */
export const peerChat = (peer: string) => `/chat/${encodeURIComponent(peer)}`

/**
 * AI chat with personality.
 * @param personality - AI personality ID (e.g., 'scarlett')
 */
export const aiChat = (personality: string) => `/chat/ai/${personality}`

/**
 * Post detail page.
 * @param id - Post ID (index or on-chain ID)
 */
export const post = (id: string) => `/post/${id}`

/**
 * Claim profile page.
 * @param token - Claim token from the shadow profile link
 */
export const claimProfile = (token: string) => `/c/${token}`

// ── Route Params (for router definition) ──────────────────────────

/** Route parameter patterns used in router config */
export const ROUTE_PARAMS = {
  /** Public profile: /u/:id */
  PUBLIC_PROFILE: '/u/:id',
  /** Playlist: /playlist/:id */
  PLAYLIST: '/playlist/:id',
  /** Artist: /artist/:mbid */
  ARTIST: '/artist/:mbid',
  /** Album: /album/:mbid */
  ALBUM: '/album/:mbid',
  /** Music tab: /music/:tab */
  MUSIC_TAB: '/music/:tab',
  /** Peer chat: /chat/:peer */
  PEER_CHAT: '/:peer',
  /** AI chat: /chat/ai/:personality */
  AI_CHAT: '/ai/:personality',
  /** Post detail: /post/:id */
  POST: '/post/:id',
  /** Claim profile: /c/:token */
  CLAIM: '/c/:token',
} as const
