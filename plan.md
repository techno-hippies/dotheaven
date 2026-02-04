# Nationality Flag Badges on Avatars

## Approach
Add a small flag overlay (bottom-right corner of avatars) showing the user's nationality, using flagpack-core SVGs. The flag appears as a tiny badge on the avatar — similar to how the online indicator (green dot) works in `UserIdentity` today.

## Key design decision
The best integration point is the **Avatar** component itself, since nationality flags should appear everywhere avatars do. Adding an optional `nationalityCode` prop to Avatar keeps it simple — every consumer can opt in by passing the alpha-2 code.

## Implementation Steps

### 1. Copy flagpack SVGs into the UI package
- Copy `flagpack-core/svg/s/*.svg` → `packages/ui/src/assets/flags/` (255 files, 1.5MB total)
- These are the smallest variant (16x12 viewBox), perfect for badges

### 2. Create a `FlagIcon` component
- **File**: `packages/ui/src/primitives/flag-icon.tsx`
- Props: `code: string` (ISO 3166-1 alpha-2, e.g. "US"), `class?: string`
- Uses a dynamic `<img>` tag with the flag SVG path
- SVGs imported as URLs (Vite handles this with `?url` suffix or via public assets)
- Actually: since there are 255 flags, use `new URL(...)` pattern or put them in the Vite public dir. Best approach: import them as raw SVG and render inline, BUT 255 files is too many for static imports.
- **Best approach**: Copy flags to a `public/flags/` dir in frontend (or use Vite's `?url` import). Actually since this is a shared UI package, embed the SVGs as a map. Given 255 files at ~1-4KB each, total ~500KB which is fine for a bundled map.
- **Simpler approach**: Create a helper that returns an `<img>` tag pointing to `/flags/{code}.svg`. Copy the SVGs to `apps/frontend/public/flags/`. For Storybook, configure static dirs.
- **Simplest approach for shared UI**: Use an `<img>` tag with a configurable base URL. The consuming app provides the flag assets. The Avatar component just renders `<img src="${flagBaseUrl}/${code}.svg">`.

**Revised approach**: Copy flags to `packages/ui/public/flags/` and configure both Vite and Storybook to serve them. The FlagIcon component uses `<img src="/flags/{code}.svg">`.

### 3. Add `nationalityCode` prop to `Avatar`
- **File**: `packages/ui/src/primitives/avatar.tsx`
- Add optional `nationalityCode?: string` prop to `AvatarProps`
- When present, render a `FlagIcon` badge at bottom-right, positioned absolute
- Badge sizing scales with avatar size (smaller badge on xs/sm, larger on lg+)
- Badge has a small border matching the parent background for clean overlay

### 4. Thread `nationalityCode` through consuming components

#### UserIdentity (`packages/ui/src/composite/user-identity.tsx`)
- Add optional `nationalityCode?: string` prop
- Pass through to Avatar

#### FeedPost (`packages/ui/src/composite/feed-post.tsx`)
- Add optional `authorNationalityCode?: string` to `FeedPostProps`
- Pass to UserIdentity

#### MessageBubble (`packages/ui/src/composite/message-bubble.tsx`)
- Add optional `nationalityCode?: string` to `MessageBubbleProps`
- Pass to Avatar

#### ChatListItem (`packages/ui/src/composite/chat-list-item.tsx`)
- Add optional `nationalityCode?: string` to `ChatListItemProps`
- Pass to UserIdentity

#### PostComposer (`packages/ui/src/composite/post-composer.tsx`)
- Add optional `nationalityCode?: string` to `PostComposerProps`
- Pass to Avatar

#### ProfileHeader (`apps/frontend/src/components/profile/profile-header.tsx`)
- Add optional `nationalityCode?: string` to `ProfileHeaderProps`
- Pass to Avatar

### 5. Wire nationality data in the frontend app

For profile pages, the nationality is already loaded via `getProfile()`. For chat contexts, nationality would need to be fetched per-peer — this can be a follow-up. Start with:

- **ProfilePage**: Pass nationality from profile data to ProfileHeader
- **PostPage / Feed**: Pass nationality from post author data (if available from subgraph)
- **Chat**: Leave as future work (requires per-peer profile lookup)

### 6. Export FlagIcon from the UI package index
- Add to `packages/ui/src/primitives/index.ts`
- Add to `packages/ui/src/index.ts`
