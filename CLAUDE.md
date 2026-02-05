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
├── packages/
│   ├── ui/                # Shared UI components + Storybook
│   ├── core/              # Core business logic (playlists, storage)
│   └── platform/          # Platform-specific utilities
├── contracts/             # Smart contracts
├── subgraphs/             # Goldsky subgraph definitions
├── services/
│   ├── aa-gateway/        # AA Gateway + Alto bundler (ERC-4337)
│   └── alto/              # Pimlico Alto bundler (git submodule)
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

### Messaging (XMTP)
- **Peer-to-peer encrypted messaging** via XMTP protocol
- DMs between Ethereum addresses
- Real-time message streaming
- **Dual-target architecture**: platform-aware `XmtpTransport` interface
  - **Web**: `BrowserTransport` using `@xmtp/browser-sdk` with OPFS storage
  - **Tauri**: `RustTransport` using native libxmtp via Tauri commands (`src-tauri/src/xmtp.rs`)
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
- **ScrobbleV4 contract**: `0x1D23Ad1c20ce54224fEffe8c2E112296C321451E` on MegaETH (chain 6343). AA-enabled — `onlyAccountOf(user)` gating via factory-derived SimpleAccount. Stores `uint32 durationSec` per track.
- **ScrobbleV3 contract**: `0x144c450cd5B641404EEB5D5eD523399dD94049E0` on MegaETH (chain 6343). Legacy sponsor-gated version — still deployed, used by playlists Lit Action for track registration
- **Subgraph**: Goldsky `dotheaven-activity/7.0.0` indexes `TrackRegistered` + `TrackCoverSet` + `Scrobbled` + `PostCreated` + `ContentRegistered` events
- **Frontend**: `ScrobblesPage` fetches from subgraph, displays verified/unidentified status with cover art
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
  - `packages/ui/src/composite/verify-identity-dialog.tsx` — QR code dialog
  - `packages/ui/src/composite/verification-badge.tsx` — verified/unverified badge
  - `contracts/celo/src/SelfProfileVerifier.sol` — Celo verifier (stores nationality + age)
  - `contracts/megaeth/src/VerificationMirror.sol` — MegaETH mirror
  - `lit-actions/actions/self-verify-mirror-v1.js` — Celo→MegaETH sync

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
  - `packages/ui/src/composite/profile-info-section.tsx` — edit-only sections gated on `isOwnProfile`

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
  - `packages/ui/src/composite/profile-info-section.tsx` — editable profile UI
  - `packages/ui/src/data/tags.ts` — tag dictionary + pack/unpack helpers
  - `subgraphs/profiles/` — subgraph definition (schema, mapping, ABI)

### Community Homepage
- **Homepage** (`App.tsx`): Community member discovery page using `CommunityFeed` component
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
| `dotheaven-activity` | 7.0.0 | ScrobbleV3 + PostsV1 + ContentRegistry | `subgraphs/activity-feed/` |
| `dotheaven-profiles` | 1.0.0 | ProfileV2 | `subgraphs/profiles/` |
| `dotheaven-playlists` | 1.0.0 | PlaylistV1 | `subgraphs/playlist-feed/` |

API base: `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/{name}/{version}/gn`

Deploy: `cd subgraphs/<dir> && npx graph codegen && npx graph build && goldsky subgraph deploy <name>/<version>`

**Note**: `dotheaven-content` was merged into `dotheaven-activity` v7.0.0. Old content-feed subgraph dir remains for reference but is no longer deployed.

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
- **TrackList virtualization** (`packages/ui/src/composite/track-list.tsx`):
  - Renders only visible rows + 10 overscan buffer (ROW_HEIGHT=48)
  - Scroll listener throttled via requestAnimationFrame
  - Uses `getBoundingClientRect()` on rows container for correct offset math
  - `props.tracks.slice()` preserves object identity to avoid `<For>` remounts

## Key Routes
```
/                      # Home (community member discovery)
/chat/ai/:personalityId  # AI chat (Scarlett) - has voice call
/chat/:username        # XMTP peer-to-peer chat
/wallet                # Wallet page
/music                 # Music library (local/cloud/shared tabs)
/music/:tab            # Music library specific tab
/playlist/:id          # Playlist page
/post/:id              # Single post view (legacy deep-link compat)
/u/:id                 # Public profile (address, heaven name, ENS, or HNS)
/profile               # Own profile (edit mode)
/settings              # Settings page
```

## Environment Variables
```bash
VITE_CHAT_WORKER_URL     # Cloudflare Worker for AI chat
VITE_AGORA_APP_ID        # Agora RTC app ID for voice calls
VITE_MEDIA_WORKER_URL    # Media Worker for photo upload + AI conversion
VITE_HEAVEN_IMAGES_URL   # Heaven Images service for watermarking
VITE_AA_GATEWAY_URL      # AA Gateway URL (default: http://127.0.0.1:3337)
VITE_AA_GATEWAY_KEY      # AA Gateway API key (optional, for protected endpoints)
```

## Color Scheme (Heaven Dark Theme)

### Visual Hierarchy
```
--bg-page:           #1a1625  (darkest - main background)
--bg-surface:        #1f1b2e  (sidebar/panels)
--bg-elevated:       #252139  (avatars/album covers)
--bg-highlight:      #2d2645  (active/selected states)
--bg-highlight-hover:#342d52  (hover states)
```

### Text Colors
```
--text-primary:   #f0f0f5  (primary text)
--text-secondary: #b8b8d0  (secondary text)
--text-muted:     #7878a0  (muted text)
```

### Accent Colors
```
--accent-blue:       oklch(0.65 0.12 240)   (pastel blue)
--accent-blue-hover: oklch(0.70 0.14 240)   (lighter blue)
--accent-purple:     oklch(0.60 0.15 290)   (soft purple)
--accent-coral:      oklch(0.65 0.18 15)    (warm coral)
```

## Design Guidelines

### Border Radius System
**Simple rule: Use `rounded-md` (6px) for everything, except perfect circles which use `rounded-full`**

- Buttons, inputs, search bars, cards, dropdowns: `rounded-md`
- List items, menu items, hover states: `rounded-md`
- Dialogs, modals, content containers: `rounded-md`
- Album covers (square images): `rounded-md`
- Avatars (circle), play buttons, send buttons: `rounded-full`

**Never use**: `rounded-sm`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, or `rounded-full` for non-circular elements!

**Rationale**: The 6px radius provides a subtle, modern look that works better for small UI elements (icon buttons, menu items, list rows) while avoiding the overly-rounded bubble appearance of larger radii.

### Component Reuse (IMPORTANT)
**Always use existing reusable components from `@heaven/ui` before creating new ones.**

Available components:
- `Button`, `IconButton` - All button interactions
- `Avatar`, `AlbumCover` - Profile/media images
- `ListItem` - Sidebar items, lists
- `Header`, `Sidebar`, `RightPanel`, `AppShell` - Layout
- `MusicPlayer`, `Scrubber`, `NowPlaying` - Media controls
- `CommentItem` - Comments/threads

Check `packages/ui/src/components/` before building new components.

### Component Backgrounds
- **Avatars/AlbumCovers**: Use `--bg-elevated` (not `--bg-highlight`)
- **Hover states**: Use `--bg-highlight-hover`
- **Active/selected**: Use `--bg-highlight`
- **Sidebars/panels**: Use `--bg-surface`

### Contrast Rules
Keep proper visual hierarchy to ensure hover states are visible:
```
surface (#1f1b2e) → elevated (#252139) → highlight (#2d2645) → hover (#342d52)
```

Never use the same background color for content and its hover state.
