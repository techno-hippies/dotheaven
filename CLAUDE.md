# Heaven Development Guide

## CRITICAL: Dev Server Rules
**NEVER start, restart, or manage dev servers or Storybook yourself.**
- DO NOT run `bun dev`, `bun storybook`, or any server commands
- DO NOT use `pkill`, `kill`, or attempt to stop/start servers
- DO NOT check server status or try to fix server issues
- The user manages all dev servers - you only write code
- If you see server errors, ignore them and continue with your task

## Tooling
- **Package Manager**: Use `bun` (not npm/yarn/pnpm)
- **Runtime**: Bun for all scripts and dev commands

## Project Structure
```
dotheaven/
├── apps/
│   ├── frontend/          # SolidJS app (web + Tauri desktop)
│   │   ├── src/
│   │   │   ├── components/    # App-specific components
│   │   │   ├── lib/           # Client libraries (xmtp, voice, lit, web3)
│   │   │   ├── pages/         # Route pages
│   │   │   └── providers/     # Context providers (Auth, XMTP, Wallet)
│   │   └── src-tauri/         # Tauri Rust backend (native libxmtp)
│   └── react-native/     # React Native app (Expo, Android)
├── packages/
│   ├── ui/                # Shared UI components + Storybook
│   ├── core/              # Core business logic (playlists, routes)
│   └── platform/          # Platform-specific utilities
├── contracts/
│   ├── megaeth/           # MegaETH contracts (Foundry) — main chain
│   ├── celo/              # Celo Sepolia contracts (Self.xyz verifier)
│   └── base/              # Base contracts (ContentAccessMirror)
├── subgraphs/             # Goldsky subgraph definitions
├── services/
│   ├── aa-gateway/        # AA Gateway (ERC-4337 paymaster + UserOp relay)
│   ├── alto/              # Pimlico Alto bundler (git submodule)
│   ├── heaven-api/        # Cloudflare Worker API (photos, meals, claims, names)
│   ├── heaven-resolver/   # MusicBrainz proxy + image rehosting
│   ├── session-voice/     # Voice rooms (Agora + Durable Objects)
│   └── lit-relayer/       # Lit PKP minting relayer (Vercel)
└── lit-actions/           # Lit Protocol actions
```

## Commands
```bash
bun dev              # Run frontend dev server
bun dev:tauri        # Run Tauri desktop app
bun storybook        # Run Storybook (UI components)
bun check            # Type check all packages
```

## Core Features

### Authentication (Lit Protocol)
- **WebAuthn/Passkey auth** via Lit Protocol PKPs (Programmable Key Pairs)
- User signs in with passkey → gets a PKP wallet address
- PKP can sign messages for XMTP and other services
- See `apps/frontend/src/providers/AuthContext.tsx`

#### Lit Network Switching (naga-dev ↔ naga-test)
Two Lit networks are supported. **Switching is a single env var change:**

```bash
# In apps/frontend/.env:
VITE_LIT_NETWORK=naga-test   # (default) — stable, requires tstLPX tokens
VITE_LIT_NETWORK=naga-dev    # free but less stable (can have 500 errors)
```

**How it works:**
- `config.ts` reads `VITE_LIT_NETWORK` → selects network object, auth service URL
- `action-cids.ts` embeds both CID maps (mirroring `lit-actions/cids/dev.json` and `test.json`) → selects correct CIDs per network
- Every CID is also individually overrideable via `VITE_*_CID` env vars
- Backend scripts use `LIT_NETWORK` env var: `LIT_NETWORK=naga-test bun scripts/setup.ts <action>`
- Relayer (`services/lit-relayer`) reads `LIT_NETWORK` on Vercel

**Per-network infrastructure:**

| | naga-dev | naga-test |
|--|----------|-----------|
| Cost | Free | Requires tstLPX |
| Stability | Flaky (500 errors) | Stable |
| CID file | `lit-actions/cids/dev.json` | `lit-actions/cids/test.json` |
| PKP file | `lit-actions/output/pkp-naga-dev.json` | `lit-actions/output/pkp-naga-test.json` |
| Keys dir | `lit-actions/keys/dev/` | `lit-actions/keys/test/` |
| Sponsor PKP | `0x089fc7801D8f7D487765343a7946b1b97A7d29D4` | `0x7222c04A7C626261D2255Cc40e6Be8BB4Aa8e171` |
| Deployer EOA | `0x9456aec64179FE39a1d0a681de7613d5955E75D3` | (same) |

**naga-test payment management:**
```bash
cd lit-actions
# Check balance
LIT_NETWORK=naga-test bun scripts/check-payment.ts
# Deposit tstLPX (after funding deployer EOA from faucet)
LIT_NETWORK=naga-test bun scripts/deposit-payment.ts 5
# Fund deployer EOA: https://chronicle-yellowstone-faucet.getlit.dev/
# Address: 0x9456aec64179FE39a1d0a681de7613d5955E75D3
```

**After deploying a new action**, update the CID in `action-cids.ts`'s `CID_MAP` for the deployed network to match the value in `lit-actions/cids/*.json`.

**Key files**:
- `apps/frontend/src/lib/lit/config.ts` — network object + auth service URL (reads `VITE_LIT_NETWORK`)
- `apps/frontend/src/lib/lit/action-cids.ts` — dual CID maps + per-CID env overrides
- `apps/frontend/src/lib/lit/signer-pkp.ts` — PKP signer (reads sponsor PKP from config)
- `services/lit-relayer/` — Vercel-deployed relayer (reads `LIT_NETWORK` env var)

### Messaging (XMTP)
- **Peer-to-peer encrypted messaging** via XMTP protocol
- DMs between Ethereum addresses
- Real-time message streaming
- **Dual-target architecture**: platform-aware `XmtpTransport` interface
  - **Web**: `BrowserTransport` using `@xmtp/browser-sdk` with OPFS storage
  - **Tauri**: `TauriTransport` using native libxmtp via Tauri commands (`src-tauri/src/xmtp.rs`)
- Platform selected at runtime via `VITE_PLATFORM` env var + dynamic imports in `factory.ts`
- Tauri backend: signature requests emitted as events, frontend signs via PKP, resolves via command
- **Unread tracking**: Global `streamAllMessages` stream detects incoming peer messages. `activeChat` signal tracks which chat is open. localStorage persists `lastRead` timestamps per peer so unread state survives restarts.
- **Tauri events**: `xmtp://sign-request` (identity signing), `xmtp://message` (per-chat stream), `xmtp://message-all` (global stream for unread)
- See `apps/frontend/src/lib/xmtp/` (transport layer) and `providers/XMTPProvider.tsx`

### AI Chat (Cloudflare Workers)
- **Text chat with AI** via Cloudflare Worker backend
- Auth: wallet signature → JWT token
- Worker URL: `VITE_CHAT_WORKER_URL` env var
- See `apps/frontend/src/pages/AIChatPage.tsx`

### Voice Calls (Agora WebRTC)
- **Real-time voice** with AI via Agora RTC
- Integrated into AI chat page (not a separate route)
- Call state shown in chat header with duration
- See `apps/frontend/src/lib/voice/` and `AIChatPage.tsx`

### Scrobbling (On-chain listening history)
- **ScrobbleEngine** (`packages/core/src/scrobble/engine.ts`): State machine tracking play time per session. Threshold: `min(duration × 50%, 240s)`. Emits `ReadyScrobble` when met
- **ScrobbleService** (`apps/frontend/src/lib/scrobble-service.ts`): Wires engine to AA client (ScrobbleV4). Each scrobble submits a UserOp via the AA gateway immediately (no queue/batch)
- **AA client** (`apps/frontend/src/lib/aa-client.ts`): Builds ERC-4337 UserOps targeting ScrobbleV4. PKP signs `userOpHash`, gateway adds paymaster signature, bundler (Alto) submits to EntryPoint
- **ScrobbleV4 contract**: `0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1` on MegaETH (chain 6343). AA-enabled — `onlyAccountOf(user)` gating via factory-derived SimpleAccount. Stores `uint32 durationSec` per track.
- **ScrobbleV3 contract**: `0x144c450cd5B641404EEB5D5eD523399dD94049E0` on MegaETH (chain 6343). Legacy sponsor-gated version — still deployed, used by playlists Lit Action for track registration
- **Subgraph**: Goldsky `dotheaven-activity/14.0.0` indexes `TrackRegistered` + `TrackCoverSet` + `Scrobbled` + `PostCreated` + `ContentRegistered` + `TranslationAdded` + `Liked` + `Unliked` + `CommentAdded` + `Flagged` + `LyricsTranslationAdded` + `Followed` + `Unfollowed` events from ScrobbleV3, ScrobbleV4, PostsV1, EngagementV2, LyricsEngagementV1, and FollowV1
- **Frontend**: Profile page fetches scrobble history from subgraph, displays verified/unidentified status with cover art
- **Cover art pipeline** (Tauri): Rust extracts cover from audio tags → Tauri reads bytes → base64 sent via AA → cached in local SQLite → displayed via `heaven.myfilebase.com` dedicated gateway with image optimization params
- **Auto-refresh**: After scrobble, `queryClient.invalidateQueries(['scrobbles'])` refreshes profile. Waits for cover TX confirmation before invalidating.
- **MBID extraction**: Rust `music_db.rs` reads MusicBrainz recording ID from tags via lofty
- **IPFS gateway**: `https://heaven.myfilebase.com/ipfs/` (dedicated Filebase gateway) with optimization params (`?img-width=96&img-height=96&img-format=webp&img-quality=80`)
- Three scrobble paths: MBID (MusicBrainz recording), ipId (Story Protocol IP), metadata hash (unidentified)

### Playlists (On-chain via PlaylistV1)
- **PlaylistV1 contract**: `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329` on MegaETH (chain 6343)
- **Event-sourced**: name/coverCid/trackIds stored only in events; contract stores checkpoints (tracksHash, trackCount, version)
- **Replay protection**: On-chain monotonic nonce per user (`userNonces` mapping + `consumeNonce()`)
- **Lit Action**: `playlist-v1.js` — signs EIP-191, registers tracks in ScrobbleV3, then executes playlist op
- **UI sync**: Add-to-playlist uses optimistic trackIds + subgraph polling to avoid “track disappears” during indexing delays.
- **Cover fallback**: Local cover cache is keyed by normalized artist/title and trackId so new playlist entries keep album art even before on-chain coverCid is set.
- **Subgraph**: Goldsky `dotheaven-playlists/1.0.0` indexes PlaylistCreated, PlaylistTracksSet, PlaylistMetaUpdated, PlaylistDeleted
  - API: `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn`

### Identity Verification (Self.xyz)
- **Passport verification** via Self.xyz zero-knowledge proofs
- User scans QR on profile page → Self app verifies passport → proof submitted to Celo
- **SelfProfileVerifier contract**: `0x9F0fFF861b502118336bCf498606fEa664a8DAdA` on Celo Sepolia (11142220)
- **VerificationMirror contract**: `0xb0864603A4d6b62eACB53fbFa32E7665BADCc7Fb` on MegaETH (6343)
- **Stored on-chain**: `verifiedAt` (timestamp), `nationality` (3-letter ISO e.g. "GBR"). No age/DOB — privacy by design.
- **Disclosures requested**: minimumAge 18 (binary gate, proof fails if under 18), nationality
- **Verified data overrides self-reported**: when `verifiedAt > 0`, nationality from the verifier contract overrides ProfileV2 value. Age is always self-reported via ProfileV2.
- **Zero gas for user**: Self app pays Celo gas, sponsor PKP pays MegaETH mirror gas
- **Frontend flow**: "Verify Identity" button next to "Edit Profile" → QR dialog → polls Celo → mirrors to MegaETH → badge shown
- **SDK quirk**: `endpointType` must be `'staging_celo'` (not `'celo-staging'`) in `@selfxyz/sdk-common` v1.0.0
- See `contracts/celo/CLAUDE.md` for full details
- **Key files**:
  - `apps/frontend/src/lib/heaven/verification.ts` — `getVerificationStatus()`, `buildSelfVerifyLink()`, `syncVerificationToMegaEth()`
  - `apps/frontend/src/pages/ProfilePage.tsx` — dialog + polling wiring in `MyProfilePage`
  - `packages/ui/src/composite/profile/verify-identity-dialog.tsx` — QR code dialog
  - `packages/ui/src/composite/profile/verification-badge.tsx` — verified/unverified badge
  - `contracts/celo/src/SelfProfileVerifier.sol` — Celo verifier (stores nationality + verifiedAt)
  - `contracts/megaeth/src/VerificationMirror.sol` — MegaETH mirror
  - `lit-actions/features/verification/self-verify-mirror-v1.js` — Celo→MegaETH sync

### Heaven Names (RegistryV1 — .heaven name NFTs)
- **RegistryV1 contract**: `0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2` on MegaETH (chain 6343)
- **RecordsV1 contract**: `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3` on MegaETH (chain 6343)
- ERC-721 name NFTs: `tokenId = uint256(node)` where `node = keccak256(parentNode, keccak256(label))`
- `parentNode` = `namehash("heaven.hnsbridge.eth")` = `0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27`
- **Primary name reverse mapping**: `mapping(address => uint256) primaryTokenId`
  - Auto-set on registration (replaces expired/transferred primaries)
  - `primaryName(addr)` → `(label, parentNode)` with on-chain ownership+expiry validation
  - `primaryNode(addr)` → `bytes32 node` for record lookups
  - `setPrimaryName(tokenId)` / `clearPrimaryName()` for manual control
  - Cleared on transfer in `_update()`, cleared on burn in `_clearToken()`
- **Public profile route**: `/#/u/:id` supports addresses (`0x...`), heaven labels (`alice`), ENS names (`alice.eth`), HNS TLDs (`alice.premium`)
  - Address visits do reverse lookup via `primaryName()` to resolve heaven name + load text records
  - Handshake hostname detection redirects `alice.heaven` → `/#/u/alice.heaven`
- **Name → address resolution**: `getAddr(node)` calls `RegistryV1.ownerOf(uint256(node))` (NOT `RecordsV1.addr()` — addr records are never set during registration)
- **Own profile heaven name discovery**: `MyProfilePage` uses a `primaryNameQuery` (TanStack) to discover the name on-chain, syncs to `heavenName` signal + localStorage. Handles cross-client (web↔Tauri) where localStorage differs.
- **ProfileInfoSection**: Identity, Bio & Links, and Photos cards are wrapped in `Show when={isOwnProfile}` — only visible on own profile. Public viewers see the header (name, bio, links) + info cards (Basics, Location, etc.)
- **Key files**:
  - `apps/frontend/src/lib/heaven/registry.ts` — `getAddr()`, `getPrimaryName()`, `getPrimaryNode()`, `computeNode()`
  - `apps/frontend/src/pages/ProfilePage.tsx` — `PublicProfilePage`, `MyProfilePage`, `parseProfileId()`, `resolveProfileId()`
  - `packages/ui/src/composite/profile/profile-info-section.tsx` — edit-only sections gated on `isOwnProfile`

### Profile (On-chain via ProfileV2 + RecordsV1)
- **ProfileV2 contract**: `0xa31545D33f6d656E62De67fd020A26608d4601E5` on MegaETH (chain 6343)
- **RecordsV1 contract**: `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3` on MegaETH (chain 6343)
- **Lit Action**: `heaven-set-profile-v1.js` — sponsor PKP writes profile gaslessly
- **Dual storage model**:
  - **ProfileV2**: Structured data (enums, packed integers, bytes32). Used for matching/filtering.
    - Numeric enums: age, gender, nationality, nativeLanguage, relocate, degree, profession, etc.
    - `learningLanguagesPacked`: uint80 = 5 × uint16 language codes, big-endian
    - `hobbiesCommit`/`skillsCommit`: bytes32 packed with 16 × uint16 tag IDs (not hashes)
    - `locationCityId`: keccak256 hash of city label string
    - `schoolId`: zeroed (no on-chain use yet, pending ZKEmail verification)
  - **RecordsV1**: Key-value strings (ENS-compatible). Used for display.
    - `avatar`, `header`, `description`, `url`, `com.twitter`, `com.github`, `org.telegram`
    - `heaven.hobbies`, `heaven.skills`: human-readable labels (e.g. "Swimming, Cooking")
    - `heaven.location`: city label (e.g. "Paris, Island of France, France")
    - `heaven.school`: school name plaintext
- **Tag dictionary** (`packages/ui/src/data/tags.ts`):
  - Canonical uint16 IDs for hobbies (1–999) and skills (1000–1999)
  - ~90 hobbies, ~40 skills. IDs are **stable forever** (never reuse/renumber)
  - `packTagIds(ids)` → bytes32, `unpackTagIds(hex)` → number[]
  - `parseTagCsv(csv)` → dedupe/sort/validate/cap at 16
  - UI uses `multiselectdropdown` with tag options → stores comma-separated ID strings
- **Profile save flow** (2 txs, both gasless via sponsor PKP):
  1. `setRecordsFor()` / `setTextRecords()` — writes display strings to RecordsV1
  2. `upsertProfileFor()` — writes structured data to ProfileV2
- **Profile load flow**:
  1. `getProfile()` reads ProfileV2 struct, decodes enums/bytes2/packed tags
  2. `getTextRecord()` reads RecordsV1 for display strings (avatar, bio, social links, labels)
  3. On-chain packed tag IDs are the source of truth for hobbies/skills (not RecordsV1 labels)
- **Subgraph**: Goldsky `dotheaven-profiles/1.0.0` indexes `ProfileUpserted` events, denormalizes all 19 packed enums into individual fields for subgraph-level filtering
  - API: `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn`
- **Key files**:
  - `apps/frontend/src/lib/heaven/profile.ts` — buildProfileInput, getProfile, parseTagCsv
  - `apps/frontend/src/lib/heaven/community.ts` — subgraph queries for community page
  - `apps/frontend/src/pages/ProfilePage.tsx` — save/load orchestration
  - `packages/ui/src/composite/profile/profile-info-section.tsx` — editable profile UI
  - `packages/ui/src/data/tags.ts` — tag dictionary + pack/unpack helpers
  - `subgraphs/profiles/` — subgraph definition (schema, mapping, ABI)

### Social Feed (Posts + Engagement)
- **PostsV1 contract**: `0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6` on MegaETH (chain 6343)
- **EngagementV2 contract**: `0xAF769d204e51b64D282083Eb0493F6f37cd93138` on MegaETH (chain 6343)
- **Lit Actions**: `post-register-v1.js` (create posts), `post-translate-v1.js` (translate), `like-v1.js` (like/unlike), `comment-v1.js` (comment), `flag-v1.js` (report/flag)
- **Post creation pipeline**:
  1. Text safety check via OpenRouter LLM — returns `{ safe, isAdult, lang }` (ISO 639-1 language code)
  2. Metadata uploaded to IPFS (Filebase) with `language` field
  3. Sponsor PKP broadcasts `PostsV1.postFor()` on MegaETH
  4. Photo posts also register on Story Protocol (text posts skip Story)
- **Language detection**: LLM safety check doubles as language detector. Language stored in IPFS metadata, used by frontend to show/hide "Translate" button (`postLang !== userLang`)
- **Translation pipeline**: User signs EIP-191, Lit Action calls LLM for translation, sponsor PKP broadcasts `EngagementV2.translateFor()`. Translations stored as events (no storage cost)
- **Engagement pipeline** (all gasless via sponsor PKP, all auth-gated):
  - **Like/unlike**: `likePost()` → Lit Action → `EngagementV2.likeFor()`/`unlikeFor()`. Optimistic UI toggle (heart fills red, count ±1, reverts on failure). Liked state fetched via `liked(bytes32,address)` RPC on page load.
  - **Comment**: FeedPage navigates to PostPage; PostPage `handleSubmitComment()` → Lit Action → `EngagementV2.commentFor()`. Refreshes comments query + increments count on success.
  - **Report/flag**: `flagPost(reason=0)` → Lit Action → `EngagementV2.flagFor()`. Triggered from three-dot menu "Report Post".
  - **Repost/quote**: TODO — not yet wired
- **Data source**: `dotheaven-activity/14.0.0` subgraph indexes `PostCreated` + `TranslationAdded` + `Liked` + `Unliked` + `CommentAdded` + `Flagged` events
- **Feed resolution**: Each post resolves author name/avatar via heaven name lookup + RecordsV1, fetches text/photos from IPFS metadata
- **Compose**: `ComposeBox` (desktop inline) / `ComposeDrawer` (mobile FAB) — currently stubbed (`console.log`), not yet wired to Lit Action
- **Key files**:
  - `apps/frontend/src/pages/FeedPage.tsx` — feed with TanStack Query, engagement (like/comment/report/translate), optimistic liked state
  - `apps/frontend/src/pages/PostPage.tsx` — single post detail view with like, comment submit, report, translate
  - `apps/frontend/src/lib/heaven/posts.ts` — subgraph queries, IPFS metadata fetch, engagement service functions (`likePost`, `commentPost`, `flagPost`, `translatePost`), RPC liked-state queries (`getHasLiked`, `batchGetLikedStates`)
  - `packages/ui/src/composite/feed/feed-post.tsx` — FeedPost component with `isLiked`, `postLang` / `needsTranslation()` logic
  - `lit-actions/features/social/post-register-v1.js` — post creation action
  - `lit-actions/features/social/post-translate-v1.js` — translation action
  - `lit-actions/features/social/like-v1.js` — like/unlike action
  - `lit-actions/features/social/comment-v1.js` — comment action
  - `lit-actions/features/social/flag-v1.js` — flag/report action

### Social Follow (FollowV1)
- **FollowV1 contract**: `0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb` on MegaETH (chain 6343)
- **Lit Action**: `follow-v1.js` — sponsor PKP broadcasts `followFor()`/`unfollowFor()` gaslessly
- **On-chain state**: `follows(a,b)` mapping, `followerCount`/`followingCount` counters — readable via RPC
- **Subgraph**: `Follow` + `UserFollowStats` entities in `dotheaven-activity/14.0.0` — used for follower/following list pages
- **Frontend service** (`apps/frontend/src/lib/heaven/follow.ts`):
  - `getFollowState(viewer, target)` — RPC: `follows(viewer, target)`
  - `getFollowCounts(address)` — RPC: `followerCount()` + `followingCount()`
  - `toggleFollow(target, action, ...)` — Lit Action mutation
  - `fetchFollowers(address)` / `fetchFollowing(address)` — subgraph queries for list pages
- **Profile integration**: `PublicProfilePage` shows follow button + counts; `MyProfilePage` shows own counts
- **List pages**: `/u/:id/followers` and `/u/:id/following` — uses `FollowList` component with `MediaRow`, resolves names/avatars/nationality flags
- **Key files**:
  - `apps/frontend/src/lib/heaven/follow.ts` — service layer (RPC + subgraph + Lit Action)
  - `apps/frontend/src/pages/FollowListPage.tsx` — follower/following list page
  - `apps/frontend/src/pages/ProfilePage.tsx` — follow button + count wiring
  - `packages/ui/src/composite/follow/follow-list.tsx` — presentational FollowList component
  - `lit-actions/features/social/follow-v1.js` — follow Lit Action

### Community Homepage
- **Community page** (route: `/search`, component: `App.tsx`): Community member discovery using `CommunityFeed` component
- **Data source**: `dotheaven-profiles` subgraph indexes ProfileV2 events, denormalizes all enums for filtering
- **Tabs**: All (everyone) / Nearby (same `locationCityId`)
- **Resolution**: Each profile card resolves heaven name + avatar + bio via RPC (getPrimaryName, getTextRecord, resolveAvatarUri)
- **TanStack Query**: `fetchCommunityMembers()` queries subgraph, `fetchUserLocationCityId()` gets user's location for Nearby tab
- **Key files**:
  - `apps/frontend/src/App.tsx` — CommunityFeed wiring
  - `apps/frontend/src/lib/heaven/community.ts` — subgraph queries + profile resolution

### Subgraphs (Goldsky)
Three Goldsky subgraphs on MegaETH testnet (3-slot limit):

| Subgraph | Version | Indexes | Source Dir |
|----------|---------|---------|------------|
| `dotheaven-activity` | 14.0.0 | ScrobbleV3 + ScrobbleV4 + PostsV1 + ContentRegistry + EngagementV2 + LyricsEngagementV1 + FollowV1 | `subgraphs/activity-feed/` |
| `dotheaven-profiles` | 1.0.0 | ProfileV2 | `subgraphs/profiles/` |
| `dotheaven-playlists` | 1.0.0 | PlaylistV1 | `subgraphs/playlist-feed/` |

API base: `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/{name}/{version}/gn`

Deploy: `cd subgraphs/<dir> && npx graph codegen && npx graph build && goldsky subgraph deploy <name>/<version>`

**Note**: `dotheaven-content` was merged into `dotheaven-activity` v7.0.0. ScrobbleV4 was added in v11.0.0. EngagementV2 (translations, likes, comments, flags) was added in v12.0.0. LyricsEngagementV1 (song lyrics translations) was added in v13.0.0. FollowV1 (social follow graph) was added in v14.0.0.

### Local Music Library (Tauri-only)
- **Rust SQLite backend** (`src-tauri/src/music_db.rs`): rusqlite + lofty + walkdir
  - `music.db` in app data dir with `tracks` table (file_path PK) and `settings` table
  - Metadata extraction via lofty (ID3, Vorbis Comments, iTunes ilst, etc.)
  - Cache invalidation by `(file_size, file_mtime)` — skips re-extraction for unchanged files
  - Recursive folder scan with progress events (`music://scan-progress`)
  - Pruning of deleted files on rescan
  - Paginated queries: `LIMIT/OFFSET` via `music_get_tracks` + `music_get_track_count`
  - All Tauri commands use `spawn_blocking` (sync rusqlite behind `Arc<Mutex<MusicDb>>`)
- **Frontend** (`src/lib/local-music.ts`): Thin invoke wrappers, no JS-side metadata parsing
- **LibraryPage** (`src/pages/LibraryPage.tsx`):
  - Loads tracks in PAGE_SIZE=200 batches with epoch guard for cancellation
  - Updates DOM on first page, then every 5th batch, and at end
  - Platform-guarded: early-returns on web, dynamic imports for Tauri event API
  - Scan progress UI shows done/total next to spinner
- **TrackList virtualization** (`packages/ui/src/composite/media/track-list.tsx`):
  - Renders only visible rows + 10 overscan buffer (ROW_HEIGHT=48)
  - Scroll listener throttled via requestAnimationFrame
  - Uses `getBoundingClientRect()` on rows container for correct offset math
  - `props.tracks.slice()` preserves object identity to avoid `<For>` remounts

## Key Routes
```
/                      # Home (social feed — posts with translation)
/search                # Community discovery (CommunityFeed)
/chat/ai/:personality  # AI chat (Scarlett) - has voice call
/chat/:peer            # XMTP peer-to-peer chat
/wallet                # Wallet page
/music                 # Music library (redirects to default tab)
/music/:tab            # Music library specific tab (local/cloud/shared/publish)
/playlist/:id          # Playlist page
/artist/:mbid          # Artist page (MusicBrainz)
/album/:mbid           # Album page (MusicBrainz)
/post/:id              # Single post detail view
/u/:id                 # Public profile (address, heaven name, ENS, or HNS)
/u/:id/followers       # Follower list
/u/:id/following       # Following list
/profile               # Own profile (edit mode)
/schedule              # Schedule / booking page
/schedule/availability # Schedule availability editor
/settings              # Settings page
/auth                  # Authentication (standalone, no shell)
/onboarding            # Onboarding flow (standalone, no shell)
/c/:token              # Claim profile (standalone, no shell)
/room/:roomId          # Live voice room (standalone, no shell)
```

### Music Metadata & Artist/Album Pages
- **Heaven Resolver** (Cloudflare Worker): MusicBrainz API proxy + external image rehosting
  - Artist/album metadata fetched from MusicBrainz via `/artist/:mbid` and `/release-group/:mbid`
  - Wikimedia Commons images automatically rehosted to IPFS via Filebase
  - Client-side rehosting (`apps/frontend/src/lib/image-cache.ts`) detects external URLs and calls `/rehost/image`
  - In-memory cache + KV cache (1 year TTL) prevents duplicate work
  - Eliminates 429 rate limit errors from Wikipedia servers
  - IPFS gateway: `https://heaven.myfilebase.com/ipfs/`
- **Artist Page** (`apps/frontend/src/pages/ArtistPage.tsx`):
  - Hero image from MusicBrainz artist info (Wikimedia Commons)
  - Track list with scrobble counts
  - Skeleton loader while rehosting images
- **Album Page**: Similar pattern for release group cover art
- See `services/heaven-resolver/README.md` for full details

## Environment Variables
```bash
VITE_LIT_NETWORK         # Lit network: "naga-test" (default) or "naga-dev"
VITE_CHAT_WORKER_URL     # Cloudflare Worker for AI chat
VITE_AGORA_APP_ID        # Agora RTC app ID for voice calls
VITE_MEDIA_WORKER_URL    # Media Worker for photo upload + AI conversion
VITE_AA_GATEWAY_URL      # AA Gateway URL (default: http://127.0.0.1:3337)
VITE_AA_GATEWAY_KEY      # AA Gateway API key (optional, for protected endpoints)
VITE_RESOLVER_URL        # Heaven Resolver (MusicBrainz proxy + image rehosting)
VITE_SESSION_VOICE_URL   # Session Voice worker URL (voice rooms)
VITE_LIT_SPONSORSHIP_API_URL  # Lit relayer URL (PKP minting)
VITE_SELF_VERIFIER_CELO  # SelfProfileVerifier contract address (Celo Sepolia)
VITE_VERIFICATION_MIRROR_MEGAETH  # VerificationMirror contract address (MegaETH)
# Individual CID overrides: VITE_PLAYLIST_V1_CID, VITE_HEAVEN_CLAIM_NAME_CID, etc.
```

## Color Scheme (Heaven Dark Theme — Catppuccin Mocha)

### Visual Hierarchy (backgrounds)
```
--bg-page:           #171717  (darkest — main background)
--bg-surface:        #1c1c1c  (sidebar/panels)
--bg-elevated:       #262626  (avatars, album covers, card fills)
--bg-highlight:      #262626  (active/selected states — NEVER use for borders)
--bg-highlight-hover:#303030  (hover states)
```

### Border Colors (IMPORTANT)
```
--border-default: #404040  (inputs, buttons, prominent borders)
--border-subtle:  #363636  (dividers, card edges, container borders, list separators)
```
**Rule**: NEVER use `--bg-highlight` (`#262626`) as a border/divider color — it's the same shade as `--bg-elevated` and invisible against most backgrounds. Always use `--border-subtle` for structural borders/dividers and `--border-default` for input fields.

### Text Colors
```
--text-primary:   #fafafa  (primary text)
--text-secondary: #d4d4d4  (secondary text)
--text-muted:     #a3a3a3  (muted text)
```

### Accent Colors
```
--accent-blue:       #89b4fa   (catppuccin blue)
--accent-blue-hover: #b4befe   (catppuccin lavender)
--accent-purple:     #cba6f7   (catppuccin mauve)
--accent-coral:      #fab387   (catppuccin peach)
```

## Design Guidelines

### Border Radius System

| Element Type | Radius | Notes |
|---|---|---|
| **IconButton** (all variants) | `rounded-full` | Circular |
| **Button** (text buttons) | `rounded-full` | Pill/capsule shape |
| **Chips/pills** | `rounded-full` | PillGroup, LanguageChip, MultiSelect chips |
| **Input fields** | `rounded-full` | TextField, Select, LocationInput, MessageInput |
| **Textarea fields** | `rounded-2xl` | TextArea, multiline inputs |
| **Dropdown containers** | `rounded-md` | DropdownMenuContent, SelectContent |
| **Cards/dialogs/modals** | `rounded-md` | Subtle 6px corners |
| **Sidebar/tabs** | None | Flat, no radius |
| **Avatars (people)** | `rounded-full` | Circular |
| **Album covers** | `rounded-md` | Subtle 6px corners |
| **Drawers** | `rounded-t-xl` | Top corners only |

**Rule of thumb**: Interactive elements (buttons, chips, input fields, selects) are `rounded-full`. Textareas are `rounded-2xl`. Containers (cards, dialogs, dropdowns) are `rounded-md`.

### Icons (IMPORTANT — No Inline SVGs)
- **All icons live in `packages/ui/src/icons/index.tsx`** — NEVER add inline `<svg>` elements in components
- **To use an icon**: `import { Heart, Plus } from '@heaven/ui/icons'` (or `'../../icons'` within the UI package)
- **To add a new icon**: Add it to `packages/ui/src/icons/index.tsx` following the existing pattern (256x256 viewBox, `currentColor` fill, `Component<IconProps>`)
- **Phosphor source**: Copy SVG paths from `/media/t42/th42/Code/phosphor-icons/public/assets/phosphor.iconjar/icons/` — use the regular weight (`icon-name.svg`) or fill weight (`icon-name-fill.svg`)
- **Naming**: Regular = `IconName`, Fill = `IconNameFill` (e.g., `Heart` / `HeartFill`)
- **Sizing**: Icons accept a `class` prop — use Tailwind classes like `class="w-5 h-5"` at the call site
- **Exceptions**: Custom multi-color SVGs (e.g. verification badges), animated spinners, and blockchain logos may remain inline

### IconButton Standard
- **Always use `IconButton`** for icon-only buttons — never raw `<button>` with inline icon
- **Default variant**: `soft` (hover bg + color change). Use for all standard icon buttons
- **`ghost` variant**: Reserved for stories/demos only. Production code should use `soft`
- **Sizes**: `sm` (28px), `md` (36px, standard), `lg` (44px), `xl` (48px, send buttons)
- **Icon sizes**: `sm` → `w-3.5 h-3.5`, `md` → `w-5 h-5`, `lg` → `w-6 h-6`
- **Engagement bar exception**: Uses raw buttons with per-action semantic hover colors (blue/green/red) — these match `md` sizing via `p-2` + `w-5 h-5`

### Component Reuse (IMPORTANT)
**Always use existing reusable components from `@heaven/ui` before creating new ones.**

Available components:
- `Button`, `IconButton` - All button interactions
- `Avatar`, `AlbumCover` - Profile/media images
- `ListItem` - Sidebar items, lists
- `Header`, `Sidebar`, `RightPanel`, `AppShell` - Layout
- `MiniPlayer`, `SidePlayer`, `Scrubber` - Media controls
- `CommentItem` - Comments/threads

Check `packages/ui/src/` (primitives, composite, layout) before building new components.

### Component Backgrounds
- **Avatars/AlbumCovers**: Use `--bg-elevated` (not `--bg-highlight`)
- **Hover states**: Use `--bg-highlight-hover`
- **Active/selected**: Use `--bg-highlight`
- **Sidebars/panels**: Use `--bg-surface`

### Contrast Rules
Keep proper visual hierarchy to ensure hover states are visible:
```
page (#171717) → surface (#1c1c1c) → elevated (#262626) → highlight (#262626) → hover (#303030)
```

Never use the same background color for content and its hover state.
