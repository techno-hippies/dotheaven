# Decentralized Services Migration Plan

Date: 2026-02-20
Status: Draft v2
Scope: Replace Cloudflare-heavy service dependencies with decentralized-first architecture.

## Goals

- Remove single-platform dependence on Cloudflare Workers, D1, R2, KV, Durable Objects.
- Make compute replaceable (Akash or any container host) and data durable via decentralized storage.
- Migrate by service slice with rollback safety.
- Preserve existing API contracts for web, desktop, and android clients during migration.

## Key Principle

"Decentralized compute" is hard; "decentralized durability" is doable.

- A single Akash deployment is still one endpoint / one failure domain.
- The pragmatic win: make compute replaceable and make data durable + multi-access.
- Treat Akash as an execution substrate; move blob storage + audit trail off hyperscalers.

## Current Baseline

### Services

| Service | Runtime | CF Features | State Complexity |
|---|---|---|---|
| `api-core` | TS Worker | D1 + 5× R2 + CF Images | Medium-high (photo pipeline, claim flow, music publish) |
| `metadata-resolver` | TS Worker | KV (cache) | Very low (pure caching proxy) |
| `voice-agent` | TS Worker | D1 | Medium (session lifecycle, SSE streaming) |
| `voice-control-plane` | TS Worker | D1 + 2× Durable Objects + Cron | Highest (room state machines, payment settlement) |

### Existing Decentralized Storage Usage

Already in production:
- **Load Network** — primary blob ingestion for music publish pipeline (`routes/load.ts`, `routes/arweave.ts`, `routes/music.ts`)
- **Arweave** — permanent anchoring of published audio, cover art, metadata JSON (via Load S3 agent `/post` endpoint)
- **Arweave free tier** (≤100KB) used for cover art in `routes/arweave.ts`

Legacy (remaining):
- **Web-legacy Filebase references** — stale client-side resolver paths in `apps/web-legacy` only.
- **Service runtime / Android / Desktop** Filebase usage removed.

### Known Cleanup Completed

- Replaced dead `deletion-backup782.workers.dev` defaults in services smoke scripts.
- Replaced dead `deletion-backup782.workers.dev` fallbacks in `apps/web-legacy` service clients.

---

## Storage Architecture (Load + Arweave First)

### Decision: Load Network is the primary blob store. Arweave is the permanence layer.

No Filecoin/Beam. No new Filebase usage. Irys is a documented fallback bundler if Load has availability issues.

### Storage Policy by Data Class

| Data Class | Primary Store | Archive | Examples |
|---|---|---|---|
| Published immutable blobs | Load Network | Arweave (anchor via Load `/post`) | Audio files, cover art, metadata JSON |
| Pipeline intermediates | Hot object store (R2 now, MinIO on Akash later) | None (ephemeral) | Photo processing stages: raw → orig → watermarked |
| Final public derivatives | Load Network | Arweave (optional) | Profile photos, anime variants |
| Mutable pointers | D1 / ICP canister state | — | `arweave_ref` column in `music_publish_jobs` |
| Cache | Redis/SQLite on Akash | — | Metadata resolver artist/album cache |
| Private blobs | Encrypt client-side → Load | Encrypt → Arweave | Future encrypted content (ECIES with Tempo P256 keys) |
| Audit trail / receipts | Arweave (≤100KB free tier) | — | Settlement receipts, session attestations |

### ContentAddressedBlobStore Abstraction

Required interface (missing from current codebase):

- `put(bytes, contentType, tags?) → { id, gatewayUrl }`
- `anchor(id) → { arweaveUrl, available }` (optional permanence step)
- `get(id) → ReadableStream`
- `head(id) → { contentType, size, checksums, tags }`
- `link(logicalKey, id) → { logicalKey, id }`
- `resolve(logicalKey) → { logicalKey, id }`
- Multi-backend: Load (primary), Irys (fallback), Filebase (legacy, to be removed)

### Fallback Strategy

If Load Network has an outage, Irys is the backup bundler (same Arweave destination, different upload path). Document swap procedure per service.

---

## Target Placement

| Service | Target | Rationale |
|---|---|---|
| `api-core` | Split: stateful routes → ICP, media pipeline → Akash | ICP for claim/names/wallet (benefits from threshold ECDSA). Photo/media pipeline needs fast blob I/O. |
| `metadata-resolver` | Akash | Stateless caching proxy. Simplest migration. |
| `voice-agent` | Akash | SSE streaming + external LLM/Agora calls need low latency + flexible networking. |
| `voice-control-plane` | Split: control/state → ICP, real-time orchestration → Akash initially | Two complex DOs require careful decomposition. Last to migrate. |
| AO | Reserved | Async pipelines, queue consumers, replayable event workflows. No concrete workload identified yet. |

---

## Workstreams

### 0. Filebase → Load Migration (Status: mostly complete)

Migrate all Filebase S3 usage to Load Network. This is prerequisite to removing the last hyperscaler blob dependency.

**Phase 0a**: Migrate `/api/upload` route
- Completed by removing dead `/api/upload` + caller dependencies from active services scope.

**Phase 0b**: Migrate backend `pinToFilebase` calls
- Completed in active services: `scrobble.ts` and `metadata-resolver` image rehost now use Load.
- Removed dead service routes (`photos`, `meal`, `sleep`) and shared `lib/filebase.ts`.

**Phase 0c**: Migrate client-side Filebase gateway references
- Completed for active clients: `apps/android` and `apps/desktop`.
- `apps/web-legacy` remains out of scope (deprecated codebase).
- Target: Load gateway URL or Arweave gateway

**Phase 0d**: Remove Filebase
- Completed for active services and clients.
- Remaining cleanup: remove Filebase mentions from deprecated `apps/web-legacy` only.

### 1. Portability Layer

Define interfaces and implement Cloudflare adapters first:

- `StateStore` (D1 replacement)
- `ContentAddressedBlobStore` (R2 + Filebase replacement — see above)
- `CacheStore` (KV replacement)
- `Scheduler` (Cron replacement)
- `SessionCoordinator` (Durable Object replacement)
- `ImageTransformer` (CF Images replacement)

Then add target adapters:

- `IcpStateStore`, `IcpScheduler`
- `AkashStateStore` (Postgres/SQLite-backed), `AkashScheduler`
- `AoPipelinePublisher` for async jobs (when workload identified)

### 2. Service-by-Service Migration

#### `metadata-resolver` (first)

- Move to Akash container with Redis or SQLite cache backend.
- Replace in-memory `lastMbRequest` rate-limit state with persistent counter (survives restarts).
- Keep routes identical: `/health`, `/artist/*`, `/recording/*`, `/release-group/*`, `/search/*`, `/resolve/*`, `/rehost/*`.
- Switch clients by environment variable first, then defaults.

#### `voice-agent` (second)

- Move runtime to Akash with same auth and agent lifecycle routes.
- Keep `/auth/*`, `/agent/*`, `/chat/*`, `/v1/chat/completions` contracts unchanged.
- Validate SSE streaming behavior parity (critical: `/chat/stream` and the Agora CAI self-loop at `/v1/chat/completions`).
- Ensure stable long-lived HTTP connections (no aggressive proxy timeouts).

#### `api-core` (third, split)

- **ICP slice**: claim/names/wallet routes. Redesign EIP-712 signing around ICP threshold ECDSA (replaces `TEMPO_POLICY_SIGNER_PRIVATE_KEY`).
- **Akash slice**: photo pipeline, music publish, scrobble, meal, sleep. These need fast blob I/O and external API calls (Fal.ai, Load, MusicBrainz).
- Replace CF Images transforms with sharp/libvips on Akash.
- Keep existing route prefixes under `/api/*`.

#### `voice-control-plane` (last)

- Requires dedicated design doc before migration attempt.
- Split into:
  - Session/credits policy control → ICP
  - Room lifecycle / real-time orchestration → Akash
- Replace DO semantics with explicit coordinator abstraction (Redis + actor framework, or ICP canister per-room state).
- Replace cron sweep (session attestation every 2 min) with scheduler abstraction.
- DuetRoomDO is the hardest: payment settlement idempotency, segment model (up to 500), broadcast state machine, replay access tokens.

### 3. Client Cutover

- Require explicit env vars in dev and CI for all service URLs.
- No hardcoded service domains in runtime code (`web`, `desktop`, `android`).
- Validate missing service URL config at feature call-time, not app startup.
- Update smoke and integration tests to target canonical domains/env overrides.

### 4. Operations and Safety

- Add migration dashboard: health checks, auth success rates, p95 latency, error rates per endpoint.
- Perform shadow traffic diff before each cutover.
- Rollback trigger: error or latency regression above agreed thresholds.

---

## Execution Order

1. Complete dead-URL cleanup across all apps and docs. (DONE 2026-02-20)
2. **Filebase → Load migration** (Workstream 0, active scope complete).
3. Land portability interfaces with Cloudflare-backed implementations.
4. Migrate `metadata-resolver` to Akash.
5. Migrate `voice-agent` to Akash.
6. Migrate `api-core` routes incrementally (Akash for media, ICP for stateful).
7. Design doc for `voice-control-plane` DO decomposition.
8. Migrate `voice-control-plane` split architecture.
9. Introduce AO-backed async pipelines when concrete workload identified.

## Alternatives Considered

| Option | Status | Reason |
|---|---|---|
| Filecoin Onchain Cloud / Beam | Rejected | Slow retrieval, hard to integrate in practice |
| Walrus | Deferred | Interesting blob store but immature ecosystem; revisit if Load has issues |
| Irys | Documented fallback | Same Arweave destination as Load, different bundler. Use if Load has availability issues. |
| DataHaven | Not adopted | Too early / experimental |
| Storj / Sia | Not adopted | S3-compatible but gateway-centralized; doesn't improve on Filebase |

## Deliverables

- Architecture decision records for each service target.
- `ContentAddressedBlobStore` interface package with Load + Arweave adapters.
- Filebase removal checklist (per phase).
- Service cutover checklist per route group.
- Voice-control-plane DO decomposition design doc.
- Final decommission checklist for Cloudflare resources.
