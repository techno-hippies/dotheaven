# Song Upload Backend Plan: Cloudflare Worker vs EigenCloud TEE

Date: 2026-02-17
Status: Active (implementation in progress)

## Objective

Replace Lit-based song publish flows with a backend-controlled pipeline that:

1. Uses no Lit Actions.
2. Requires active Self.xyz verification for all upload/publish access.
3. Keeps user-facing publish free (platform pays infra costs).
4. Stores canonical music assets on Arweave (`ar://`).
5. Preserves fast developer iteration and low operational load.

## Implementation Snapshot (2026-02-17)

1. Backend music routes are live in `services/heaven-api`:
   - `POST /api/music/publish/start`
   - `POST /api/music/publish/:jobId/artifacts/stage`
   - `POST /api/music/preflight`
   - `GET /api/music/publish/:jobId`
   - `POST /api/music/publish/:jobId/anchor`
   - `POST /api/music/publish/:jobId/metadata`
   - `POST /api/music/publish/:jobId/register`
2. Self.xyz gate and ban/rate-limit checks are enforced on music endpoints.
3. Android publish flow is cut over to backend and currently stops at `policy_passed` (staged-only).
4. Android does NOT call anchor/metadata/register in the default publish UX yet.
5. Full permanent finalize flow still exists server-side but is not on the default client path.
6. `LOAD_S3_AGENT_API_KEY` currently supports `POST /upload` but not `POST /post/{id}` in production. Because of that, Arweave anchoring is treated as a gated follow-up action.
7. Original publish preflight now enforces staged artifacts:
   - cover + lyrics must be staged first via `POST /api/music/publish/:jobId/artifacts/stage`
   - if missing, preflight returns manual review with `policyReasonCode = missing_staged_artifacts`

## Locked Policy Decisions

1. Hard gate:
   - unverified users cannot upload or publish
   - only Self.xyz-verified users can access music upload endpoints
2. Enforcement:
   - confirmed copyrighted upload attempts are blocked
   - abusers are permanently banned from upload flow
   - keep a permanent denylist keyed by wallet and Self verification identity/nullifier
3. Storage:
   - no song audio blobs to Filebase
   - full mix, vocals, instrumental, canonical metadata, alignment JSON, and lyrics translations are Arweave canonical (`ar://`) after policy pass
   - never anchor raw uploads to Arweave at ingest time
4. Canvas:
   - canvas may remain Filebase/CDN-backed for fast playback, with optional async Arweave archival later

## Current State (Problem)

1. Web and desktop still have Lit-era publish dependencies in parts of their flows.
2. Android publish has been migrated off Lit for song submission, but finalize-to-Arweave/Story is intentionally deferred.
3. ElevenLabs forced alignment and OpenRouter translation are not on the current default Kotlin submit path.
4. `services/heaven-api` now owns the music publish state machine and policy checks.
5. Arweave anchor (`/post/{id}`) requires Load-side entitlement; without it, finalize cannot complete in production.

## Current State (Historical Problem Reference)

The items below describe the original migration gap this plan was written to address:

1. Android and web publish previously executed Lit Actions for:
   - song publish
   - lyrics translation
   - Story registration
   - MegaETH content registration
   - track cover writes
2. ElevenLabs forced alignment was called inside `song-publish-v2` Lit Action.
3. OpenRouter translation was called inside Lit Actions.
4. `services/heaven-api` existed but did not own the full publish lifecycle.

## Threat Model and Decision Drivers

### Primary risks

1. Abuse and cost drain:
   - large uploads
   - repeated publish spam
   - bot accounts
2. Copyright risk:
   - permanent Arweave storage cannot be deleted in practice
   - risk is highest at upload time, before anchor
3. Key management risk:
   - sponsor keys and API keys become critical infra secrets
4. Ops risk:
   - failed retries, queue backlog, endpoint outages
5. Delivery risk:
   - replacing Lit end-to-end without blocking Android/web release velocity

### Important clarification

Self.xyz is the mandatory access gate for uploads. It reduces Sybil abuse and improves accountability, but it still must be paired with pre-anchor policy checks for copyright enforcement.

## Option A: Cloudflare Worker First (Recommended for now)

Use `services/heaven-api` as the orchestration backend.

### Architecture

1. Auth and eligibility:
   - require Self.xyz verified wallet/session before publish endpoints
   - bind publish jobs to verified address
2. Ingress:
   - `POST /api/music/publish/start`
   - `GET /api/music/publish/:jobId`
   - optional `POST /api/music/translate`
3. Job execution:
   - enqueue in Cloudflare Queue or Durable Object worker loop
   - persist job state in D1
4. External calls from backend:
   - ElevenLabs forced alignment
   - OpenRouter translation
   - Arweave upload via existing LS3/Arweave route for canonical artifacts
5. On-chain writes:
   - backend signs/broadcasts Story + MegaETH txs using relay key(s)
6. Secret handling:
   - Wrangler secrets for ElevenLabs/OpenRouter/relay keys

### Pros

1. Fastest path with existing infra.
2. Best DX for current team and repo.
3. Lowest migration complexity for Android/web.
4. Easy to add spend caps, rate limits, and abuse controls quickly.

### Cons

1. Secrets live in cloud provider secret system, not TEE-isolated.
2. Key custody guarantees are weaker than hardware-isolated KMS.
3. More trust in service operators.

## Option B: EigenCloud TEE + EigenCompute KMS

Move signing/orchestration into EigenCompute app enclave.

### Architecture

1. Cloudflare remains public API edge and request validator.
2. Verified publish requests are forwarded to TEE job runner.
3. TEE uses deterministic mnemonic identity from EigenCompute KMS.
4. TEE handles API keys and chain signing internally.
5. Cloudflare stores job state/metadata; TEE performs privileged actions.

### Pros

1. Strong secret isolation and key custody model.
2. Persistent deterministic app identity for autonomous on-chain ops.
3. Better long-term posture for high-value keys and multi-chain automation.

### Cons

1. Higher implementation and operational complexity now.
2. Slower iteration and harder debugging compared with Worker-only flow.
3. Team DX overhead before volume justifies it.
4. Distributed KMS threshold properties are roadmap-dependent (not full today).

## Recommendation

### Decision

Use Cloudflare Worker now, design interfaces so TEE can replace the signer/orchestrator later without client API changes.

### Why this is not over-optimization

Considering EigenCloud now is correct risk thinking. Choosing it immediately for low volume is likely over-optimization unless key custody/compliance constraints already require TEE-grade isolation.

### Trigger to move to TEE

Re-evaluate when any of these are true:

1. Material monthly infra/API spend where key compromise risk is high.
2. Multiple chain relays and larger treasury balances.
3. Compliance or partner requirements for hardware-isolated signing.
4. Internal requirement that operators cannot access signing/API secrets.

## Storage Policy

### Canonical

1. Song audio/stems/metadata/alignment/lyrics translations: Arweave refs (`ar://`) only after policy approval.
2. Do not use Filebase for canonical song audio blobs.

### Canvas media

1. Keep canvas on Filebase (or equivalent CDN-backed storage) for fast load.
2. Optional async archival to Arweave if product wants permanent canvas later.

This aligns with your cost view: song permanence on Arweave, canvas optimized for UX and bandwidth.

## Staged Storage and Delayed Arweave Anchor (Locked)

1. Ingest uploads into temporary storage only (LS3 staging and/or R2) with short TTL.
2. Stage all original-publish artifacts before policy pass:
   - audio via `POST /api/music/publish/start`
   - cover + lyrics via `POST /api/music/publish/:jobId/artifacts/stage`
3. Run all policy checks before permanent write:
   - hash duplicate checks
   - fingerprint checks (AcoustID)
   - metadata checks
   - license/derivative checks when applicable
   - moderation/manual review when confidence is uncertain
4. Anchor to Arweave only on `publish commit` after checks pass.
5. If rejected, delete staged artifacts and keep only audit metadata (hashes, reasons, actor).
6. This is mandatory for both legal risk reduction and cost control.

## Self.xyz Gating Policy

1. Upload and publish endpoints require active Self.xyz verified status.
2. Verification state is checked at job start and before Arweave anchor.
3. If verification is revoked/nullified, fail job and block further uploads.
4. Copyright abuse enforcement:
   - deny upload immediately when detected pre-anchor
   - permanently ban offending account after confirmed violation
   - bind ban to wallet + Self verification identity/nullifier
5. Permanent banned users cannot create new upload jobs.
6. Add appeal/admin override workflow outside runtime path.
7. Add per-verified-user quotas:
   - daily upload bytes
   - daily publish count
   - daily AI calls (alignment/translation)
8. Add per-IP and per-wallet burst rate limits.
9. Add spend guardrails:
   - hard fail when daily platform budget is exceeded
   - soft queue/throttle for non-priority requests
10. Keep audit logs for each job:
   - wallet
   - self verification id
   - hashes
   - tx hashes
   - cost estimate

## Original vs Derivative Publish Flow (Locked)

### Why this section exists

Story royalty and licensing behavior for remixes only works correctly when derivatives are explicitly linked to parent IP Assets and parent license terms. Root-only registration is not enough for remix attribution and royalty routing.

### Decision tree at publish time

1. User uploads song.
2. Backend computes:
   - file hash
   - AcoustID fingerprint match candidates
   - metadata similarity candidates
3. UI asks publish intent:
   - `Original`
   - `Remix/Derivative`
   - `Cover`
4. If high-confidence match exists and user selected `Original`:
   - block publish
   - require `Remix/Derivative` or `Cover` path
5. For `Remix/Derivative` and `Cover`:
   - require parent IP selection (search + manual IPID input fallback)
   - show suggested parents from AcoustID/metadata matches
6. Backend validates parent license terms:
   - derivatives allowed
   - derivatives approval requirement
   - minting fee and revenue-share constraints
7. Backend registers as derivative on Story using parent linkage and valid license terms.
8. If user repeatedly attempts to bypass this flow with copyrighted material:
   - reject upload pre-anchor
   - nullify/ban identity permanently from upload endpoints

### UX requirements

1. Parent search:
   - search by title/artist
   - search by IPID
   - suggested matches from AcoustID result
2. Parent summary card:
   - IPID
   - creator
   - attached license terms summary
   - whether derivatives are allowed
3. Blocking states:
   - no valid parent selected for remix flow
   - parent license disallows derivative
   - approval-required terms not satisfied

### Backend requirements

1. Add duplicate/remix classifier output to publish preflight response.
2. Add `publishType` field to publish start API:
   - `original`
   - `derivative`
   - `cover`
3. Add optional `parentIpIds` and selected `licenseTermsIds` in request.
4. Reject derivative/cover requests lacking valid parent linkage data.
5. Emit clear machine-readable failure reasons for client UI.
6. Require all parent IPIDs and license terms in one request (single derivative registration call).

## No-Lit Migration Plan

### Phase 0: API and job contract lock

1. Define backend publish request/response schema.
2. Define signature format for user authorization message.
3. Freeze Lit message format compatibility for migration period.

### Phase 1: Backend implementation in `services/heaven-api`

1. Add `music` routes and job state model.
2. Add Self.xyz verification gate middleware.
3. Implement ElevenLabs/OpenRouter calls server-side.
4. Implement Arweave upload pipeline for canonical song artifacts (no Filebase fallback for audio/stems).
5. Implement Story + MegaETH sponsored writes server-side.
6. Add retries, idempotency keys, and structured failure reasons.

### Phase 2: Client cutover (Android + web)

1. Android:
   - replace `SongPublishService` Lit action calls with backend API calls
   - keep progress UI based on backend job state
   - current shipped mode: stop at staged + policy pass; defer anchor/register
2. Web:
   - replace Lit publish/translate execution with backend API calls
3. Keep legacy Lit path behind a temporary kill switch only during rollout.

### Phase 3: Lit removal

1. Remove song publish and lyrics translate Lit CID dependencies from clients.
2. Remove related encrypted key blobs from client code.
3. Decommission music Lit actions and setup scripts.
4. Remove Lit auth requirement from publish eligibility logic.

## Abuse and Copyright Controls Before Arweave Anchor

Minimum controls before permanent upload:

1. Self.xyz verified identity.
2. MIME and duration checks.
3. Byte-size and format policy checks.
4. Hash-based duplicate detection.
5. Optional audio fingerprint check against known-protected catalogs.
6. Policy enforcement response:
   - block
   - manual review
   - allow and anchor

Without pre-anchor controls, permanent storage increases legal and moderation risk.

## Open Questions

1. Self.xyz backend verification implementation target:
   - confirm whether `@selfxyz/core` can run in Cloudflare Workers
   - if not, pick fallback (`Self` API or Node verifier microservice)
2. Sponsor signing key migration:
   - confirm whether Lit PKP key material is exportable (expected no)
   - if no, provision new EOA(s), fund, and grant required sponsor permissions
3. Should canvas stay non-canonical permanently, or eventually mirror to Arweave?
4. Which anti-copyright provider/fingerprint approach do we want initially beyond AcoustID?

## Implementation Order (Practical)

1. D1 migration + `/api/music/*` route skeleton + job lifecycle state machine.
2. Staged upload pipeline (`upload` -> checks -> explicit `anchor`) with no auto-Arweave at ingest.
3. Story server-side registration:
   - root path
   - derivative path with one-shot parent linkage
4. Preflight classifier:
   - hash duplicate checks
   - AcoustID lookup (client-provided fingerprint)
   - parent candidate suggestions
5. Self.xyz production verifier implementation + middleware enforcement.
6. Android and web client cutover.
7. Lit music flow removal.
8. Optional TEE signer migration when trigger conditions are hit.

## Current Operational Mode (Locked for now)

1. Kotlin publish flow is submission-first:
   - stage upload
   - run preflight/policy
   - return submitted state to user
2. Permanent anchoring to Arweave is delayed until:
   - moderation and policy confidence are acceptable, and
   - Load `/post/{id}` entitlement is available for the production key.
3. Story registration is a finalize step, not part of initial submit UX.
