/**
 * Lit Action CIDs (from lit-actions/cids/dev.json)
 *
 * Single source of truth for all deployed action CIDs used in the frontend.
 * After redeploying an action via `bun scripts/setup.ts <action>`, update the
 * corresponding CID here to match the new value in cids/dev.json.
 */

/** Scrobble Submit V3 — track registry + scrobble events on ScrobbleV3 */
export const SCROBBLE_SUBMIT_V3_CID = 'QmNzCDJQjcNvD9A7sthWX1XoGesEtc6MTC1k76Pa6fMChv'

/** Playlist v1 — event-sourced playlist CRUD on PlaylistV1 */
export const PLAYLIST_V1_CID = 'QmYvozSnyUb3QCmsDLWQ1caYecokqeHpc8Cck5uqnuNf9R'

/** Heaven Claim Name — gasless .heaven name registration */
export const HEAVEN_CLAIM_NAME_CID = 'QmVx1YrPTn3bk1TiqvFZ73yBwnyNUpDugjqGzEYKNXBr7Z'

/** Heaven Set Profile — gasless profile write to ProfileV1 */
export const HEAVEN_SET_PROFILE_CID = 'QmYLHf2QQfY52HmvNdrtQfG3bBz8oRJzo32RfybRbnrQui'

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

/** Post Create v1 — photo post with auto anime conversion + 18+ classification + Story IP registration */
export const POST_CREATE_V1_CID = 'QmQKXuRWu5cHxNoMjr5JxdXAToFEeVLvu2eUh7ZcoqYWA2'

/** Post Text v1 — DEPRECATED: text posts now use POST_REGISTER_V1 with `text` param */
export const POST_TEXT_V1_CID = 'Qmf1mJbt3WeKUVDnbNEByk1xQhZ2icxc6Uu2v2ZfucXwtj'

/** Post Register v1 — unified text + photo registration (image uploaded by Media Worker or text inline) */
export const POST_REGISTER_V1_CID = 'QmeVChS445FVH3PLp6GjKQ52f77XJWLWfTw3EUWUsAuiVv'

/** Photo Reveal v1 — 24h pay-per-view with watermarking */
export const PHOTO_REVEAL_V1_CID = 'QmPnDcmpBLzA5dm7HHNVjRVNWEYBVC1ZbE8vYj4nRsrGQj'

// Content decrypt is handled client-side via litClient.decrypt() — no Lit Action needed.
// The Lit BLS nodes enforce canAccess() on Base ContentAccessMirror during threshold decryption.
