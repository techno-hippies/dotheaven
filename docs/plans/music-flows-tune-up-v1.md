# Music Flows Tune-Up V1 (GPUI-First)

## Scope Lock

Execution scope for this plan is **GPUI desktop only**:

1. `apps/desktop/*`
2. `contracts/megaeth/*` and `lit-actions/*` only where needed by GPUI flows

Deferred scope:

1. `apps/web/*` web work is postponed to a later plan.

## Goal

Ship a cohesive GPUI music flow for:

1. Playlist create/edit/delete + add/remove tracks.
2. Playlist sharing with managed content availability + access grants.
3. Shared-track decrypt + local download into active library folder.
4. Scrobbling for decrypted/shared playback.
5. Shared tab metadata/UI parity with library.
6. LRCLIB lyrics lookup + synced persistence (SYLT/USLT/sidecar) + per-line playback UI.

## Post-Review Gaps (GPUI Framing)

### 1) XMTP payload model gap

XMTP in current app flow is text/message oriented. No structured playlist-share message type is implemented.

V1 decision:

1. Use deterministic text envelope now.
2. Defer custom XMTP content type to post-V1.

### 2) Playlist-share orchestration is missing

There is no end-to-end playlist-share orchestrator with resumable progress.

V1 decision:

1. Add Rust orchestration state machine in GPUI.
2. Persist state checkpoints locally for resume.

### 3) Cover upload for playlist metadata updates

Playlist metadata updates require CID-ready cover data; this must be explicit in GPUI flow.

V1 decision:

1. Add explicit cover upload step before metadata update action.

### 4) Lyrics is greenfield in playback path

No LRCLIB integration, no synced lyric display in player, no write-back flow for tags/sidecars.

V1 decision:

1. Treat lyrics as a full isolated feature phase.

### 5) Download/write path consistency

GPUI already has native Rust persistence/decrypt patterns; keep all write paths in Rust (no split write logic).

V1 decision:

1. Implement download + library registration in Rust GPUI layer.

## Locked Product Decisions

1. Download destination: `<libraryRoot>/Shared`.
2. XMTP share payload: minimal (`playlistId`, `owner`).
3. Lyrics write policy: user-triggered only.
4. Tag write formats: multi-format where supported, sidecar fallback otherwise.

## Contract Review: `PlaylistV1.sol`

Keep unchanged for V1:

1. Event-sourced model is sufficient.
2. Replay protection via `consumeNonce` is sufficient.
3. On-chain collaborator ACL is out of scope.

Constraint to respect:

1. Playlist stores `trackId[]`, not `contentId[]`.
2. Share/access remains application orchestration over `ContentRegistry`/`ContentAccessMirror`.

## Current GPUI State (Corrected)

1. Shared-with-me decrypt/playback exists in GPUI:
   - `apps/desktop/src/library.rs` (`play_shared_record`)
   - `apps/desktop/src/load_storage.rs` (`decrypt_shared_content_to_local_file`)
2. Shared decrypt currently caches in app data, not library folder insertion.
3. Single-track share/access grant flow exists in GPUI modal path.
4. Playlist integration in GPUI is not wired (placeholder menu text indicates this).
5. Lyrics playback/persistence flow is not implemented.

## Workstreams

### Phase 0: Foundation and correctness (start now)

1. Wire GPUI playlist core actions (create/setTracks/updateMeta/delete) from menu/dialog flows.
2. Add cover upload step for playlist metadata edit before on-chain update.
3. Ensure owner-scoped content resolution for any playlist-track content lookup path.
4. Fix shared metadata fallback sequence:
   - subgraph metadata
   - on-chain track read
   - hash fallback only last

Deliverables:

1. GPUI playlist flows are functional (no placeholder stubs).
2. Cover metadata update works end-to-end.
3. Owner/content mismatch class of bugs is removed.

### Phase 1: Shared playback and local library integration

1. Keep row-click behavior as decrypt-and-play.
2. Add explicit menu action: `Decrypt & Download to Library`.
3. Save decrypted file to `<libraryRoot>/Shared`.
4. Register downloaded track into local library index using incremental DB insert/update.
5. Fallback to full rescan only if incremental registration fails.
6. Hook scrobble submission for decrypted/shared playback path.

Deliverables:

1. Shared track can be played immediately and downloaded explicitly.
2. Downloaded track appears in library without mandatory full rescan.
3. Decrypted/shared playback scrobbles like local playback.

### Phase 2: Playlist sharing automation

#### 2.1 XMTP send envelope (V1)

1. Send text envelope:
   - `HEAVEN_PLAYLIST_SHARE_V1 {"playlistId":"0x...","owner":"0x..."}`
2. Strict validation and versioning in parser.

#### 2.2 XMTP receive behavior (V1)

1. Parse envelope in GPUI message pipeline.
2. Render playlist-share card in chat list/thread view.
3. CTA opens playlist view and resolves tracks from chain/subgraph.
4. Show fallback states for unavailable or index-lagged playlists.

#### 2.3 Share orchestration state machine (Rust)

States:

1. `discover_tracks`
2. `resolve_existing_content`
3. `enqueue_missing_uploads`
4. `await_upload_complete`
5. `await_subgraph_index`
6. `grant_access_chunked`
7. `send_xmtp_share_message`
8. `done` / `partial_failure` / `failed`

Durability:

1. Persist one share-session record per attempt in local app data.
2. Checkpoint after each state and each successful grant chunk.
3. Resume incomplete sessions on app restart.
4. TTL GC for stale sessions.

Scaling/reliability:

1. Chunk grants (default target: 20 content IDs/chunk).
2. Treat Base mirror failure as hard failure with retry path.

Deliverables:

1. One-click playlist share with progress UI and resumable execution.
2. Partial failure reporting with actionable retry.

### Phase 3: Lyrics (full feature track)

#### 3.1 Fetch/cache

1. Add LRCLIB client in Rust.
2. Match strategy: MBID-first, then title/artist/album fallback.
3. Add cache with dedupe + concurrency cap + TTL + cooldown/backoff on 429/5xx.

#### 3.2 Persistence (user-triggered)

1. Write SYLT where format supports synced lyrics.
2. Write USLT fallback where supported.
3. Write `.lrc` sidecar fallback when tag writes unsupported/fail.

#### 3.3 UI

1. Add per-line lyric panel to GPUI player side panel.
2. Highlight current line by playback time.
3. Show states:
   - not fetched
   - fetching
   - no match
   - available
   - write success/fail

Deliverables:

1. Synced lyrics in player for matched tracks.
2. User-controlled persistence with robust fallback behavior.

## Risks and Mitigations

### 1) Base mirror dependency for content grants

Risk:

1. `content-access-v1` dual-broadcast fails when Base is degraded.

Mitigation:

1. Fail share operation clearly (no silent success).
2. Keep retryable checkpoints.

### 2) Lit action limits on large playlists

Risk:

1. Large operations exceed execution/time budget.

Mitigation:

1. Chunk operations.
2. Resume from last successful chunk.

### 3) LRCLIB rate limits

Risk:

1. Library browsing triggers request bursts.

Mitigation:

1. In-flight dedupe.
2. Concurrency cap.
3. TTL cache + cooldown/backoff.

### 4) Subgraph indexing lag

Risk:

1. Newly uploaded content unavailable when grant step runs.

Mitigation:

1. Poll with bounded retries.
2. Allow partial completion + resume.

## Test Plan (GPUI)

1. Contract regression checks:
   - `contracts/megaeth/test/PlaylistV1.t.sol`
2. Lit action checks:
   - `lit-actions/features/music/playlist-v1.test.ts`
   - `lit-actions/features/music/content-access.test.ts`
3. GPUI integration:
   - playlist create/edit/delete/add/remove
   - shared playback vs explicit decrypt-download
   - incremental library registration + rescan fallback
   - share orchestration progress/partial-failure/resume
4. XMTP integration:
   - envelope parse/render/card CTA/fallback states
5. Scrobble integration:
   - decrypted/shared playback submits scrobbles
6. Lyrics integration:
   - fetch/caching/rate-limit behavior
   - SYLT/USLT/sidecar persistence behavior

## Acceptance Criteria (GPUI)

1. Playlist actions are fully wired in GPUI (no placeholder menu actions).
2. Shared tab supports explicit decrypt+download to `<libraryRoot>/Shared`.
3. Downloaded tracks appear in library via incremental registration (rescan fallback only on failure).
4. Decrypted/shared playback is scrobbled.
5. Playlist share is managed by resumable orchestrator with robust progress/failure reporting.
6. XMTP playlist-share envelope is parsed and rendered as actionable card.
7. Lyrics are fetchable, displayed per-line, and persistable via user-triggered SYLT/USLT/sidecar flow.

## Remaining Open Items

1. Final default chunk size/retry windows.
2. Schedule for custom XMTP content type after GPUI V1 stabilization.

## Deferred Follow-Up (Web)

After GPUI stabilization, produce separate web plan for:

1. `apps/web` parity implementation.
2. Shared transport/envelope compatibility with GPUI.
3. Web-specific persistence and player UI adaptations.
