# Music Flows Tune-Up V1 — Implementation Plan

## Revised Assessment

The codebase is further along than a first pass suggests. Key findings:

- **load_storage.rs already has full playlist CRUD**: `playlist_create`, `playlist_set_tracks`, `playlist_update_meta`, `playlist_delete` — all calling the playlist-v1 Lit Action with nonce management.
- **"Add to playlist" modal is fully wired**: Track row context menu → modal → select existing or create new → calls `playlist_set_tracks` or `playlist_create` → refreshes sidebar. This works end-to-end.
- **Playlist detail view exists**: Sidebar playlists load from subgraph, clicking opens detail page with track list (name, artist, album, duration).
- **"Add to queue" menu item is now wired**: Appends to queue and starts playback immediately when idle.
- **Shared decrypt-and-play works** via `play_shared_record()`.
- **"Decrypt & Download to Library" is wired**: Shared row menu writes to `<library>/Shared`, does incremental DB insert, and falls back to full rescan if incremental insert fails.
- **Lyrics are now started (Step 7 in progress)**: Right-side player shows a lyrics panel with active-line highlighting. Resolution flow is sidecar (`.lrc`/`.txt`) → SQLite cache → LRCLIB (`/api/get-cached` → `/api/get` → `/api/search` fallback), with User-Agent support.

The real remaining work is:

1. **Playlist detail is still mostly read-only** — missing remove track, delete playlist, and metadata edit UI.
2. **Queue is still invisible** — queue engine exists, but there is no queue management panel (reorder/remove/clear).
3. **Cover upload for playlist metadata is not wired** — `playlist_update_meta` exists, but no UI flow yet.
4. **Playlist sharing (Phase 2)** — entirely unstarted.
5. **Lyrics write-back + batch tooling are still missing** — SYLT/USLT write-back and optional library-wide warm-up are not wired yet.

---

## Implementation Steps

### Step 1: Wire playlist detail playback + track management

**What**: Make playlist detail view interactive.

- **Play track from playlist**: Click row → decrypt-and-play (shared) or play local file. Build queue from playlist tracks.
- **Remove track from playlist**: Context menu "Remove from playlist" → call `playlist_set_tracks` with track removed → refresh detail.
- **Delete playlist**: Button in playlist detail header → confirm dialog → call `playlist_delete` → refresh sidebar → navigate away.
- **Edit playlist name**: Inline editable name in header → call `playlist_update_meta` on blur/enter.

**Files**: `library.rs` (detail page rendering + handlers), `load_storage.rs` (already has the service calls).

### Step 2: Wire "Add to queue" menu action

**Status**: ✅ completed

**What**: Make the track-row "Add to queue" context menu item functional.

- Append track's file_path to `playback_queue_paths` at end.
- Show toast confirming addition.
- If nothing is playing, start playback from the added track.

**Files**: `library.rs` (queue mutation now routed through queue helper).

### Step 3: Queue visibility panel

**What**: Add a toggleable queue panel (right side or overlay) showing current queue.

- List of upcoming tracks with title/artist.
- Current track highlighted.
- Drag-to-reorder (stretch — can defer to plain up/down buttons).
- Remove individual tracks from queue.
- Clear queue button.
- Toggle via sidebar "Queue" nav item or player bar button.

**Files**: `library.rs` (new `render_queue_panel` function + state), `main.rs` (panel toggle routing), `shell/app_sidebar.rs` (Queue nav item — icon already exists).

### Step 4: Decrypt & Download to Library

**Status**: ✅ completed (with fallback)

**What**: Add explicit "Download to Library" menu action for shared tracks.

- Menu item in shared track row context menu.
- Decrypt content via existing `decrypt_shared_content_to_local_file`.
- Copy/move decrypted file to `<libraryRoot>/Shared/` (create dir if needed).
- Incremental DB insert: single `INSERT OR REPLACE INTO tracks` with lofty metadata extraction for just that file.
- Fallback: if incremental insert fails, trigger full rescan.
- Toast on success with track name.

**Files**: `library.rs` (menu item + handler), `load_storage.rs` (decrypt is already there), `music_db.rs` (add `insert_single_track` method).

### Step 5: Cover upload for playlist metadata

**What**: When editing playlist metadata (name or cover), allow cover image selection + upload.

- File picker for image in playlist edit UI.
- Upload to Filebase → get CID.
- Pass `coverCid` to `playlist_update_meta`.

**Files**: `library.rs` (cover picker UI in playlist detail header), `load_storage.rs` (image upload helper — may already exist for track covers).

### Step 6: Playlist sharing via XMTP (Phase 2)

**What**: One-click "Share playlist" sends structured XMTP message.

Sub-steps:
1. **Send envelope**: `HEAVEN_PLAYLIST_SHARE_V1 {"playlistId":"0x...","owner":"0x..."}` via existing XMTP service.
2. **Parse envelope**: In XMTP message handler, detect prefix → parse JSON.
3. **Render card**: In chat view, render playlist-share messages as cards (name, track count, "Open" button).
4. **Orchestration state machine**: Rust struct with 8 states (discover → resolve → upload → index → grant → send → done). Persist checkpoints to local SQLite. Resume on restart.

This is the largest single unit of work. The orchestrator needs:
- Content availability check per track.
- Batch content-access grants (chunked at 20).
- Subgraph polling for indexing confirmation.
- XMTP message send as final step.

**Files**: New `playlist_share.rs` (orchestrator), `xmtp_service.rs` (envelope send/parse), `chat.rs` (card rendering), `library.rs` (share button in playlist detail).

### Step 7: Lyrics (Phase 3)

**Status**: 🚧 in progress

**What**: LRCLIB integration + synced display + persistence.

Sub-steps:
1. **LRCLIB resolver + cache**: ✅ done.
   - Local sidecar first (`.lrc`/`.txt` next to audio file).
   - SQLite cache table (`lyrics_cache`) keyed by normalized signature + duration.
   - LRCLIB call order: `/api/get-cached` → `/api/get` → `/api/search` fallback.
   - User-Agent configurable via `HEAVEN_LRCLIB_USER_AGENT`.
2. **Player lyrics panel**: ✅ done.
   - Rendered inside right side-player (below transport controls).
   - States: idle / fetching / error / no-match / lyrics ready.
   - Synced lines highlighted from playback position.
3. **Write-back** (user-triggered): ⏳ pending.
   - Target behavior: SYLT if synced lines exist, USLT fallback, `.lrc` sidecar fallback.
4. **Optional warm-up job**: ⏳ pending.
   - Background prefetch with strict budget and resumable cursor, not full eager sweep by default.

**Files**: `lyrics.rs` (resolver + matching), `side_player.rs` + `side_player/render/lyrics.rs` (panel), `music_db.rs` + `music_db/query_ops.rs` (lyrics cache table + read/write), `library/impl_detail_mode/mode_helpers.rs` (track signature helpers).

### Step 7 Design Decisions

1. **Default strategy is per-song on-demand, not full-library eager fetch.**
   - Trigger lyrics resolution when a track becomes active.
   - This avoids long startup jobs and unnecessary LRCLIB traffic for never-played songs.
2. **Library-wide processing is optional and budgeted.**
   - If added, it should run as a background cursor job (small batches, pause/resume, cancellable).
   - Recommended policy: only for tracks missing local sidecar + missing cache, with a daily request cap.
3. **Matching policy prioritizes precision over recall.**
   - Signature APIs first (duration-aware), then `/api/search` with scoring on normalized title/artist/album and duration delta.
   - Low-confidence search hits are rejected instead of risking wrong lyrics.
4. **Cache policy uses positive + negative TTLs.**
   - Positive lyric hits: long TTL.
   - No-match records: short TTL to allow periodic re-check as LRCLIB fills in.
5. **SYLT/USLT is intentionally separated from fetch/display.**
   - Fetch/display gives immediate UX value.
   - Tag write-back is a second phase because it needs format-specific safety paths (MP3/FLAC/others), transactional write, and rollback behavior.

---

## Execution Order & Dependencies

```
Step 1 (playlist detail)  ← no deps, start here
Step 2 (add to queue)     ← no deps, parallel with Step 1
Step 3 (queue panel)      ← depends on Step 2
Step 4 (download to lib)  ← no deps, parallel with Steps 1-2
Step 5 (cover upload)     ← depends on Step 1 (playlist edit UI)
Step 6 (playlist sharing) ← depends on Steps 1 + 5
Step 7 (lyrics)           ← no deps, can be parallel with Step 6
```

Recommended batching:
- **Batch A** (Steps 1, 2, 4): Wire existing stubs — highest impact, lowest risk.
- **Batch B** (Steps 3, 5): UI additions building on Batch A.
- **Batch C** (Step 6): Sharing orchestrator — heaviest lift.
- **Batch D** (Step 7): Lyrics — fully independent, can slot in anywhere.
