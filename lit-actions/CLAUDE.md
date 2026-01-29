# Lit Actions - Heaven

## Overview

Lit Actions that run on Lit Protocol's decentralized nodes. Used for:
- **Song publish**: Upload audio/preview/cover/metadata to IPFS, align lyrics (ElevenLabs), translate lyrics (OpenRouter) — all in one action with 3 encrypted keys
- **Lyrics translate**: Batch-translate lyrics into multiple target languages in parallel, upload each to IPFS — separate action callable anytime after publish
- **Story IP registration**: Sponsor PKP mints NFT + registers IP Asset + attaches PIL license on Story Protocol (gasless for user)
- **Scrobble submit**: Pin scrobble batch to Filebase IPFS + ScrobbleV1 event on MegaETH via sponsor PKP (decentralized, no Worker needed)
- **Heaven claim name**: Sponsor PKP claims a `.heaven` name on MegaETH on behalf of user (gasless). EIP-191 sig verification.
- **Heaven set profile**: Sponsor PKP writes user's on-chain profile to ProfileV1 on MegaETH (gasless). EIP-191 sig + nonce replay protection.

## Status

| Action | File | Status | CID |
|--------|------|--------|-----|
| Song Publish | `actions/song-publish-v1.js` | **Working** | `QmePbtjs...` |
| Lyrics Translate | `actions/lyrics-translate-v1.js` | **Working** | `QmUrbZY5...` |
| Avatar Upload | `actions/avatar-upload-v1.js` | **Working** | `QmeA1zpz...` |
| Story Register Sponsor | `actions/story-register-sponsor-v1.js` | **Working** | `QmcRrDj9...` |
| Scrobble Submit | `actions/scrobble-submit-v1.js` | **Working** | `QmfLzRcY...` |
| Heaven Claim Name | `actions/heaven-claim-name-v1.js` | **Working** | (inline) |
| Heaven Set Profile | `actions/heaven-set-profile-v1.js` | **Working** | (inline) |

## TODO

### Immediate
- [x] Deploy own SPG NFT collection with `isPublicMinting: true` → `0xb1764abf89e6a151ea27824612145ef89ed70a73`
- [x] Implement license token mint (Tx #2) in story-register-sponsor to force royalty vault deployment
- [x] Combined song-upload + lyrics-alignment + translate-lyrics into `song-publish-v1.js`

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
| ScrobbleV1 | `0x8fF05D1Ba81542d7bE2B79d6912C1D65F339dE0e` |

## Subgraph (Goldsky)

| | Value |
|--|-------|
| Endpoint | `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/1.0.0/gn` |
| Network | `megaeth-testnet-v2` (Goldsky identifier) |
| Indexes | `ScrobbleBatch` events from ScrobbleV1 contract |

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
bun scripts/setup.ts heavenClaimName       # Deploy heaven claim name action
bun scripts/setup.ts heavenSetProfile      # Deploy heaven set profile action
bun scripts/deploy-spg-nft.ts             # Deploy own SPG NFT collection
bun scripts/verify.ts                      # Verify all actions configured

# Tests
bun tests/song-publish.test.ts             # Test song publish (upload + align + translate)
bun tests/lyrics-translate.test.ts         # Test batch lyrics translation
bun tests/story-register-sponsor.test.ts   # Test Story registration (real broadcast)
bun tests/story-register-sponsor.test.ts --dry-run  # Dry run (sign only, no broadcast)
bun tests/scrobble-submit.test.ts          # Test scrobble submit (pin + MegaETH event)
bun tests/heaven-claim-name.test.ts        # Test .heaven name claim (MegaETH broadcast)
bun tests/heaven-set-profile.test.ts       # Test profile write (MegaETH broadcast)
bun tests/heaven-set-profile.test.ts --dry-run  # Dry run (sign only, no broadcast)
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
│   ├── scrobble-submit-v1.js          # Pin scrobble batch to IPFS + ScrobbleV1 event on MegaETH
│   ├── heaven-claim-name-v1.js        # Gasless .heaven name claim on MegaETH via sponsor PKP
│   └── heaven-set-profile-v1.js       # Gasless profile write to ProfileV1 on MegaETH via sponsor PKP
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
│   ├── heaven-claim-name.test.ts      # E2E test for .heaven name claim
│   ├── heaven-set-profile.test.ts     # E2E test for profile write
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

### Scrobble Submit (EIP-191)
```
message = `heaven:scrobble:${batchHash}:${timestamp}:${nonce}`
```
`batchHash` is SHA-256 of the full batch JSON (version 4, includes normalized tracks with optional ipId/isrc). Action verifies signature, pins to Filebase IPFS, then sponsor PKP broadcasts `ScrobbleV1.submitBatch()` on MegaETH (chain 6343). Contract at `0x8fF05D1Ba81542d7bE2B79d6912C1D65F339dE0e`.

### Heaven Claim Name (EIP-191)
```
message = `heaven:register:${label}:${userAddress}:${timestamp}:${nonce}`
```
Action verifies signature, checks name availability on RegistryV1, then sponsor PKP broadcasts `registerFor()` on MegaETH (chain 6343). Contract at `0x61CAed8296a2eF78eCf9DCa5eDf3C44469c6b1E2`.

### Heaven Set Profile (EIP-191)
```
message = `heaven:profile:${user}:${profileHash}:${nonce}`
```
`profileHash` = `keccak256(abi.encode(profileInput))`. Action verifies signature matches user, checks on-chain nonce, then sponsor PKP broadcasts `upsertProfileFor(user, profileInput, signature)` on MegaETH (chain 6343). Contract nonce provides replay protection. ProfileV1 at `0x0A6563122cB3515ff678A918B5F31da9b1391EA3`.
