# Lit Actions - Heaven

## Overview

Lit Actions that run on Lit Protocol's decentralized nodes. Used for:
- **Playlist v1**: Create/update/delete event-sourced playlists on PlaylistV1. Registers missing tracks in ScrobbleV3 automatically. Supports coverCid for playlist artwork. Sponsor PKP pays gas. EIP-191 sig verification.
- **Heaven claim name**: Sponsor PKP claims a `.heaven` name on MegaETH on behalf of user (gasless). EIP-191 sig verification.
- **Heaven set profile**: Sponsor PKP writes user's on-chain profile to ProfileV2 on MegaETH (gasless). EIP-191 sig + nonce replay protection.
- **Heaven set records**: Sponsor PKP sets ENS-compatible text records on RecordsV1 on MegaETH (gasless). Single or batch records. EIP-191 sig + per-node nonce replay protection.
- **Avatar upload**: IPFS upload with anime/stylized style enforcement (rejects realistic human photos). Encrypted keys: filebase, openrouter.
- **Content register v1**: Register Filecoin content entry on ContentRegistry + upload cover art. Sponsor PKP pays gas.
- **Content access v1**: Grant/revoke access on ContentRegistry. Sponsor PKP pays gas.
- **Link EOA v1**: Link PKP to EOA on ContentAccessMirror for shared content access.
- **Post register v1**: Unified post registration for text AND photo posts. Text posts: AI safety check (includes language detection) + metadata upload + MegaETH mirror (no Story). Photo posts: metadata upload + Story IP + MegaETH mirror. Supports attribution for shared content. Pre-signed signature support for test/frontend flexibility.

### Future (not yet wired to frontend)
- **Song publish**: Upload audio/preview/cover/metadata to IPFS, align lyrics (ElevenLabs), translate lyrics (OpenRouter) — all in one action with 3 encrypted keys
- **Lyrics translate**: Batch-translate lyrics into multiple target languages in parallel, upload each to IPFS — separate action callable anytime after publish
- **Story IP registration**: Sponsor PKP mints NFT + registers IP Asset + attaches PIL license on Story Protocol (gasless for user)

### Retired
- **Scrobble submit V3**: Replaced by ERC-4337 Account Abstraction (ScrobbleV4 contract + AA gateway). Source kept for reference.
- **Post create v1**: Superseded by post-register-v1 (unified text + photo pipeline).
- **Post text v1**: Deprecated, merged into post-register-v1.
- **Photo reveal v1**: Feature removed. Reveal service deleted from frontend.
- **Content decrypt v1**: Handled client-side via `litClient.decrypt()` — no Lit Action needed.

## Status

### Active (in frontend `action-cids.ts` + `dev.json`)

| Action | File | CID (prefix) |
|--------|------|--------------|
| Playlist v1 | `features/music/playlist-v1.js` | `QmYvozSn...` |
| Heaven Claim Name | `features/profile/heaven-claim-name-v1.js` | `QmVx1YrP...` |
| Heaven Set Profile | `features/profile/heaven-set-profile-v1.js` | `Qmc6657y...` |
| Heaven Set Records | `features/profile/heaven-set-records-v1.js` | `QmNTJXB8...` |
| Avatar Upload | `features/profile/avatar-upload-v1.js` | `QmTWwoC5...` |
| Content Register v1 | `features/music/content-register-v1.js` | `QmchDhdr...` |
| Content Access v1 | `features/music/content-access-v1.js` | `QmXnhhG1...` |
| Link EOA v1 | `features/music/link-eoa-v1.js` | `QmYPeQEp...` |
| Post Register v1 | `features/social/post-register-v1.js` | `QmQ3sz9g...` |
| Post Translate v1 | `features/social/post-translate-v1.js` | `QmWAGjKK...` |

### Future (in `setup.ts` but not in `action-cids.ts`)

| Action | File | Notes |
|--------|------|-------|
| Song Publish | `features/music/song-publish-v1.js` | Not wired to frontend yet |
| Lyrics Translate | `features/music/lyrics-translate-v1.js` | Not wired to frontend yet |
| Story Register Sponsor | `features/music/story-register-sponsor-v1.js` | Not wired to frontend yet |
| Self Verify Mirror | `features/verification/self-verify-mirror-v1.js` | Not wired to frontend yet |


## TODO

### Frontend Integration
- [ ] Song upload flow: frontend calls songUpload Lit Action, receives CIDs
- [ ] After upload: frontend calls storyRegisterSponsor with metadata CIDs from upload step
- [ ] Wire up EIP-712 signing in frontend AuthContext/wallet provider
- [ ] Display ipId + tokenId + license info after registration

### Production
- [ ] Deploy all actions on `naga-test` (requires tstLPX)
- [ ] Deploy own SPG NFT collection on Story mainnet (chainId 1514)
- [ ] Update contract addresses for mainnet (all constants in story-register-sponsor)
- [ ] Fund production sponsor PKP with mainnet IP tokens
- [ ] Test full song-upload → story-register pipeline end-to-end

## Architecture

### Song Upload Flow
```
Client                      Lit Action                  Filebase IPFS
   |                            |                           |
   |  1. Sign content hashes   |                           |
   |  (EIP-191, off-chain)     |                           |
   | ──────────────────────────>|                           |
   |                            |  2. Verify sig            |
   |                            |  3. Decrypt Filebase key  |
   |                            |  4. Fetch + hash content  |
   |                            |  5. Upload 6 files        |
   |                            | ─────────────────────────>|
   |  6. Return 6 CIDs         |                           |
   | <──────────────────────────|                           |
```

### Story Registration Flow (Gasless)
```
Client                      Lit Action                  Story Aeneid
   |                            |                           |
   |  1. Sign EIP-712          |                           |
   |  (no gas, authorizes reg) |                           |
   | ──────────────────────────>|                           |
   |                            |  2. Verify EIP-712 sig    |
   |                            |  3. Encode calldata       |
   |                            |  4. Sponsor PKP signs tx  |
   |                            |  5. Broadcast tx          |
   |                            | ─────────────────────────>|
   |                            |  6. Query registries      |
   |                            | <─────────────────────────|
   |  7. Return ipId, tokenId  |                           |
   | <──────────────────────────|                           |
```

**Key design:**
- User never needs Story $IP tokens — sponsor PKP pays gas
- EIP-712 signature binds recipient + metadata hashes + rev share + nonce (prevents replay/abuse)
- Result extraction is deterministic: tokenId from mint Transfer event, ipId from `IPAssetRegistry.ipId()`, licenseTermsIds from `LicenseRegistry` queries

## Story Protocol Contracts (Aeneid, chainId 1315)

| Contract | Address |
|----------|---------|
| LicenseAttachmentWorkflows | `0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8` |
| LicensingModule | `0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f` |
| PILicenseTemplate | `0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316` |
| RoyaltyPolicyLAP | `0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E` |
| IPAssetRegistry | `0x77319B4031e6eF1250907aa00018B8B1c67a244b` |
| LicenseRegistry | `0x529a750E02d8E2f15649c13D69a465286a780e24` |
| WIP Token | `0x1514000000000000000000000000000000000000` |
| SPG NFT (Heaven Songs) | `0xb1764abf89e6a151ea27824612145ef89ed70a73` |
| RegistrationWorkflows | `0xbe39E1C756e921BD25DF86e7AAa31106d1eb0424` |

## MegaETH Contracts (Testnet, chainId 6343)

| Contract | Address |
|----------|---------|
| ScrobbleV3 | `0x144c450cd5B641404EEB5D5eD523399dD94049E0` |
| PlaylistV1 | `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329` |
| ProfileV2 | `0xa31545D33f6d656E62De67fd020A26608d4601E5` |
| RegistryV1 | `0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2` |
| RecordsV1 | `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3` |
| PostsV1 | `0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6` |
| EngagementV2 | `0xAF769d204e51b64D282083Eb0493F6f37cd93138` |

## Subgraphs (Goldsky)

| Subgraph | Version | Endpoint |
|----------|---------|----------|
| `dotheaven-activity` | 12.0.0 | `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/12.0.0/gn` |
| `dotheaven-profiles` | 1.0.0 | `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn` |
| `dotheaven-playlists` | 1.0.0 | `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn` |

Network: `megaeth-testnet-v2` (Goldsky identifier)

- `dotheaven-activity` indexes ScrobbleV3 + ScrobbleV4 + PostsV1 + ContentRegistry + EngagementV2 events
- `dotheaven-profiles` indexes ProfileV2 `ProfileUpserted` events
- `dotheaven-playlists` indexes PlaylistV1 events

Deploy: `cd subgraphs/<dir> && npx graph codegen && npx graph build && goldsky subgraph deploy <name>/<version>`

## PKP Info

| | Address |
|--|---------|
| Sponsor PKP | `0x089fc7801D8f7D487765343a7946b1b97A7d29D4` |
| Deployer EOA | `0x9456aec64179FE39a1d0a681de7613d5955E75D3` |

## Commands

```bash
# Setup & deploy
bun scripts/mint-pkp.ts                    # Mint new PKP
bun scripts/setup.ts playlistV1            # Deploy playlist v1 action
bun scripts/setup.ts heavenClaimName       # Deploy heaven claim name action
bun scripts/setup.ts heavenSetProfile      # Deploy heaven set profile action
bun scripts/setup.ts heavenSetRecords      # Deploy heaven set records action
bun scripts/setup.ts avatarUpload          # Deploy avatar upload action
bun scripts/setup.ts contentRegisterV1     # Deploy content register action
bun scripts/setup.ts contentAccessV1       # Deploy content access action
bun scripts/setup.ts linkEoaV1             # Deploy link EOA action
bun scripts/setup.ts postRegisterV1        # Deploy post register action
bun scripts/setup.ts postTranslateV1      # Deploy post translate action
bun scripts/setup.ts songPublish           # Deploy song publish action (future)
bun scripts/setup.ts lyricsTranslate       # Deploy lyrics translate action (future)
bun scripts/setup.ts storyRegisterSponsor  # Deploy story register action (future)
bun scripts/deploy-spg-nft.ts             # Deploy own SPG NFT collection
bun scripts/verify.ts                      # Verify all actions configured

# Tests (co-located with actions in feature folders)
bun features/music/song-publish.test.ts             # Test song publish
bun features/music/lyrics-translate.test.ts         # Test batch lyrics translation
bun features/music/story-register-sponsor.test.ts   # Test Story registration
bun features/music/playlist-v1.test.ts          # Test playlist CRUD
bun features/profile/heaven-claim-name.test.ts      # Test .heaven name claim
bun features/profile/heaven-set-profile.test.ts     # Test profile write
bun features/profile/heaven-set-records.test.ts     # Test records write
bun features/social/post-register.test.ts            # Test post registration + language detection
bun features/social/post-translate.test.ts          # Test post translation
bun features/verification/self-verify-mirror.test.ts # Test verification mirror

# Data scripts (operational, not tests)
bun data-scripts/seed-profiles.ts          # Seed 20 test profiles on MegaETH
bun data-scripts/ingest-dateme.ts          # Ingest dateme.directory profiles
```

## Updating an Action

1. Edit `features/<domain>/<name>.js`
2. Run `bun scripts/setup.ts <actionName>` (uploads to IPFS, adds PKP permission, re-encrypts keys)
3. New CID saved to `cids/dev.json` automatically

## Environment

`LIT_NETWORK` env var controls which Lit network to use:
- `naga-dev` - Free dev network (default)
- `naga-test` - Testnet (requires tstLPX)

## Files

```
lit-actions/
├── features/                          # Actions + tests organized by feature domain
│   ├── profile/                       # Heaven names, profiles, avatars
│   │   ├── heaven-claim-name-v1.js    # Gasless .heaven name claim
│   │   ├── heaven-claim-name.test.ts
│   │   ├── heaven-set-profile-v1.js   # Gasless profile write to ProfileV2
│   │   ├── heaven-set-profile.test.ts
│   │   ├── heaven-set-records-v1.js   # Gasless ENS text record writes
│   │   ├── heaven-set-records.test.ts
│   │   ├── avatar-upload-v1.js        # IPFS upload with anime style enforcement
│   │   ├── avatar-upload.test.ts
│   │   └── avatar-style-check.test.ts
│   ├── social/                        # Posts and engagement
│   │   ├── post-register-v1.js        # Unified text + photo post registration
│   │   ├── post-translate-v1.js       # LLM translation → EngagementV2
│   │   ├── post-register.test.ts
│   │   └── post-translate.test.ts
│   ├── music/                         # Playlists, publishing, content, covers
│   │   ├── playlist-v1.js             # Event-sourced playlist operations
│   │   ├── playlist-v1.test.ts
│   │   ├── content-register-v1.js     # Filecoin content registration
│   │   ├── content-register.test.ts
│   │   ├── content-access-v1.js       # Grant/revoke content access
│   │   ├── content-access.test.ts
│   │   ├── content-upload.test.ts
│   │   ├── content-decrypt.test.ts
│   │   ├── link-eoa-v1.js             # Link PKP to EOA
│   │   ├── track-cover-v4.js          # Track cover art management
│   │   ├── song-publish-v1.js         # Upload + alignment + translation
│   │   ├── song-publish.test.ts
│   │   ├── lyrics-translate-v1.js     # Batch multi-language translation
│   │   ├── lyrics-translate.test.ts
│   │   ├── story-register-sponsor-v1.js # Gasless Story IP registration
│   │   └── story-register-sponsor.test.ts
│   └── verification/                  # Identity verification
│       ├── self-verify-mirror-v1.js   # Celo → MegaETH verification sync
│       └── self-verify-mirror.test.ts
├── data-scripts/                      # Operational scripts (not tests)
│   ├── seed-profiles.ts               # Seed 20 test profiles on MegaETH
│   └── ingest-dateme.ts               # Ingest dateme.directory profiles
├── scripts/                           # Deployment & maintenance
│   ├── setup.ts                       # Deploy action + add permission + encrypt keys
│   ├── upload-action.ts               # Upload-only (no permission/encryption)
│   ├── encrypt-key.ts                 # Encrypt API keys for action CID
│   ├── add-permission.ts              # Add PKP permission for CID
│   ├── mint-pkp.ts                    # Mint new PKP with EOA ownership
│   ├── deploy-spg-nft.ts              # Deploy SPG NFT collection on Story
│   └── verify.ts                      # Verify configuration
├── tests/shared/                      # Shared test infrastructure
│   ├── env.ts                         # Network detection + config loading
│   └── pkp-signer.test.ts             # PKP signing utilities test
├── fixtures/                          # Test assets
├── config/                            # Network configurations
├── cids/                              # Deployed action CIDs (IPFS hashes)
├── keys/                              # Encrypted API keys (gitignored)
├── output/                            # PKP credentials (gitignored)
└── .env                               # Local env vars (gitignored)
```

## Signature Schemes

### Song Publish (EIP-191)
```
message = `heaven:publish:${audioHash}:${previewHash}:${coverHash}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`
```
Action fetches content, re-hashes, verifies signature recovers to user's address. All metadata, lyrics, and language params are authenticated.

### Post Register (EIP-191)
```
message = `heaven:post:${contentIdentifier}:${timestamp}:${nonce}`
```
`contentIdentifier` = `keccak256(text).slice(0, 18)` for text posts, `imageCid` for photo posts. Supports two modes:
1. **In-action signing**: User PKP signs binding message inside the Lit Action via `signAndCombineEcdsa`.
2. **Pre-signed**: Frontend/test pre-signs the message and passes `signature` jsParam (skips in-action signing).

Action also runs an LLM safety check on text posts (via OpenRouter) that returns `{ safe, isAdult, lang }`. The `lang` field (ISO 639-1 code, e.g. "en", "ja") is stored in the IPFS metadata as `language`. Sponsor PKP broadcasts `PostsV1.postFor()` on MegaETH.

### Post Translate (EIP-191)
```
message = `heaven:translate-post:${postId}:${textHash}:${targetLang}:${timestamp}:${nonce}`
```
`textHash` = SHA-256 of original post text. `targetLang` = ISO 639-1 code (e.g. "ja"). Action verifies signature, calls LLM for translation, then sponsor PKP broadcasts `EngagementV2.translateFor()` on MegaETH. Translation stored as event only (no storage cost).

### Lyrics Translate (EIP-191)
```
message = `heaven:translate:${lyricsHash}:${sourceLanguage}:${sortedLangs}:${timestamp}:${nonce}`
```
Languages are sorted alphabetically before joining with commas.

### Story Registration (EIP-712)
```
domain = { name: "Heaven Song Registration", version: "1", chainId: 1315 }
types = { RegisterSong: [recipient, ipMetadataHash, nftMetadataHash, commercialRevShare, defaultMintingFee, timestamp, nonce] }
```
Action verifies recovered address matches recipient. Prevents sponsor PKP abuse.

### Scrobble Submit V3 (RETIRED — replaced by AA/ScrobbleV4)
```
message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`
```
Scrobbles now use ERC-4337 Account Abstraction via `aa-client.ts` → ScrobbleV4 contract. The V3 Lit Action is no longer called from the frontend. Signature scheme documented here for reference only.

### Playlist v1 (EIP-191)
```
create:     heaven:playlist:create:${payloadHash}:${timestamp}:${nonce}
setTracks:  heaven:playlist:setTracks:${playlistId}:${payloadHash}:${timestamp}:${nonce}
updateMeta: heaven:playlist:updateMeta:${playlistId}:${payloadHash}:${timestamp}:${nonce}
delete:     heaven:playlist:delete:${playlistId}:${timestamp}:${nonce}
```
`payloadHash` = SHA-256 of `JSON.stringify(payload)` where payload varies by operation. `nonce` = on-chain `PlaylistV1.userNonces(user)` (monotonic, consumed via `consumeNonce()` for replay protection). Action verifies signature matches user PKP address, then sponsor PKP broadcasts to PlaylistV1 on MegaETH (chain 6343). Contract at `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329`.

### Heaven Claim Name (EIP-191)
```
message = `heaven:register:${label}:${userAddress}:${timestamp}:${nonce}`
```
Action verifies signature, checks name availability on RegistryV1, then sponsor PKP broadcasts `registerFor()` on MegaETH (chain 6343). Contract at `0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2`.

### Heaven Set Profile (EIP-191)
```
message = `heaven:profile:${user}:${profileHash}:${nonce}`
```
`profileHash` = `keccak256(abi.encode(profileInput))`. Action verifies signature matches user, checks on-chain nonce, then sponsor PKP broadcasts `upsertProfileFor(user, profileInput, signature)` on MegaETH (chain 6343). Contract nonce provides replay protection. ProfileV2 at `0xa31545D33f6d656E62De67fd020A26608d4601E5`.

### Heaven Set Records (EIP-191)
```
single:  heaven:records:${node}:${key}:${valueHash}:${nonce}
batch:   heaven:records-batch:${node}:${payloadHash}:${nonce}
```
`valueHash` = `keccak256(utf8Bytes(value))`. `payloadHash` = `keccak256(abi.encode(string[], string[]))`. Action verifies signature matches name NFT owner, checks on-chain nonce per node, then sponsor PKP broadcasts `setTextFor()` or `setRecordsFor()` on MegaETH (chain 6343). RecordsV1 at `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3`.
