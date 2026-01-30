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
- **ScrobbleService** (`apps/frontend/src/lib/scrobble-service.ts`): Wires engine directly to Lit Action V2. Each scrobble fires immediately (no queue/batch)
- **Lit Action V2** (`lit-actions/actions/scrobble-submit-v2.js`): Signs EIP-191, buckets tracks into MBID/ipId/meta, sponsor PKP broadcasts to ScrobbleV2 on MegaETH
- **ScrobbleV2 contract**: `0xf42b285EEb9280860808fd3bC7b0D6c531EF53bd` on MegaETH (chain 6343)
- **Subgraph**: Goldsky `dotheaven-activity/3.0.0` indexes `ScrobbleId` + `ScrobbleMeta` events
- **Frontend**: `ScrobblesPage` fetches from subgraph, displays verified/unidentified status
- **MBID extraction**: Rust `music_db.rs` reads MusicBrainz recording ID from tags via lofty
- Three scrobble paths: MBID (MusicBrainz recording), ipId (Story Protocol IP), metadata hash (unidentified)

### Playlists (On-chain via PlaylistV1)
- **PlaylistV1 contract**: `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329` on MegaETH (chain 6343)
- **Event-sourced**: name/coverCid/trackIds stored only in events; contract stores checkpoints (tracksHash, trackCount, version)
- **Replay protection**: On-chain monotonic nonce per user (`userNonces` mapping + `consumeNonce()`)
- **Lit Action**: `playlist-v1.js` — signs EIP-191, registers tracks in ScrobbleV3, then executes playlist op
- **Subgraph**: Goldsky `dotheaven-playlists/1.0.0` indexes PlaylistCreated, PlaylistTracksSet, PlaylistMetaUpdated, PlaylistDeleted
  - API: `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn`

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
/                      # Home (vertical video feed)
/chat/ai/:personalityId  # AI chat (Scarlett) - has voice call
/chat/:addressOrId     # XMTP peer-to-peer chat
/wallet                # Wallet page
/library               # Music library
/playlist/:id          # Playlist page
/scrobbles             # On-chain scrobble history
```

## Environment Variables
```bash
VITE_CHAT_WORKER_URL   # Cloudflare Worker for AI chat
VITE_AGORA_APP_ID      # Agora RTC app ID for voice calls
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
**Simple rule: Use `rounded-lg` (12px) for everything, except perfect circles which use `rounded-full`**

- Buttons, inputs, search bars, cards, dropdowns: `rounded-lg`
- List items, menu items, hover states: `rounded-lg`
- Message bubbles, album covers: `rounded-lg`
- Avatars (circle), play buttons, send buttons: `rounded-full`

**Never use**: `rounded-md`, `rounded-sm`, `rounded-xl`, `rounded-2xl`, or `rounded-full` for non-circular elements!

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
