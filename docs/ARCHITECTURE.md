# Heaven Architecture: Songs, Playlists & Content

## Overview

Heaven is a music platform where artists upload songs, users create playlists, and TikTok-style feed videos showcase songs. Songs are registered as IP Assets on Story Protocol, which handles licensing, royalties, and copyright disputes. Audio and metadata are stored on Filebase/IPFS.

**Scope:** Testnet-first (Story Aeneid). No song encryption or paywalling in v1 - all songs are publicly accessible. Copyright enforcement is handled by Story Protocol's dispute module.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chain | Story L1 (Aeneid testnet) | IP registry, licensing, royalties, disputes built-in |
| Song NFTs | Story SPG NFT collection | Each song = ERC-721 → IP Asset |
| Licensing | PIL Commercial Remix flavor | Artists set rev share + minting fee |
| Disputes | Story Dispute Module | Artist-to-artist, platform not involved |
| Song storage | Filebase/IPFS | Artist-subsidized, sovereign CID pinning |
| Video storage | Filebase/IPFS | Platform-managed initially |
| API key protection | Lit Protocol (Naga devnet to start) | Encrypted Filebase/ElevenLabs/OpenRouter keys in Lit Actions |
| Preview generation | Client-side (WASM) | Avoid backend dependency |
| Payment/royalty token | WIP (`0x1514...0000`) | Whitelisted by Story's Royalty Module |
| Scrobble submission | User-signed, client-batched | Platform batches client-side, user pays gas |
| IPFS URIs | `ipfs://<CID>` canonical | Resolve to gateway at display time |
| Playback | Controlled IPFS gateway + fallbacks | HTTP range requests for streaming |
| Derivatives (v1) | PIL Commercial Remix attached, UI disabled | Derivative registration not surfaced in v1 |
| IP Account / meta-tx | Story ERC-6551 IP Account | Not used in v1; escape hatch for relayed/sponsored gas flows via `executeWithSig` |

---

## What Story Protocol Gives Us

No custom registry contract needed. Story provides:

| Feature | Story Module | Our Custom Code |
|---------|-------------|-----------------|
| Song registration | IP Asset Registry | None - use SDK |
| Ownership NFT | SPG NFT Collection | Create one collection |
| License terms | Licensing Module + PIL | Attach on registration |
| Revenue splits | Royalty Module | Configure rev share % |
| Copyright disputes | Dispute Module | None - built-in |
| Derivative tracking | Licensing Module | None - built-in |

**We only write custom contracts for:** PlaylistRegistry, ScrobbleRegistry (simple event emitters on Story).

---

## Data Models

### 1. Song (Story IP Asset + IPFS Metadata)

Three separate JSON blobs are uploaded to IPFS. Each gets its own CID.

```typescript
// --- 1. Story Registration (returned by SDK) ---

// Created via client.ipAsset.registerIpAsset()
interface SongRegistration {
  ipId: Address               // Story IP Asset ID (returned by registration)
  nftContract: Address        // SPG NFT collection address
  tokenId: bigint             // ERC-721 token ID
  uploader: Address           // Artist's wallet/PKP address
  licenseTermsId: bigint      // Attached PIL terms ID
}

// --- 2. Song Metadata (Heaven app schema) → songMetadataCID ---

// Our app-specific metadata. Not consumed by Story directly.
// Referenced from IPA metadata via attributes.
interface SongMetadata {
  version: '1.0.0'

  // Basic info
  title: string
  artist: string
  album?: string
  genre?: string[]
  duration: number            // milliseconds
  explicit?: boolean          // Content flag
  isAI?: boolean              // AI-generated content flag

  // Assets (use ipfs:// URIs; resolve to gateway at display time)
  audio: AssetRef             // Full song
  preview: AssetRef           // ~10-second preview
  cover: AssetRef             // Cover image

  // Lyrics with karaoke timing
  lyrics: LyricsData

  // Raw ElevenLabs alignment output (for reprocessing)
  rawAlignment?: {
    words: Array<{ text: string; start: number; end: number; loss: number }>
    characters?: Array<{ text: string; start: number; end: number }>
    loss: number
  }

  // Translations (auto-generated via OpenRouter)
  translations: {
    [langCode: string]: TranslationData
  }

  // Timestamps
  createdAt: string           // ISO 8601
  alignmentVersion: string    // 'elevenlabs-forced-v1'
}

interface AssetRef {
  uri: string                 // ipfs://<CID> (canonical)
  hash: string                // SHA-256 hex
  mimeType: string            // e.g., 'audio/mpeg', 'image/jpeg'
  byteLength: number          // File size in bytes
}

// --- 3. IPA Metadata (Story Protocol standard) → ipaMetadataCID ---

// See: https://docs.story.foundation/concepts/ip-asset/ipa-metadata-standard
interface IPAMetadata {
  title: string
  description: string
  createdAt: string           // ISO 8601

  // Cover image
  image: string               // ipfs://<coverCID>
  imageHash: string           // SHA-256 of cover image (hex, 0x-prefixed)

  // Media (used by Story for infringement checking)
  // NOTE: Use HTTPS gateway URL we control (e.g. https://heaven.mypinata.cloud/ipfs/<CID>)
  // so Story's infringement workflows can reliably fetch it.
  // Canonical ipfs:// URI stored in SongMetadata and attributes.
  mediaUrl: string            // https://<gateway>/ipfs/<audioCID>
  mediaHash: string           // SHA-256 of audio file (hex, 0x-prefixed)
  mediaType: string             // Actual MIME type of uploaded media (e.g. 'audio/mpeg', 'audio/wav')

  creators: Array<{
    name: string
    address: Address
    contributionPercent: number  // Must sum to 100 across all creators
    description?: string        // Optional: role description (e.g. "Vocalist", "Producer")
    socialMedia?: Array<{       // Optional: improves ecosystem attribution display
      platform: string
      url: string
    }>
  }>
  attributes: Array<{
    key: string
    value: string
  }>
  // Heaven-specific attributes include:
  // { key: 'songMetadataURI', value: 'ipfs://<songMetadataCID>' }
  // { key: 'previewURI', value: 'ipfs://<previewCID>' }
  // { key: 'audioURI', value: 'ipfs://<audioCID>' }  (canonical IPFS URI)
  // { key: 'duration', value: '234000' }
  // { key: 'genre', value: 'pop' }
}

// --- 4. NFT Metadata (ERC-721 standard) → nftMetadataCID ---

// Standard OpenSea / ERC-721 metadata
interface NFTMetadata {
  name: string                // Song title
  description: string         // "Song by {artist} on Heaven"
  image: string               // ipfs://<coverCID>
  animation_url?: string      // ipfs://<audioCID> (for audio NFTs)
  attributes: Array<{
    trait_type: string
    value: string | number
  }>
  // Attributes: genre, duration, artist, etc.
}

interface LyricsData {
  fullText: string            // Plain text lyrics (user-provided)
  language: string            // Original language code
  lines: LyricLine[]
}

interface LyricLine {
  index: number
  text: string
  startMs: number
  endMs: number
  sectionMarker?: string      // '[Chorus]', '[Verse 1]', etc.
  words: WordTiming[]
}

interface WordTiming {
  text: string
  startMs: number
  endMs: number
}

interface TranslationData {
  languageCode: string
  languageName: string
  model: string               // 'gemini-2.5-flash', etc.
  lines: Array<{
    index: number
    text: string
  }>
  generatedAt: string
}
```

### 2. Playlist (Custom Contract + IPFS)

```typescript
// PlaylistRegistry on Story (simple event emitter)
interface PlaylistCreated {
  playlistId: bytes32
  owner: address
  metadataCID: string
  isPublic: boolean
  timestamp: uint256
}

interface PlaylistUpdated {
  playlistId: bytes32
  metadataCID: string
  timestamp: uint256
}

// Stored on IPFS/Filebase
interface PlaylistMetadata {
  version: '1.0.0'
  title: string
  description?: string
  coverCID?: string
  songs: Address[]            // Array of ipIds (Story IP Asset addresses)
  isPublic: boolean
  createdAt: string
  updatedAt: string
}
```

### 3. Feed Video (Platform-Managed)

```typescript
// Platform-managed, stored on Filebase/IPFS
// Indexed off-chain (no contract needed for v1)
interface FeedVideo {
  videoId: string
  videoCID: string            // IPFS CID of video
  songIpId: Address           // Associated song's Story IP Asset ID
  creator: Address
  thumbnailCID?: string
  caption?: string
  createdAt: number
}
```

### 4. Scrobble (Batched On-Chain)

```typescript
// ScrobbleRegistry on Story (event emitter only)
interface ScrobbleBatch {
  user: address
  songIpIds: Address[]        // Story IP Asset IDs
  timestamps: uint256[]
  durations: uint256[]        // milliseconds listened
}
```

---

## Smart Contracts (Story L1)

We only need two simple contracts. Everything else is Story Protocol.

### PlaylistRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PlaylistRegistry {
    struct Playlist {
        address owner;
        string metadataCID;
        bool isPublic;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => Playlist) public playlists;

    event PlaylistCreated(bytes32 indexed playlistId, address indexed owner, string metadataCID, bool isPublic);
    event PlaylistUpdated(bytes32 indexed playlistId, string metadataCID);

    function createPlaylist(string calldata metadataCID, bool isPublic) external returns (bytes32) {
        // NOTE: If stable IDs needed later, switch to (owner, nonce) scheme
        bytes32 id = keccak256(abi.encodePacked(msg.sender, metadataCID, block.timestamp));
        playlists[id] = Playlist(msg.sender, metadataCID, isPublic, block.timestamp, block.timestamp);
        emit PlaylistCreated(id, msg.sender, metadataCID, isPublic);
        return id;
    }

    function updatePlaylist(bytes32 id, string calldata metadataCID) external {
        require(playlists[id].owner == msg.sender, "Not owner");
        playlists[id].metadataCID = metadataCID;
        playlists[id].updatedAt = block.timestamp;
        emit PlaylistUpdated(id, metadataCID);
    }
}
```

### ScrobbleRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ScrobbleRegistry {
    event ScrobbleBatchSubmitted(address indexed user, address[] songIpIds, uint256[] timestamps, uint256[] durations);

    uint256 public constant MAX_BATCH_SIZE = 50;

    function submitBatch(address[] calldata songIpIds, uint256[] calldata timestamps, uint256[] calldata durations) external {
        require(songIpIds.length == timestamps.length && songIpIds.length == durations.length, "Length mismatch");
        require(songIpIds.length <= MAX_BATCH_SIZE, "Batch too large");
        emit ScrobbleBatchSubmitted(msg.sender, songIpIds, timestamps, durations);
    }
}
```

---

## Lit Actions

Lit Actions protect API keys (Filebase, ElevenLabs, OpenRouter). All actions are CID-locked with ACC restricting to our platform PKP.

### Gating & Abuse Prevention

Every Lit Action validates caller authorization before doing work:

```javascript
// Common validation pattern
// 1. Timestamp freshness (reject requests older than 5 minutes)
// 2. Verify EIP-191 signature over full payload hash (prevents replay + param swapping)
// 3. File size limits: Audio max 50MB, Preview max 5MB, Cover max 5MB, Metadata max 1MB
```

**Protections:**
- ACC restricts Filebase/ElevenLabs/OpenRouter key decryption to platform PKP only
- Rate limiting by user address (enforced at app layer before calling Lit Action)
- Content-Type validation on fetched responses before upload
- All external I/O runs in `Lit.Actions.runOnce()` for single-node execution

### 1. Song Publish Action (Combined)

**Purpose:** Upload audio + preview + cover + 3 metadata JSONs to Filebase IPFS, run ElevenLabs forced alignment, translate lyrics via OpenRouter — all in one action.

**File:** `lit-actions/actions/song-publish-v1.js`

**Parameters:**
```javascript
{
  userPkpPublicKey,     // User's PKP public key (derives address)
  audioUrl,             // Temporary URL to audio file
  previewUrl,           // Temporary URL to ~10s preview
  coverUrl,             // Temporary URL to cover image
  songMetadataJson,     // SongMetadata JSON string (Heaven app schema)
  ipaMetadataJson,      // IPA Metadata JSON string (Story standard)
  nftMetadataJson,      // NFT Metadata JSON string (ERC-721 standard)
  signature,            // EIP-191 signature over content hashes
  timestamp,
  nonce,
  lyricsText,           // Plain text lyrics for alignment + translation
  sourceLanguage,       // e.g. "en"
  targetLanguage,       // e.g. "ja"
  // Encrypted API keys (or plaintext for dev)
  filebaseEncryptedKey, filebasePlaintextKey,
  elevenlabsEncryptedKey, elevenlabsPlaintextKey,
  openrouterEncryptedKey, openrouterPlaintextKey,
  translationModel,     // Optional, defaults to gemini-2.5-flash-lite
}
```

**Signature (EIP-191):**
```
heaven:publish:${audioHash}:${previewHash}:${coverHash}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}
```
All 7 content hashes (audio, preview, cover, 3x metadata, lyrics) plus language params and nonce are authenticated. Action fetches content, re-computes SHA-256 hashes, and verifies the recovered address matches the user's PKP.

**Steps (all in single action):**
1. Validate timestamp freshness (5 min window)
2. Fetch audio/preview/cover, compute SHA-256 hashes
3. Verify EIP-191 signature binds all content hashes
4. Decrypt 3 API keys (Filebase, ElevenLabs, OpenRouter)
5. Upload 6 files to Filebase IPFS (audio, preview, cover, 3x metadata)
6. Call ElevenLabs forced alignment API → word-level timestamps
7. Parse alignment into structured lines with character-level timing (fixes intro-stretched words)
8. Call OpenRouter for lyrics translation
9. Upload alignment + translation JSON to IPFS (2 more files)

**Returns:**
```javascript
{
  success: true,
  audioCID, previewCID, coverCID,
  songMetadataCID, ipaMetadataCID, nftMetadataCID,
  alignmentCID, translationCID,
  alignment: { lines: [{ words: [{ text, startMs, endMs, characters }] }] },
  translation: { lines: [...] }
}
```

### 2. Lyrics Translate Action (Batch)

**Purpose:** Batch-translate lyrics into multiple target languages in parallel, upload each to IPFS. Callable anytime after publish to add more languages.

**File:** `lit-actions/actions/lyrics-translate-v1.js`

**Signature (EIP-191):**
```
heaven:translate:${lyricsHash}:${sourceLanguage}:${sortedLangs}:${timestamp}:${nonce}
```
Languages sorted alphabetically before joining with commas. Max 10 target languages per call.

**Returns:** Map of `{ languageCode: CID }` for each successfully translated language.

### 3. Story Register Sponsor Action (Gasless)

**Purpose:** Sponsor PKP mints SPG NFT, registers as IP Asset, attaches PIL Commercial Remix terms on Story Aeneid. User pays no gas.

**File:** `lit-actions/actions/story-register-sponsor-v1.js`

**Signature (EIP-712):**
```javascript
domain = { name: "Heaven Song Registration", version: "1", chainId: 1315 }
types = {
  RegisterSong: [
    { name: "recipient", type: "address" },
    { name: "ipMetadataHash", type: "bytes32" },
    { name: "nftMetadataHash", type: "bytes32" },
    { name: "commercialRevShare", type: "uint32" },
    { name: "defaultMintingFee", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ]
}
```

**Steps:**
1. Verify EIP-712 signature (binds metadata hashes + recipient)
2. Encode `mintAndRegisterIpAndAttachPILTerms` calldata
3. Sponsor PKP signs + broadcasts Tx #1 (register IP + attach license)
4. Query registries to extract ipId, tokenId, licenseTermsIds
5. Mint 1 license token (Tx #2) to force royalty vault deployment

**Returns:**
```javascript
{ success: true, ipId, tokenId, licenseTermsIds, txHash }
```

---

## User Flows

### Artist Publishes Song (Single UI Step)

The user clicks "Publish" once. Frontend chains two Lit Actions sequentially under one loading state:

```
1. Artist provides: audio file + lyrics text + cover image
2. Client extracts ~10-second preview (WASM, client-side)
3. Client builds 3 metadata JSONs (canonical/stable-key-order stringify):
   a. SongMetadata (Heaven app schema: lyrics, asset refs with ipfs:// URIs)
   b. IPAMetadata (Story standard: title, creators, mediaUrl, mediaHash, mediaType)
   c. NFTMetadata (ERC-721: name, description, image, animation_url, traits)
4. Client computes SHA-256 hashes of all 7 content items
5. User signs EIP-191 message: heaven:publish:${7 hashes}:${langs}:${timestamp}:${nonce}

--- Lit Action: song-publish-v1 ---
6. Uploads audio, preview, cover, 3x metadata to IPFS → 6 CIDs
7. Runs ElevenLabs forced alignment → alignment CID
8. Runs OpenRouter translation → translation CID
9. Returns 8 CIDs + parsed alignment + translation data

--- Lit Action: story-register-sponsor-v1 ---
10. User signs EIP-712 (binds recipient + metadata hashes + rev share)
11. Sponsor PKP mints NFT + registers IP Asset + attaches PIL license (gasless)
12. Mints 1 license token → forces royalty vault deployment
13. Returns ipId, tokenId, licenseTermsIds

14. Song appears in app (indexed via Story subgraph)
```

**Note:** `WIP_TOKEN_ADDRESS` = `0x1514000000000000000000000000000000000000` (Story's whitelisted revenue token on both Aeneid testnet and mainnet).

### User Creates Playlist

```
1. User selects songs (by ipId)
2. Frontend builds PlaylistMetadata JSON
3. Saved to IndexedDB immediately (local-first)
4. Background sync:
   a. Upload metadata to IPFS → metadataCID
   b. Sign tx → PlaylistRegistry.createPlaylist(metadataCID, isPublic)
   c. Subgraph indexes PlaylistCreated
5. On edit: repeat with PlaylistRegistry.updatePlaylist()
```

### Feed Video + Song Display

```
1. User scrolls vertical feed
2. Video plays (platform-managed, Filebase/IPFS)
3. Audio: song preview (~10s) plays with video
4. Right sidebar shows:
   - Song title, artist, cover art
   - Karaoke-style lyrics (synced within preview range)
   - "Play Full Song" button
   - "Add to Playlist" button
   - License info (PIL terms)
5. User taps play → streams full audio from IPFS
```

### Copyright Dispute

```
1. Artist discovers unauthorized use of their song
2. Artist opens dispute via Story Protocol Dispute Module (requires staking + evidence)
3. Dispute is resolved on-chain (artist-to-artist, platform not involved)
4. If upheld: infringing IP Asset is tagged/frozen on-chain
   - Tagged IPs can no longer earn revenue or create derivatives via the protocol
5. App must index dispute/tag state and enforce protocol outcomes:
   - Label disputed content in feed, search, playlists
   - Disable "tip" and derivative actions for tagged IPs (protocol enforces this)
   - Optionally block playback (UX decision — not enforced by Story)
   - Handle derivative graph impacts (if parent is tagged, derivatives affected)
```

---

## Storage Summary

| Content | Who Pays | Where |
|---------|----------|-------|
| Song audio | Artist (FIL/USDFC subsidy) | Filebase/IPFS |
| Song preview (~10s) | Artist (subsidized) | Filebase/IPFS |
| Song metadata | Artist (subsidized) | Filebase/IPFS |
| Cover images | Artist (subsidized) | Filebase/IPFS |
| Lyrics/translations | Artist (subsidized) | Filebase/IPFS |
| Feed videos | Platform | Filebase/IPFS |
| Playlist metadata | Platform | Filebase/IPFS |
| Scrobbles | Platform (batched) | On-chain events only |

Artists receive small FIL + USDFC grants to self-host content via Filebase. Users can re-pin any CID with their own funds for sovereign control.

---

## Implementation Order

1. **Phase 1: Story Integration + Upload**
   - [ ] Create SPG NFT collection on Story Aeneid
   - [ ] Song Upload Lit Action (Filebase)
   - [ ] Story SDK integration (registerIpAsset + PIL terms)
   - [ ] Frontend upload form
   - [ ] Subgraph for Story events

2. **Phase 2: Lyrics & Karaoke**
   - [ ] Lyrics Alignment Lit Action (ElevenLabs)
   - [ ] Translation Lit Action (OpenRouter)
   - [ ] Karaoke display component (line + word highlighting)
   - [ ] Lyrics sync during playback

3. **Phase 3: Playlists**
   - [ ] PlaylistRegistry contract (Story)
   - [ ] Local-first IndexedDB (existing @heaven/core code)
   - [ ] Background sync to IPFS
   - [ ] Playlist UI

4. **Phase 4: Feed Videos**
   - [ ] Video upload (platform-managed Filebase)
   - [ ] Feed component with song sidebar
   - [ ] Song-video association
   - [ ] Right sidebar: metadata + lyrics + play

5. **Phase 5: Scrobbles**
   - [ ] ScrobbleRegistry contract (Story)
   - [ ] Client-side batching logic
   - [ ] Listening history UI

---

## Known Constraints & Gotchas

### Canonical JSON serialization
- All metadata JSON must use **stable key-order stringify** (e.g. `JSON.stringify(obj, Object.keys(obj).sort())` or a canonical JSON library).
- Hash the exact bytes you upload. Client and Lit Action must use the same serialization.
- Story's SDK hashes with `sha256(JSON.stringify(metadata))` — match that format.

### Hash / URL consistency
- IPA `mediaUrl` (HTTPS gateway) and SongMetadata `audio.uri` (`ipfs://CID`) must resolve to identical bytes.
- The `mediaHash` stored in IPA metadata must match what Story fetches from `mediaUrl`.
- **Hard invariant test:** after upload, fetch `mediaUrl` from an external environment and verify `sha256(fetchedBytes) === mediaHash`.

### Tipping = `payRoyaltyOnBehalf`
- Tips use Story's Royalty Module (`payRoyaltyOnBehalf`) so upstream splits propagate automatically through derivative chains.
- Off-protocol tips would bypass splits — don't do this.

### Derivatives are permissionless at protocol level
- Attaching PIL Commercial Remix means anyone can mint License Tokens and register derivatives on-chain, regardless of our UI.
- v1 disables derivative UI in Heaven but cannot prevent protocol-level derivative registration. This is expected and fine.

### Royalty token distribution for collaborators
- On vault deployment (triggered by first license mint), the IP Account receives 100% of Royalty Tokens.
- For multi-creator songs, distribute royalty tokens post-trigger according to `creators[].contributionPercent`.

---

## Scrobbling (EAS + Subgraph)

### Overview

Scrobbling tracks music listening activity. Each play is detected client-side, batched, pinned to IPFS, and attested on-chain via EAS on Base Sepolia. No centralized Worker required — the Lit Action handles everything.

### Architecture

```
Client (ScrobbleEngine)
  │  Detects completed listens (50% or 4min threshold)
  │  Batches via ScrobbleQueue (IndexedDB persistence)
  ↓
Lit Action (scrobble-submit-v1)
  │  1. Verify EIP-191 signature over batch hash
  │  2. Normalize tracks (NFKC, strip suffixes, compute track_key)
  │  3. Pin batch JSON v4 to Filebase IPFS → CID
  │  4. Sponsor PKP broadcasts EAS attestation → attestation UID
  ↓
Base Sepolia (EAS)
  │  ScrobbleBatchV1: (uint64 startTs, uint64 endTs, uint32 count, string cid)
  │  Schema: 0x6a31b6c6ed2c423297bd53d6df387d04cf69cecb961eb57f1dfc44ba374d95f0
  ↓
Subgraph (activity-feed)
  │  Indexes Attested events → FeedItem entities
  │  Per-track data lives in the IPFS JSON at CID
  ↓
Trending Service (async)
  │  Fetches batch CIDs, unpacks per-track identifiers
  │  Aggregates by: ipId (best) → isrc (good) → track_key (fallback)
  │  Enriches via ListenBrainz/MusicBrainz API (offline, batch)
```

### ScrobbleEngine (Client-Side)

Port of the Android Kotlin state machine. Located at `packages/core/src/scrobble/engine.ts`.

- **Threshold**: `min(duration × 50%, 240s)`. Unknown duration → 4 minutes.
- **Minimum**: Track must be ≥30s to qualify.
- **State machine**: Tracks play time per session using `performance.now()` (no position dependency, handles seek).
- **Tick**: Call `engine.tick()` every 10-30s to detect threshold while playing.
- **Output**: `ReadyScrobble` with optional `ipId` and `isrc` fields.

### ScrobbleQueue (Client-Side)

Located at `packages/core/src/scrobble/queue.ts`.

- Persists pending scrobbles in IndexedDB (survives page close).
- Auto-flushes at 100 items or every 4 hours.
- Calls the Lit Action submit function on flush.

### Batch JSON (v4)

```typescript
{
  version: 4,
  user: "0x...",           // lowercase PKP address
  startTs: "1706000000",  // earliest playedAt
  endTs: "1706003600",    // latest playedAt
  count: 15,
  tracks: [
    {
      raw: { artist, title, album, duration_ms, playedAt, source },
      normalized: { artist_norm, title_norm, album_norm, duration_s },
      isrc: "USRC11234567" | null,  // from ID3 tags
      ipId: "0x..." | null,         // Story Protocol IP Asset ID (Heaven-published songs)
      track_key: "a1b2c3..."        // SHA-256(normalized_artist + normalized_title)
    }
  ]
}
```

### Signature

```
heaven:scrobble:${sha256(batchJson)}:${timestamp}:${nonce}
```

User signs with PKP (EIP-191). Action re-computes batch hash and verifies.

### Track Identity Resolution

| Source | Identifier | How |
|--------|-----------|-----|
| Heaven library (Story-published) | `ipId` | Client knows ipId from local metadata |
| Local files with ID3 ISRC | `isrc` | Extracted from file metadata |
| External plays (Spotify etc.) | `track_key` | Deterministic hash of normalized artist+title |
| Enrichment (async) | `isrc` via MusicBrainz/ListenBrainz | Trending service looks up offline |

### Trending Aggregation

The mapping table `track_key ↔ isrc ↔ ipId` is populated incrementally:
1. User uploads song → `ipId` created, `track_key` computed from metadata
2. User scrobbles from Spotify → `track_key` matches, `isrc` from MusicBrainz
3. Both link: same song identified across platforms

No synchronous external API calls at submit time. All resolution is async/offline.
