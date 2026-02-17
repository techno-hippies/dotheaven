# Lyrics + Cover Art on Arweave: Migration Plan

## Document Purpose
Define a clear, phased plan to move song lyrics and cover art persistence from Filebase/IPFS-heavy flows to Arweave-first refs (`ar://...`), while preserving existing behavior and backward compatibility.

This plan covers:
- `lit-actions`
- `contracts`
- `subgraphs`
- Clients (`apps/desktop` first, then `apps/web`, then `apps/android`)

## Context Summary (Current State)

## What is already implemented
- `song-publish-v1` uploads song assets, metadata, alignment, and translation JSONs to Filebase.
- `lyrics-translate-v1` uploads translation JSONs to Filebase, then emits on-chain events via `LyricsEngagementV1.translateLyricsFor`.
- `ScrobbleV4` stores per-track `coverCid` (set-once semantics).
- `ScrobbleV4.setTrackCover` enforces length only (`>0 && <=128`), not URI format, so `ar://...` is already valid.
- `track-cover-v4` and `track-cover-v5` both perform on-chain pre-checks to reuse existing covers where present.
- `track-cover-v5` already accepts URI-safe refs and supports `ar://...` values (it does not upload bytes itself).
- Desktop (GPUI) already has a native Arweave Turbo upload path for track and playlist covers, then stores `ar://...`.
- Cover URL resolvers in web/android/desktop already understand `ar://...`.
- `content-register-megaeth-v1` already exists and is storage-agnostic (`pieceCid` input).
- `services/heaven-api/src/routes/arweave.ts` already exists and can be used as a web upload proxy.

## What is not implemented
- No Arweave/Turbo upload path in `song-publish-v1` or `lyrics-translate-v1`.
- No canonical lyrics lookup by MBID today; lyrics translations are indexed by Story `ipId`.
- Web track-cover path is still bound to `track-cover-v4` (Filebase upload flow).
- Android has no standalone `track-cover-v5` submission flow yet.
- Android publish flow is still Filebase-centric for song publish + lyrics translation.
- Several Android UI surfaces still build Filebase URL strings directly instead of resolving refs through `CoverRef`.

## Product/Protocol Goals

## Primary goals
- Use Arweave refs as canonical durable pointers for lyrics and cover art.
- Support query-before-upload:
  - "If song already has cover/lyrics ref, reuse it."
  - "If missing, upload once, register once."
- Keep compatibility with existing CIDs and `ipfs://` data.
- Roll out safely with GPUI first, then web, then Android.

## Secondary goals
- Reduce duplicate uploads across clients and repeated publishes.
- Keep on-chain payloads minimal (`string` refs + hashes), with full blobs off-chain.
- Preserve sponsor-gated write model in lit actions.
- Track transition progress (`ar://` vs IPFS refs) by client.

## Non-goals (for this phase)
- Rewriting all historical data.
- Removing Filebase support in one step.
- Forcing contract redeploy before we validate query/index behavior.
- Moving full audio blobs to Arweave via Lit actions in this phase.

## Canonical Data Model

## Cover refs
- Store in `ScrobbleV4.Track.coverCid`.
- Allowed refs:
  - `ar://<dataitem_id>` (target canonical)
  - existing IPFS CIDs (`Qm...`, `bafy...`)
  - `ls3://...` / `load-s3://...` where needed

## Lyrics refs
- Near-term: keep using `LyricsEngagementV1.LyricsTranslationAdded(ipId, langCode, ..., cid, textHash, byteLen)`.
- Canonical value in `cid` should move to `ar://<dataitem_id>` for new writes.
- Query model remains "event history, choose latest by `ipId + langCode`".

## Song identity and lookup keys
- Cover lookup key: deterministic `trackId` from `ScrobbleV4` kind/payload.
  - Kind 1: MBID payload
  - Kind 2: Story `ipId` payload
  - Kind 3: metadata hash payload
- Lyrics lookup key: currently Story `ipId` only.
- Gap: MBID-only lyrics lookup requires either:
  - an MBID->ipId mapping source, or
  - a new registry keyed by deterministic song key.

## Recommended Architecture Decisions

## Decision 1: Keep on-chain registry minimal
- Continue storing only refs/hashes on-chain.
- Do not place full lyrics text on-chain.

## Decision 2: Arweave refs as write target, multi-ref as read target
- New writes: `ar://...` by default.
- Reads: support existing IPFS refs indefinitely.

## Decision 3: Query-before-upload at client/service layer first
- For covers:
  - Check on-chain/subgraph `coverCid` for trackId before uploading.
- For lyrics:
  - Check subgraph `SongTranslation` for `(ipId, langCode)` before uploading/translating.
- This avoids expensive work in Lit execution and keeps behavior deterministic.

## Decision 4: Upload outside Lit actions by default
- Default path:
  - Desktop: client-side ANS-104 + Turbo upload.
  - Web: upload via `heaven-api` Arweave proxy route.
  - Android: upload via backend/proxy helper until native path is added.
- Lit actions should primarily register refs/hashes and execute writes.
- In-action upload remains an optional fallback for bounded small payloads only.

## Decision 5: Scope of Arweave migration in this phase
- Move to Arweave now:
  - cover images
  - lyrics translation JSON
  - song metadata JSON where practical
- Keep on Filebase/IPFS for now:
  - full audio files and other large blobs

## Query Strategy

## Cover (MBID or Story ipId)
1. Normalize song identifier:
   - If MBID: derive payload(kind=1), compute `trackId`.
   - If Story ipId: derive payload(kind=2), compute `trackId`.
2. Query:
   - Fast path: activity subgraph `track(id: trackId) { coverCid }`.
   - Fallback: on-chain `ScrobbleV4.getTrack(trackId)` if index lag suspected.
3. If `coverCid` exists and valid ref:
   - Skip upload, use existing ref.
4. Else:
   - Upload cover bytes (Turbo), get `ar://...`.
   - Write via `track-cover-v5` / `setTrackCoverBatch`.

## Lyrics
1. Require Story `ipId` for current registry.
2. Query:
   - `songTranslations(where: { ipId: <ipId>, langCode: <lang> }, orderBy: blockTimestamp, orderDirection: desc, first: 1)`.
3. If exists:
   - Reuse existing `cid`, skip translation/upload.
4. Else:
   - Translate, upload JSON to Turbo/Arweave, write event via `LyricsEngagementV1`.

## Important limitation
- "MBID-only lyrics existence check" is not fully solvable with current contract/subgraph shape unless we can reliably resolve MBID -> ipId first.
- `SongTranslation` is `@entity(immutable: true)` in subgraph; "latest translation" requires timestamp sorting each query unless we add a derived latest entity.

## Proposed Changes by Area

## 1) Lit Actions

## Add `v2` actions, keep `v1` as compatibility
- `song-publish-v2`:
  - Accept pre-uploaded refs for song assets and metadata refs.
  - Optional fallback mode to upload within action via Turbo endpoint for bounded small files.
  - Return refs (prefer `ar://`) and hashes.
- `lyrics-translate-v2`:
  - Add pre-check mode (`skipIfExists=true`) using subgraph/RPC query input from client.
  - Upload translation JSON to Arweave (or accept pre-uploaded ref).
  - Persist with `translateLyricsFor(..., cid=ar://...)`.
- Keep `track-cover-v5` as canonical cover write action.

## Key input/output contract updates
- Avoid Filebase-specific param names in v2 (`filebaseEncryptedKey`).
- Use storage-agnostic names:
  - `storageMode`
  - `storageUploadToken` / `storageEncryptedKey`
  - `existingRefPolicy` (`reuse`, `overwrite-if-empty`, `force-new`)

## CID single-source-of-truth
- Action CIDs are currently duplicated across `lit-actions/cids/*.json`, `apps/web/src/lib/lit/action-cids.ts`, and `apps/android/.../SongPublishService.kt`.
- CID drift between these sources is a live risk on every action redeploy.
- Required: generate client CID maps from `lit-actions/cids/*.json` during build/release (or import at runtime).

## Transition guard for set-once cover races
- Between GPUI v5 rollout and web v5 rollout, web v4 writers can permanently lock IPFS refs before Arweave refs land.
- Short-term mitigation: disable or deprioritize new cover writes from web v4 path until web v5 is shipped.
- This is a temporary measure removed once web v5 is the default.

## Critical operational requirement: encrypted key rebinding
- Any encrypted key bound to Lit ACC conditions that include action CID must be re-encrypted for new `v2` CIDs.
- Expected keys include:
  - storage key(s) previously tied to `filebaseEncryptedKey`
  - OpenRouter translation key(s)
  - other action-bound provider keys used in affected flows (for example ElevenLabs where applicable)
- This is a required rollout step, not optional cleanup.

## 2) Contracts

## Cover registry
- No immediate contract changes needed.
- `ScrobbleV4.coverCid` allows any non-empty string up to 128 bytes and keeps set-once semantics.
- No additional format validation is currently enforced on-chain.

## Lyrics registry
- Near-term: no immediate contract change required.
- Mid-term optional improvement:
  - Add `LyricsEngagementV2` with a deterministic song key mode (MBID/ipId support), if product requires MBID-first queries without Story dependency.

## 3) Subgraphs

## Activity subgraph
- Keep indexing:
  - `Track.coverCid`
  - `SongTranslation` from `LyricsTranslationAdded`

## Query ergonomics improvements
- Add documented query snippets and indexing notes for:
  - latest translation by `(ipId, langCode)`
  - track cover by `trackId`
- Prioritized optional improvement: add derived "latest translation" materialized entity if query volume grows.

## 4) Desktop (GPUI) - first rollout

## Existing strengths to keep
- Arweave cover upload path already exists.
- On-chain pre-check before uploading cover already exists.

## GPUI tasks
1. Standardize all cover writes through `track-cover-v5`.
2. Ensure playlist flows always use Arweave upload helper first, then write ref.
3. Add lyrics translation lookup integration (query `SongTranslation` before requesting translation action).
4. If publish UI is added/expanded in desktop, default to v2 action interfaces.

## 5) Web

## Web tasks
1. Add `trackCoverV5` CID wiring in `action-cids` and make it the default cover write path.
2. Update `track-cover-service` to prefer v5 (`ar://`) with v4 fallback.
3. Keep resolver unchanged (already supports `ar://`).
4. Route uploads through `heaven-api` Arweave proxy (or equivalent service path) for web.
5. Migrate song publish service to `song-publish-v2` once deployed.
6. Migrate auto-translate path to `lyrics-translate-v2`.

## 6) Android

## Android tasks
1. Add standalone `track-cover-v5` integration path (currently missing).
2. Move publish flow from Filebase-specific assumptions to resolver-based refs.
3. Replace Filebase URL hardcoding in UI with `CoverRef.resolveCoverUrl`.
4. Migrate `SongPublishService` to v2 params and ref handling.
5. Preserve fallback support for old CIDs.

## Migration Phases

## Phase 0: Spec and alignment
- Approve this plan and finalize v2 action I/O.
- Lock initial rollout defaults:
  - Upload outside Lit actions by default.
  - Arweave for covers/lyrics JSON/metadata only.
  - Audio remains Filebase/IPFS in this phase.

## Phase 0.5: Encrypted key rebinding preparation
- Inventory all ACC-bound encrypted keys tied to existing action CIDs.
- Re-encrypt secrets against `song-publish-v2` / `lyrics-translate-v2` / any migrated CIDs.
- Update secret distribution and rotation runbooks before client cutover.

## Phase 1: Lit action implementation
- Implement `song-publish-v2`.
- Implement `lyrics-translate-v2`.
- Deploy on dev/test networks.
- Record new CIDs in `lit-actions/cids/*.json`.

## Phase 2: GPUI integration (first)
- Wire v2 actions and pre-check logic.
- Validate end-to-end with covers and lyrics on test network.

## Phase 3: Web integration
- Prioritize fast web cutover to `track-cover-v5` to reduce set-once mixed-ref race window.
- Add `trackCoverV5` usage and v2 publish/lyrics paths.
- Keep fallback to v1/v4 until stable.

## Phase 4: Android integration
- Implement standalone `track-cover-v5` flow.
- Migrate publish path to v2.
- Remove remaining hardcoded Filebase URL usages in music/profile surfaces.

## Phase 5: Data and cleanup
- Forward migration default; optional backfill for hot content only (not full historical migration).
- Deprecate v1 usage in clients.
- Keep backward reads forever.

## Acceptance Criteria

## Functional
- New cover writes result in `ar://...` stored on-chain.
- New lyrics translation events contain `cid=ar://...`.
- Re-publish/re-translate avoids duplicate upload when existing ref is present.
- Clients render both old IPFS and new Arweave refs.

## Operational
- No regression in publish success rates.
- No major increase in end-to-end publish latency.
- Clear telemetry for upload failures and fallback paths.
- Telemetry includes ref type distribution (`ar://`, IPFS CID, `ls3://`) and client writer source.

## Risks and Mitigations

## Risk: Index lag causes duplicate uploads
- Mitigation: check on-chain fallback when subgraph misses fresh writes.

## Risk: MBID-only lyrics query remains incomplete
- Mitigation: require ipId for lyrics registry in v2 docs; evaluate `LyricsEngagementV2` if needed.

## Risk: Partial client migration causes mixed refs
- Mitigation: keep resolvers multi-format and make write path deterministic per client version.

## Risk: Set-once race on `coverCid` locks in non-Arweave refs
- Because `coverCid` is set-once, a v4/IPFS writer can permanently win before v5/Arweave writes.
- Mitigation:
  - prioritize web migration to v5 immediately after GPUI
  - avoid concurrent mixed write paths where possible
  - monitor winner ref type distribution by client

## Risk: Action runtime/network instability with direct uploads
- Mitigation: keep upload outside Lit by default; use in-action upload only with bounded sizes and retries.

## Risk: Turbo size limits conflict with large payloads
- Mitigation: keep large audio assets on Filebase/IPFS in this phase.

## Risk: New CIDs break access to encrypted provider keys
- Mitigation: complete key rebinding in Phase 0.5 before enabling client cutover.

## Proposed defaults for open decisions
1. Upload location: outside Lit actions by default; optional in-action fallback for small payloads.
2. MBID-aware lyrics registry: defer; continue ipId-based registry until mapping pressure justifies new contract/indexing work.
3. `ar://` enforcement: do not hard-enforce during transition; support mixed refs on read, monitor write distribution.
4. First production rollout after GPUI: web first, then Android.
5. Backfill strategy: forward migration by default; optional targeted backfill only for hot catalog.

## Immediate Next Step (after approval)
1. Create technical specs for `song-publish-v2` and `lyrics-translate-v2` with exact `jsParams`, response schema, compatibility behavior, and key-rebinding checklist.
2. Create web migration PR for `track-cover-v5` cutover and Arweave proxy upload path.
