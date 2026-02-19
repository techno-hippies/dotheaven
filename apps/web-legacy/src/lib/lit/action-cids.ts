/**
 * Lit Action CIDs — loaded per-network from embedded CID maps.
 *
 * This app is dev-only. `naga-dev` is always used.
 * If `VITE_LIT_NETWORK` is set to anything else, it is ignored with a warning.
 *
 * After redeploying an action via `bun scripts/setup.ts <action>`, update the
 * corresponding CID in the map below to match the new value in lit-actions/cids/*.json.
 *
 * Individual CIDs can still be overridden via VITE_*_CID env vars.
 */

const requestedLitNetwork = (import.meta.env.VITE_LIT_NETWORK || 'naga-dev') as string
if (requestedLitNetwork && requestedLitNetwork !== 'naga-dev') {
  console.warn(`[lit/action-cids] VITE_LIT_NETWORK=${requestedLitNetwork} ignored; using naga-dev`)
}
const litNetwork: 'naga-dev' = 'naga-dev'

/** CID map mirroring lit-actions/cids/dev.json */
const CID_MAP = {
  'naga-dev': {
    playlistV1:           'QmeajAFaBK9uk2YgE2jrxamMB3rhqRioyfLqXsmomyTkc5',
    heavenClaimName:      'QmQB5GsQVaNbD8QS8zcXkjBMAZUjpADfbcWVaPgL3PygSA',
    heavenSetProfile:     'QmUJnDz9Q92bSLvNQMLyPDNSkw69MA3fpYsSCnAeMAJtuy',
    heavenSetRecords:     'QmaXJcjGbPWQ1ypKnQB3vfnDwaQ1NLEGFmN3t7gQisw9g5',
    avatarUpload:         'QmTWwoC5zX2pUuSExsra5RVzChE9nCYRAkVVgppjvc196A',
    contentRegisterV1:    'QmVbhvmjcwRPx47K7UuEg8RrxZuTCbYF5DrkYbJaehBbrd',
    contentRegisterV2:    '',
    contentAccessV1:      'QmXhzbZqvfg7b29eY3CzyV9ep4kvL9QxibKDYqBYAiQoDT',
    postRegisterV1:       'QmduQNBGLfEB1bkCFMXLjRcpBJ3wfcV675KMWWYQe5k477',
    trackCoverV4:         'QmcwLxoNyuV5KrJALfaAEBa4zspoxedEfPJba2Y3uhWYx7',
    trackCoverV5:         'QmdoZnj6BsXASda2VUqN7M1zPDktoBQMkn2WvW1PsbRiUb',
    postTranslateV1:      'QmefcfyK57V6XQeHsH9oVCfukwMiLGC4KgZVniXFBAL6Sv',
    songPublishV2:        'QmYzNwWVJSAs2aMgdEBufzKftxzACJ7kxmQKSWqVJrseYT',
    lyricsTranslate:      'QmViMXk72SZdjoWWuXP6kUsxB3BHzrK2ZN934YPFKmXBeV',
    followV1:             'QmUxWxazesrDvsFF4gDk2mbT8L8dbHrWVQUKAnwRYm8yyU',
    likeV1:               'QmbXU6jxx2rH8ZopmEJQDTYce83LBEnsVxGhkTDD8hWcCX',
    commentV1:            'QmVhonUxBF9upcJh6NnzMNeGndenMoAN1a7qtu1PU7EoS1',
    flagV1:               'QmbCPSxieogoSVLR3HAYDffyerNE1DZGZuLFAWiwnTzzPx',
    storyRegisterSponsor: 'QmZ38qG34PKnENxzV8eejbRwiqQf2aRFKuNKqJNTXvU43Q',
    contentRegisterMegaethV1: 'QmRFuAAYCmri8kTCmJupF9AZWhYmvKnhNhVyqr5trRfZhS',
    contentDecryptV1:     'QmUmVkMxC57nAqUmJPZmoBKeBfiZS6ZR8qzYQJvWe4W12w',
  },
} as const

const cids = CID_MAP[litNetwork]

/** Helper: env override → network CID (empty string if not deployed on this network) */
const cid = (envKey: string, key: keyof typeof cids): string =>
  import.meta.env[envKey] || cids[key]

// ── Exported CIDs ───────────────────────────────────────────────────

/** Playlist v1 — event-sourced playlist CRUD on PlaylistV1 */
export const PLAYLIST_V1_CID = cid('VITE_PLAYLIST_V1_CID', 'playlistV1')

/** Heaven Claim Name — gasless .heaven name registration */
export const HEAVEN_CLAIM_NAME_CID = cid('VITE_HEAVEN_CLAIM_NAME_CID', 'heavenClaimName')

/** Heaven Set Profile — gasless profile write to ProfileV2 */
export const HEAVEN_SET_PROFILE_CID = cid('VITE_HEAVEN_SET_PROFILE_CID', 'heavenSetProfile')

/** Heaven Set Records — gasless ENS text record writes on RecordsV1 */
export const HEAVEN_SET_RECORDS_CID = cid('VITE_HEAVEN_SET_RECORDS_CID', 'heavenSetRecords')

/** Avatar Upload — IPFS upload with style enforcement */
export const AVATAR_UPLOAD_CID = cid('VITE_AVATAR_UPLOAD_CID', 'avatarUpload')

/** Content Register v1 — register Filecoin content entry on ContentRegistry + upload cover art */
export const CONTENT_REGISTER_V1_CID = cid('VITE_CONTENT_REGISTER_V1_CID', 'contentRegisterV1')

/** Content Register v2 — register Filecoin content entry only (decoupled from track registry/cover) */
export const CONTENT_REGISTER_V2_CID = cid('VITE_CONTENT_REGISTER_V2_CID', 'contentRegisterV2')

/** Content Access v1 — grant/revoke access on ContentRegistry */
export const CONTENT_ACCESS_V1_CID = cid('VITE_CONTENT_ACCESS_V1_CID', 'contentAccessV1')

/** Post Register v1 — unified text + photo registration (image uploaded by Media Worker or text inline) */
export const POST_REGISTER_V1_CID = cid('VITE_POST_REGISTER_V1_CID', 'postRegisterV1')

/** Track Cover v4 — upload cover art + set on ScrobbleV4 (operator-only) */
export const TRACK_COVER_V4_CID = cid('VITE_TRACK_COVER_V4_CID', 'trackCoverV4')

/** Track Cover v5 — set URI-safe cover refs (for example ar://...) on ScrobbleV4 (operator-only) */
export const TRACK_COVER_V5_CID = cid('VITE_TRACK_COVER_V5_CID', 'trackCoverV5')

/** Post Translate v1 — LLM translation → EngagementV2.translateFor() on MegaETH */
export const POST_TRANSLATE_V1_CID = cid('VITE_POST_TRANSLATE_V1_CID', 'postTranslateV1')

/** Song Publish v2 — storage-agnostic params + ref aliases for media inputs */
export const SONG_PUBLISH_V2_CID = cid('VITE_SONG_PUBLISH_V2_CID', 'songPublishV2')

/** Story Register Sponsor v1 — gasless Story Protocol IP registration (mint NFT + register IP + attach PIL license) */
export const STORY_REGISTER_SPONSOR_CID = cid('VITE_STORY_REGISTER_SPONSOR_CID', 'storyRegisterSponsor')

/** Lyrics Translate v1 — batch lyrics translation → IPFS + LyricsEngagementV1 on MegaETH */
export const LYRICS_TRANSLATE_CID = cid('VITE_LYRICS_TRANSLATE_CID', 'lyricsTranslate')

/** Follow v1 — follow/unfollow users on FollowV1 on MegaETH */
export const FOLLOW_V1_CID = cid('VITE_FOLLOW_V1_CID', 'followV1')

/** Like v1 — like/unlike posts on EngagementV2 on MegaETH */
export const LIKE_V1_CID = cid('VITE_LIKE_V1_CID', 'likeV1')

/** Comment v1 — add comments to posts on EngagementV2 on MegaETH */
export const COMMENT_V1_CID = cid('VITE_COMMENT_V1_CID', 'commentV1')

/** Flag v1 — flag posts for moderation on EngagementV2 on MegaETH */
export const FLAG_V1_CID = cid('VITE_FLAG_V1_CID', 'flagV1')

/** Content Register MegaETH v1 — register content on ContentRegistry (MegaETH only, no Base mirror) */
export const CONTENT_REGISTER_MEGAETH_V1_CID = cid('VITE_CONTENT_REGISTER_MEGAETH_V1_CID', 'contentRegisterMegaethV1')

/** Content Decrypt v1 — server-side decryption via executeJs + decryptAndCombine (bypasses client-side ACC auth limitation) */
export const CONTENT_DECRYPT_V1_CID = cid('VITE_CONTENT_DECRYPT_V1_CID', 'contentDecryptV1')
