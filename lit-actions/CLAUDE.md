# Lit Actions - Heaven

## Overview

Lit Actions that run on Lit Protocol's decentralized nodes. Used for:
- **Song publish**: Upload audio/preview/cover/metadata to IPFS, align lyrics (ElevenLabs), translate lyrics (OpenRouter) — all in one action with 3 encrypted keys
- **Lyrics translate**: Batch-translate lyrics into multiple target languages in parallel, upload each to IPFS — separate action callable anytime after publish
- **Story IP registration**: Sponsor PKP mints NFT + registers IP Asset + attaches PIL license on Story Protocol (gasless for user)
- **Scrobble submit V3**: Track Registry + Scrobble Events on ScrobbleV3. Registers tracks once (title/artist/album on-chain), scrobbles as cheap event refs. Single `registerAndScrobbleBatch()` tx. Checks `isRegistered()` to skip re-registration. Normalized IDs + pretty display strings. **Cover upload**: if track has `coverImage` (base64), uploads to Filebase via encrypted key, sets coverCid on-chain via `setTrackCoverBatch()`. Encrypted Filebase key (`filebase_covers_key`) decrypted at runtime.
- **Playlist v1**: Create/update/delete event-sourced playlists on PlaylistV1. Registers missing tracks in ScrobbleV3 automatically. Supports coverCid for playlist artwork. Sponsor PKP pays gas. EIP-191 sig verification.
- **Heaven claim name**: Sponsor PKP claims a `.heaven` name on MegaETH on behalf of user (gasless). EIP-191 sig verification.
- **Heaven set profile**: Sponsor PKP writes user's on-chain profile to ProfileV1 on MegaETH (gasless). EIP-191 sig + nonce replay protection.
- **Heaven set records**: Sponsor PKP sets ENS-compatible text records on RecordsV1 on MegaETH (gasless). Single or batch records. EIP-191 sig + per-node nonce replay protection.
- **Post create v1**: Full photo post pipeline — image upload (resize/watermark via fal.ai), AI safety check (OpenRouter multimodal), IPFS upload, optional Story IP registration, MegaETH mirror. Encrypted keys: filebase, openrouter, fal.
- **Post register v1**: Unified post registration for text AND photo posts. Text posts: AI safety check + metadata upload + MegaETH mirror (no Story). Photo posts: metadata upload + Story IP + MegaETH mirror. Supports attribution for shared content.
- **Photo reveal v1**: 24h pay-per-view photo reveals. Verifies payment window (EngagementV2), checks nullifier ban, computes deterministic watermark code, calls heaven-images service for multi-layer watermarks, logs reveal on-chain. Owner bypass (free, no watermark).

## Status

| Action | File | Status | CID |
|--------|------|--------|-----|
| Song Publish | `actions/song-publish-v1.js` | **Working** | `QmePbtjs...` |
| Lyrics Translate | `actions/lyrics-translate-v1.js` | **Working** | `QmUrbZY5...` |
| Avatar Upload | `actions/avatar-upload-v1.js` | **Working** | `QmeA1zpz...` |
| Story Register Sponsor | `actions/story-register-sponsor-v1.js` | **Working** | `QmcRrDj9...` |
| Scrobble Submit V3 | `actions/scrobble-submit-v3.js` | **Working** | `QmNzCDJQ...` |
| Playlist v1 | `actions/playlist-v1.js` | **Working** | `QmdpkcmC...` |
| Heaven Claim Name | `actions/heaven-claim-name-v1.js` | **Working** | `QmVx1YrP...` |
| Heaven Set Profile | `actions/heaven-set-profile-v1.js` | **Working** | `QmYLHf2Q...` |
| Heaven Set Records | `actions/heaven-set-records-v1.js` | **Working** | `QmNTJXB8...` |
| Post Create v1 | `actions/post-create-v1.js` | **Working** | `QmQKXuRW...` |
| Post Register v1 | `actions/post-register-v1.js` | **Working** | `QmeVChS4...` |
| Photo Reveal v1 | `actions/photo-reveal-v1.js` | **Working** | `QmPnDcmp...` |

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
| ProfileV1 | `0x0A6563122cB3515ff678A918B5F31da9b1391EA3` |
| RegistryV1 | `0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2` |
| RecordsV1 | `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3` |
| PostsV1 | `0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6` |
| EngagementV2 | `0xAF769d204e51b64D282083Eb0493F6f37cd93138` |

## Subgraph (Goldsky)

| | Value |
|--|-------|
| Endpoint (v6) | `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/6.0.0/gn` |
| Network | `megaeth-testnet-v2` (Goldsky identifier) |
| Indexes | ScrobbleV3 `TrackRegistered` + `TrackCoverSet` + `Scrobbled` events |

Deploy: `goldsky subgraph deploy dotheaven-activity/<version> --path .` (from `subgraphs/activity-feed/`)

## PKP Info

| | Address |
|--|---------|
| Sponsor PKP | `0x089fc7801D8f7D487765343a7946b1b97A7d29D4` |
| Deployer EOA | `0x9456aec64179FE39a1d0a681de7613d5955E75D3` |

## Commands

```bash
# Setup & deploy
bun scripts/mint-pkp.ts                    # Mint new PKP
bun scripts/setup.ts songPublish            # Deploy song publish action (upload + align + translate)
bun scripts/setup.ts lyricsTranslate       # Deploy lyrics translate action (batch multi-language)
bun scripts/setup.ts storyRegisterSponsor  # Deploy story register action
bun scripts/setup.ts scrobbleSubmitV3      # Deploy scrobble submit V3 action
bun scripts/setup.ts playlistV1            # Deploy playlist v1 action
bun scripts/setup.ts heavenClaimName       # Deploy heaven claim name action
bun scripts/setup.ts heavenSetProfile      # Deploy heaven set profile action
bun scripts/setup.ts heavenSetRecords      # Deploy heaven set records action
bun scripts/deploy-spg-nft.ts             # Deploy own SPG NFT collection
bun scripts/verify.ts                      # Verify all actions configured

# Tests
bun tests/song-publish.test.ts             # Test song publish (upload + align + translate)
bun tests/lyrics-translate.test.ts         # Test batch lyrics translation
bun tests/story-register-sponsor.test.ts   # Test Story registration (real broadcast)
bun tests/story-register-sponsor.test.ts --dry-run  # Dry run (sign only, no broadcast)
bun tests/scrobble-submit-v3.test.ts       # Test scrobble submit V3 (track registry + scrobble events)
bun tests/playlist-v1.test.ts               # Test playlist CRUD (create/setTracks/updateMeta/delete)
bun tests/heaven-claim-name.test.ts        # Test .heaven name claim (MegaETH broadcast)
bun tests/heaven-set-profile.test.ts       # Test profile write (MegaETH broadcast)
bun tests/heaven-set-profile.test.ts --dry-run  # Dry run (sign only, no broadcast)
bun tests/heaven-set-records.test.ts       # Test records write (claims name + sets text record)
```

## Updating an Action

1. Edit `actions/<name>.js`
2. Run `bun scripts/setup.ts <actionName>` (uploads to IPFS, adds PKP permission, re-encrypts keys)
3. New CID saved to `cids/dev.json` automatically

## Environment

`LIT_NETWORK` env var controls which Lit network to use:
- `naga-dev` - Free dev network (default)
- `naga-test` - Testnet (requires tstLPX)

## Files

```
lit-actions/
├── actions/                           # Lit Action source files (plain JS, ethers v5)
│   ├── song-publish-v1.js             # Upload + alignment + translation (combined)
│   ├── lyrics-translate-v1.js         # Batch multi-language translation (parallel)
│   ├── story-register-sponsor-v1.js   # Gasless Story IP registration via sponsor PKP
│   ├── scrobble-submit-v3.js          # Track registry + scrobble events on ScrobbleV3
│   ├── heaven-claim-name-v1.js        # Gasless .heaven name claim on MegaETH via sponsor PKP
│   ├── heaven-set-profile-v1.js       # Gasless profile write to ProfileV1 on MegaETH via sponsor PKP
│   ├── playlist-v1.js                # Event-sourced playlist CRUD on PlaylistV1 via sponsor PKP
│   └── heaven-set-records-v1.js      # Gasless ENS text record writes on RecordsV1 via sponsor PKP
├── scripts/
│   ├── mint-pkp.ts                    # Mint new PKP with EOA ownership
│   ├── setup.ts                       # Deploy action + add permission + encrypt keys
│   ├── deploy-spg-nft.ts             # Deploy SPG NFT collection on Story Aeneid
│   ├── upload-action.ts               # Upload-only (no permission/encryption)
│   ├── encrypt-key.ts                 # Encrypt API keys for action CID
│   ├── add-permission.ts              # Add PKP permission for CID
│   └── verify.ts                      # Verify configuration
├── tests/
│   ├── song-publish.test.ts           # E2E test for song publish (upload + align + translate)
│   ├── lyrics-translate.test.ts       # E2E test for batch lyrics translation
│   ├── story-register-sponsor.test.ts # E2E test for Story registration
│   ├── scrobble-submit-v3.test.ts     # E2E test for scrobble submit V3
│   ├── playlist-v1.test.ts             # E2E test for playlist CRUD (4 operations)
│   ├── heaven-claim-name.test.ts      # E2E test for .heaven name claim
│   ├── heaven-set-profile.test.ts     # E2E test for profile write
│   ├── heaven-set-records.test.ts     # E2E test for records write (claims name + sets text record)
│   └── shared/env.ts                  # Network detection + config loading
├── fixtures/
│   └── test-song.mp3                  # Test audio file
├── config/
│   └── lit-envs.json                  # Network configurations
├── cids/
│   └── dev.json                       # Deployed action CIDs
├── keys/                              # Encrypted API keys (gitignored)
├── output/                            # PKP credentials, SPG NFT deploy output (gitignored)
└── .env                               # Local env vars (gitignored)
```

## Signature Schemes

### Song Publish (EIP-191)
```
message = `heaven:publish:${audioHash}:${previewHash}:${coverHash}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`
```
Action fetches content, re-hashes, verifies signature recovers to user's address. All metadata, lyrics, and language params are authenticated.

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

### Scrobble Submit V3 (EIP-191)
```
message = `heaven:scrobble:${tracksHash}:${timestamp}:${nonce}`
```
`tracksHash` is SHA-256 of `JSON.stringify(tracks)`. Each track has `{ artist, title, playedAt, mbid?, ipId?, album?, coverCid?, coverImage? }`. Action computes `trackId = keccak256(abi.encode(uint8(kind), bytes32(payload)))` per track, checks `isRegistered()`, broadcasts single `registerAndScrobbleBatch()` tx to ScrobbleV3 on MegaETH (chain 6343). Normalized strings for payload derivation, pretty strings stored on-chain. If `coverImage` provided (base64 + contentType), uploads to Filebase S3 (IPFS-pinned), then calls `setTrackCoverBatch()` to set coverCid on-chain. Encrypted Filebase key decrypted via `Lit.Actions.decryptAndCombine`. Contract at `0x144c450cd5B641404EEB5D5eD523399dD94049E0`.

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
`profileHash` = `keccak256(abi.encode(profileInput))`. Action verifies signature matches user, checks on-chain nonce, then sponsor PKP broadcasts `upsertProfileFor(user, profileInput, signature)` on MegaETH (chain 6343). Contract nonce provides replay protection. ProfileV1 at `0x0A6563122cB3515ff678A918B5F31da9b1391EA3`.

### Heaven Set Records (EIP-191)
```
single:  heaven:records:${node}:${key}:${valueHash}:${nonce}
batch:   heaven:records-batch:${node}:${payloadHash}:${nonce}
```
`valueHash` = `keccak256(utf8Bytes(value))`. `payloadHash` = `keccak256(abi.encode(string[], string[]))`. Action verifies signature matches name NFT owner, checks on-chain nonce per node, then sponsor PKP broadcasts `setTextFor()` or `setRecordsFor()` on MegaETH (chain 6343). RecordsV1 at `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3`.
