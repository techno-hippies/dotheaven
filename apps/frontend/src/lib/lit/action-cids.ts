/**
 * Lit Action CIDs (from lit-actions/cids/dev.json)
 *
 * Single source of truth for all deployed action CIDs used in the frontend.
 * After redeploying an action via `bun scripts/setup.ts <action>`, update the
 * corresponding CID here to match the new value in cids/dev.json.
 */

/** Playlist v1 — event-sourced playlist CRUD on PlaylistV1 */
export const PLAYLIST_V1_CID = 'QmYvozSnyUb3QCmsDLWQ1caYecokqeHpc8Cck5uqnuNf9R'

/** Heaven Claim Name — gasless .heaven name registration */
export const HEAVEN_CLAIM_NAME_CID = 'QmVx1YrPTn3bk1TiqvFZ73yBwnyNUpDugjqGzEYKNXBr7Z'

/** Heaven Set Profile — gasless profile write to ProfileV2 */
export const HEAVEN_SET_PROFILE_CID = 'Qmc6657yuLtgmtLnUqznmBFR9NWnX2th39HG64YdUEw4g8'

/** Heaven Set Records — gasless ENS text record writes on RecordsV1 */
export const HEAVEN_SET_RECORDS_CID = 'QmNTJXB8KioAsJt4ebJUJF9w87a57nHHrF1HqqVwmqNi2r'

/** Avatar Upload — IPFS upload with style enforcement */
export const AVATAR_UPLOAD_CID = 'QmTWwoC5zX2pUuSExsra5RVzChE9nCYRAkVVgppjvc196A'

/** Content Register v1 — register Filecoin content entry on ContentRegistry + upload cover art */
export const CONTENT_REGISTER_V1_CID = 'QmchDhdrQ8JiX1NDFe6XG2wspWhGMpfEZ652iZp9NzVmCu'

/** Content Access v1 — grant/revoke access on ContentRegistry */
export const CONTENT_ACCESS_V1_CID = 'QmXnhhG1aykZGZoPXTKihi4jRbygD2rvn5DZwTBz89LPfn'

/** Link EOA v1 — link PKP to EOA on ContentAccessMirror for shared content access */
export const LINK_EOA_V1_CID = 'QmYPeQEpUhb8eMULPmW7RM5k5yNMTWMmRDa8p3Gw4d966C'

/** Post Register v1 — unified text + photo registration (image uploaded by Media Worker or text inline) */
export const POST_REGISTER_V1_CID = 'QmQ3sz9g1znyoKPyNUQetnfijwqNQNU7ir7YuQXtU7f4C3'

/** Track Cover v4 — upload cover art + set on ScrobbleV4 (operator-only) */
export const TRACK_COVER_V4_CID = 'QmSVssbAxCr1xp7mKX1VfcJFNJewQfhCZGiPuhyEjGvUC2'

/** Post Translate v1 — LLM translation → EngagementV2.translateFor() on MegaETH */
export const POST_TRANSLATE_V1_CID = 'QmWAGjKKmnpmiN2BjVe5YUtXjkKApGyCwdLoszAjTRDFiY'

// Content decrypt is handled client-side via litClient.decrypt() — no Lit Action needed.
// The Lit BLS nodes enforce canAccess() on Base ContentAccessMirror during threshold decryption.
