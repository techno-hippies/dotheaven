/**
 * Lit Action CIDs (from lit-actions/cids/test.json — naga-test)
 *
 * Single source of truth for all deployed action CIDs used in the frontend.
 * After redeploying an action via `bun scripts/setup.ts <action>`, update the
 * corresponding CID here to match the new value in the active cids/*.json.
 */

/** Playlist v1 — event-sourced playlist CRUD on PlaylistV1 */
export const PLAYLIST_V1_CID = 'QmZ3DbcVxKVniEXeBxZdb2ZmyuLa7g61dU2FghdRTJ3RCL'

/** Heaven Claim Name — gasless .heaven name registration */
export const HEAVEN_CLAIM_NAME_CID = 'QmQztQzc3tfZCwyyxXC9N9fK8bimiMWaaYapkJufHLjgg7'

/** Heaven Set Profile — gasless profile write to ProfileV2 */
export const HEAVEN_SET_PROFILE_CID = 'QmWNyRKDjPUvG5RDinyep76Cyqr2zEKm9shUg6uJLzrUKS'

/** Heaven Set Records — gasless ENS text record writes on RecordsV1 */
export const HEAVEN_SET_RECORDS_CID = 'QmRhWGzCWYiDhbKSZ5Z9gmv5sr6nBTk5u8kAnM7YAKZ2sk'

/** Avatar Upload — IPFS upload with style enforcement */
export const AVATAR_UPLOAD_CID = 'QmTWwoC5zX2pUuSExsra5RVzChE9nCYRAkVVgppjvc196A'

/** Content Register v1 — register Filecoin content entry on ContentRegistry + upload cover art */
export const CONTENT_REGISTER_V1_CID = 'QmVzJrkKMBrXYu4urzayfnv6L2RNinUJm9tcXaeCNrWkg5'

/** Content Access v1 — grant/revoke access on ContentRegistry */
export const CONTENT_ACCESS_V1_CID = 'QmXyDnNxNV6uV296HVFv4kDuWH4iKQqRCHC77vJzxvuQgT'

/** Link EOA v1 — link PKP to EOA on ContentAccessMirror for shared content access */
export const LINK_EOA_V1_CID = 'QmWcECPXvy8DigGiouuHkfA1xBcQ7dYtCrNgUmgcT5yVVE'

/** Post Register v1 — unified text + photo registration (image uploaded by Media Worker or text inline) */
export const POST_REGISTER_V1_CID = 'Qma4SVQpBy2hnN9Hcf3ZpGzo9U5PGxJusDjpXrDnBKRc9z'

/** Track Cover v4 — upload cover art + set on ScrobbleV4 (operator-only) */
export const TRACK_COVER_V4_CID = 'QmXiDUsYqxAVgvymn7qE1oX1xNyjQzP3gZBd1JBPb2Qz3n'

/** Post Translate v1 — LLM translation → EngagementV2.translateFor() on MegaETH */
export const POST_TRANSLATE_V1_CID = 'QmSiC1nV5hu248sipLjukDuH3sDAV31F6S3RqRLfrQmZa6'

/** Song Publish v1 — upload audio/cover/instrumental/canvas to IPFS + lyrics alignment + translation */
export const SONG_PUBLISH_CID = 'Qmc2zDSsYURne8ZwG8sfLEqT12hazfHaRCM9sXjBGxD2cg'

/** Story Register Sponsor v1 — gasless Story Protocol IP registration (mint NFT + register IP + attach PIL license) */
export const STORY_REGISTER_SPONSOR_CID = 'QmRKjHrJYAi6H8qomPVsxNSpSbTtGPap4CW2G63b2i3tAV'

/** Lyrics Translate v1 — batch lyrics translation → IPFS + LyricsEngagementV1 on MegaETH */
export const LYRICS_TRANSLATE_CID = 'Qmdf2HHLzghjjeQZMvhgh6kY2EJERgC4Hw1BXfWjjeanch'

/** Follow v1 — follow/unfollow users on FollowV1 on MegaETH */
export const FOLLOW_V1_CID = 'QmPccpeqwyJSHYzY1HGu6Nmp26anouhTT8daHS8Jox9VTx'

// Content decrypt is handled client-side via litClient.decrypt() — no Lit Action needed.
// The Lit BLS nodes enforce canAccess() on Base ContentAccessMirror during threshold decryption.
