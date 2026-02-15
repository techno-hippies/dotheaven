# GPUI Playlist And Sharing (v1)

## Context (Current Behavior)
- Playlist delete exists at the storage layer (`LoadStorageService::playlist_delete`) but had no GPUI UI wiring.
- GPUI sharing is track-scoped: it grants decrypt access for a single `contentId` to a recipient EVM address.
- "Shared With Me" was local-only (`shared_grants.json`) and did not discover new grants from chain/subgraph.
- Playlist playback is currently "local-library only": playlist rows without a local mapping are not playable.

## Goals
1. Playlist owners can delete playlists from the playlist detail view.
2. "Shared With Me" works cross-device by discovering grants from the activity subgraph.
3. Keep the incremental path open for playlist sharing (share code + batch grant + playable UX).

## Non-Goals (For v1)
- Full "shared playlist" experience (import playlist by id + remote decrypt-playback directly from playlist view).
- Enforcing playlist visibility (public/unlisted/private) at the subgraph level.

## Phase 1: Delete Playlist (Small Scope)
**UX**
- Add a "Delete" action on the playlist detail page.
- Confirm via modal before deletion.
- On success: remove playlist from sidebar locally, clear playlist cache, navigate back to Library root, refresh sidebar.

**Implementation Notes**
- Wire to `LoadStorageService::playlist_delete(...)` via Lit Action op `"delete"`.
- Ensure modal overlays render on playlist detail routes (not just the library root view).

**Acceptance Criteria**
- User can delete a playlist while viewing it.
- After deletion, the playlist disappears from the sidebar and the user is taken back to the library list.

## Phase 2: Subgraph-Backed "Shared With Me"
**UX**
- Refresh pulls from the activity subgraph (`accessGrants(where: { grantee: me, granted: true })`).
- Merge with local `shared_grants.json` for optimistic/offline UX (subgraph indexing lag).

**Implementation Notes**
- Decode `pieceCid` from subgraph `Bytes` (hex) into UTF-8 string.
- De-dupe local persistence by `(grantee, contentId)` to prevent duplicate rows when re-sharing.
- Reuse existing metadata enrichment (`resolve_shared_track_metadata`) for title/artist/album hydration.

**Acceptance Criteria**
- A recipient on a different machine can see shared tracks after grants are indexed.
- The list does not duplicate indefinitely when re-sharing the same content.

## Phase 3: Playlist Sharing (Larger Scope)
**Core Design**
- "Share playlist" should be a share code that contains: `playlistId`, `owner`, and optionally a display name.
- Sender flow:
  1. Enumerate playlist trackIds.
  2. Ensure each track has registered content (upload if missing and local file exists).
  3. Batch grant decrypt access for all playlist `contentIds` to the recipient wallet.
- Recipient flow:
  - Import playlist share code and render a playlist view that supports decrypt-playback or decrypt-download.

**Blockers**
- Current playlist view is not a shared playback surface; remote decrypt-playback must be wired into playlist rows.
- Upload cost scales with playlist size; batch grant helps on-chain cost, but uploads remain per-track.

**Acceptance Criteria**
- Recipient can import a playlist share code and play (or one-click download) tracks without first scanning local files.

