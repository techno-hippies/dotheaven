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
│   └── frontend/          # SolidJS app (web + Tauri desktop)
│       ├── src/
│       │   ├── components/    # App-specific components
│       │   ├── lib/           # Client libraries (xmtp, voice, lit, web3)
│       │   ├── pages/         # Route pages
│       │   └── providers/     # Context providers (Auth, XMTP, Wallet)
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
- See `apps/frontend/src/lib/xmtp/` and `providers/XMTPProvider.tsx`

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

## Key Routes
```
/                      # Home (vertical video feed)
/chat/ai/:personalityId  # AI chat (Scarlett) - has voice call
/chat/:addressOrId     # XMTP peer-to-peer chat
/wallet                # Wallet page
/library               # Music library
/playlist/:id          # Playlist page
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
