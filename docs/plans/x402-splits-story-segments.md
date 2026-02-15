# x402 + Splits + Story: Segments, Royalties, Self-Hosted Facilitator

Last updated: 2026-02-14

## Context

We want to keep three concerns independent, while preserving an upgrade path to "recording is designated IP" and "flexible, trust-minimized payouts".

- Access payments (x402): the viewer pays for access to live and replay. This is not a license sale.
- Payout routing (Splits): where access revenue flows (performers + upstream rightsholders).
- IP + licensing (Story): what the recording is, what derivative use is allowed, and what royalties are owed.

## V1 Decisions (Locked)

- Royalty model: mirror royalties on Base by including upstream rightsholders as recipients in the Base Sepolia Splits receiver used as x402 `payTo`.
- Segment entitlement policy: grandfather existing entitlements. A viewer who already paid for the room does not re-pay when the current segment changes.
- Segment boundaries: manual. The host (or host software integration later) explicitly starts a new segment when a new song begins.
- Replay payout policy (V1): replay is paid to a room-level receiver (not per segment) unless we also produce replay assets per segment.

## Key Constraint

OpenX402 enforces `payTo` whitelisting/registration. Dynamic per-room or per-segment `payTo` (fresh split contracts) is blocked unless we:

- Self-host our own facilitator so `payTo` can be arbitrary, or
- Pre-whitelist a finite pool of receivers (a scalability ceiling), or
- Accept a single fixed `payTo` (not our target).

This plan assumes we will self-host settlement for dynamic `payTo`.

## Segments (Definition)

A segment is a room "economic + rights snapshot" that applies to new payments after it starts.

Segment properties:

- `payTo`: Base Sepolia receiver address (ideally a Splits contract for that segment).
- `pricing`: live and replay prices as used for x402 requirements.
- `rights`: original vs derivative and any Story references and upstream royalty rules.
- `started_at`: timestamp.
- `locked_at`: timestamp set when the first successful settlement is attributed to that segment.

What segments do:

- Segments control where new money goes and what rights metadata we associate to that revenue.
- Segments do not break playback for existing entitled viewers (grandfathered entitlement).
- Economics note (grandfathered entitlements):
  - segment boundaries primarily affect payouts for new entrants (and renewals after expiry)
  - they do not retroactively re-route revenue from earlier entrants unless we add a reconciliation mechanism

## How We Know When A New Song Begins

We do not infer this from audio. The system only knows a new song begins when the host says so.

V1 approach:

- Host uses a `Start New Segment` control.
- Host selects the song (from platform-published catalog) and rights mode for the segment.

V2 optional automation:

- A local companion/integration can detect track change in DJ software and call `segments/start`.

## Song Selection = Rights + Payout Recipe (for a segment)

Story registry selection does not route money by itself. The host "picking a song" is how we deterministically choose:

- which Story IP asset(s) this segment is tied to
- which license preset/terms apply (original vs derivative/cover)
- which upstream royalty rule we are honoring (bps)
- which upstream payout address(es) on Base must receive funds

Then our system makes "money flow properly" by:

- creating/selecting a Base split receiver whose recipients include performers + upstream rightsholders
- setting `segment.payTo = <that receiver>`
- issuing x402 requirements with `payTo = segment.payTo` for new payments after the segment starts

Minimum fields we need in our published "song registry" (or derivable via Story + attestations):

- `story_ip_id` (canonical ID for the IP asset)
- default `rights_kind` / license preset id
- `upstream_royalty_bps` (for derivative/cover)
- a verified mapping from `story_ip_id` to a Base payout address
  - preferred: an attestation signature by the Story IP controller binding `{ story_ip_id, chain_id, payout_address }`

Current implementation location:

- Session Voice exposes a minimal registry under `GET /songs/search` and `GET /songs/:id`.
- Entries are stored in D1 table `song_registry` (migration `services/session-voice/migrations/0002_song_registry.sql`).
- Admin creation is `POST /songs` with Bearer `SONG_REGISTRY_ADMIN_TOKEN` (service-side).
- Payout mapping is verified via an EIP-712 attestation signature over:
  - `storyIpId` (string)
  - `payoutChainId` (uint256; Base Sepolia is 84532)
  - `payoutAddress` (address)
  - `upstreamRoyaltyBps` (uint256; 0..10000)

## Data Model Changes (Session Voice DO)

Extend room state to add segments while maintaining backward compatibility with the existing `meta.split_address`.

Suggested DO fields:

- `segments: Segment[]`
- `current_segment_id: string`
- `segment_locks: Record<string, { locked_at: number; first_settlement_tx_hash?: string }>`
- `settlements: Record<string, { segment_id: string; payer: string; amount: string; tx_hash?: string; ts: number }>`
  - Keyed by a stable idempotency key (signature hash or EIP-3009 nonce hash).

Segment schema (suggested):

- `id: string`
- `started_at: number`
- `payTo: 0x...`
- `pricing: { live_amount: string; replay_amount?: string }`
- `rights: { kind: "original" | "derivative"; source_story_ip_ids?: string[]; upstream_bps?: number; upstream_payout?: 0x...; attestations?: { source_ip_id: string; payout: 0x...; sig: string }[] }`

Backward compatibility:

- If `segments` is empty for a room, synthesize `segment_1` from `meta.split_address` and existing pricing.

## Segment Lifecycle Rules

- A segment is mutable only until it is locked.
- Lock trigger: first successful settlement attributed to that segment.
- After lock, the following must be immutable for that segment:
  - `payTo`
  - `pricing`
  - `rights`
- Starting a new segment creates a new snapshot; we do not mutate locked segments.

Guardrails:

- Only the host can start a new segment (host JWT).
- Only when the room is live (or in an allowed state).
- Optional: require the previous segment to be locked before starting the next (prevents rapid flip-flopping without any paid entries).

## API Changes (Session Voice)

New endpoint:

- `POST /duet/:id/segments/start` (host-auth)
  - Creates a new segment, sets it current, returns the segment.
  - Inputs:
    - `pay_to` (required): the receiver address (ideally a split receiver)
    - `song_id` (optional, recommended for derivatives): look up the song in the registry and auto-populate `rights` with verified Story->Base payout mapping
    - `rights` (optional): explicit rights snapshot (kept for flexibility; prefer `song_id` when possible)

Live entry (`POST /duet/:id/enter`) with grandfathered entitlements:

1. Load room state and current segment.
2. If payer wallet is already entitled at the room level, return access (no 402).
3. Otherwise:
  - Return 402 `PAYMENT-REQUIRED` built from current segment:
    - `payTo = current_segment.payTo`
    - `amount = current_segment.pricing.live_amount`
4. On success:
  - Settle via facilitator.
  - Record settlement attribution to `segment_id`.
  - Grant room-level entitlement.

Replay access (`GET /duet/:id/replay`) policy:

- V1 recommended: replay uses a room-level `replay_payTo` and `replay_amount`.
- Reason: a single replay asset may contain multiple segments, so per-segment replay payTo is ambiguous without per-segment replay outputs.

## Splits Integration (Base Sepolia)

Goal: `payTo` is a Splits receiver per segment that includes:

- Performers (DJ, singer seats)
- Upstream rightsholder recipients for derivative/cover segments

Notes:

- ERC-20 transfers do not execute contract code on receipt.
- "Automatic splitting" typically means funds land in the receiver and recipients claim or a bot calls distribution.
- This still achieves non-custodial flow (payer -> split receiver), with delayed distribution.

Receiver lifecycle:

- Create a receiver when a segment is started (or at room creation for segment 1).
- Store the receiver address in `segment.payTo`.
- Deployment model (V1 posture):
  - host pays gas to create the split receiver (PKP/MetaMask)
  - platform only pays gas for settlement transactions (facilitator), keeping receiver creation out of our relayer's attack surface

## Segment-bound Payment Challenges (prevents segment switch checkout churn)

Problem:

- A viewer can receive a 402 challenge for segment A, then the host starts segment B before the viewer signs.
- If we always settle against "current segment", the signed payment (for segment A payTo) can fail verification.

Solution:

- When issuing `PAYMENT-REQUIRED` for live access, include:
  - `resource` with `segment_id` (example: `/duet/<roomId>/enter?segment_id=<segId>`)
  - a short-lived `extensions.segment_checkout` token (HMAC-signed) that encodes `{ room_id, segment_id, exp }`
- When processing a `paymentSignature`:
  - if the checkout token is valid, settle against that segment snapshot (even if the current segment has changed)
  - if the token is missing/invalid and the signature targets a non-current segment, reject and re-issue 402 for the current segment

## Rights + Story Integration

V1 objective: store enough structured rights metadata that we can:

- Register the finalized recording as Story IP later.
- Link derivative segments to source Story IP(s).
- Make the intended upstream payout explicit and auditable.

V1 rights approach:

- Segment has `rights.kind` and optional `source_story_ip_ids[]`.
- For derivatives/covers, store `upstream_bps` and `upstream_payout` used in the split receiver.
- Optional: require an attestation from the source IP owner mapping their Story IP to the Base payout address.

V1 agreement:

- Produce a "Room Agreement" hash (EIP-712 signatures) capturing:
  - participants and bps
  - segment rights snapshots
  - replay policy
  - a reference to any Story source IP(s)
- Persist the agreement hash in room state for later Story registration linkage.

V2 Story registration:

- After recording finalization:
  - Register the recording as a Story IP asset.
  - Attach license terms snapshot (URI + chosen preset).
  - Link derivative segments to source IP(s) as derivatives, consistent with the agreement.

V2 or later royalties:

- Keep "mirror royalties on Base" as the operational default.
- Optionally support cross-chain royalty payment UX later (prepared tx for user to execute), without making the platform custodian.

## Facilitator (Self-Hosted)

Why:

- OpenX402 whitelisting blocks dynamic `payTo`, which is required for per-room/per-segment Splits receivers.

Current implementation (in-repo):

- `services/x402-facilitator` is a minimal self-host facilitator (Bun/TypeScript) exposing:
  - `GET /health`
  - `GET /supported`
  - `POST /settle` (bearer-authenticated)
- `services/session-voice` supports `X402_FACILITATOR_MODE=self` and calls the configured base URL for settlement.

Implementation target (hardening / preferred long-term):

- Use `x402-rs` as the self-hosted facilitator service (verify + settle).
- Deploy it on EigenCompute (same operational pattern as `services/aa-gateway`).

Key management (EigenCompute KMS):

- Use deterministic mnemonic derivation for a relayer key.
- Do not rely on "TEE alone" for safety. The main risk is turning the service into a transaction oracle.
- Note: EigenCompute "distributed KMS" may not be available in all environments yet; assume "single operator KMS" availability constraints and plan for explicit key rotation (see below).

Security requirements (non-negotiable):

- Settle endpoint must be private or authenticated (bearer token at minimum).
- Strict tx policy:
  - chain must be Base Sepolia only (84532)
  - token must be the Base Sepolia USDC address we allow
  - only settle exact-scheme EIP-3009 `transferWithAuthorization`
  - bounded `amount` and bounded auth window
- `eth_call` simulation before sending, when practical.
- Idempotency keyed by authorization nonce/signature hash to prevent duplicates.
- Small ETH balance on relayer to limit gas-loss blast radius.

Operational requirements:

- Reliable RPC (prefer multiple endpoints).
- Basic monitoring:
  - settlement request count, success rate
  - pending tx count and age
  - replay/idempotency hit rate

## Rollout Plan (Phased)

Phase 0: Spec and state compatibility

- Add segment schema and migration behavior (derive `segment_1` from existing rooms).
- Document replay policy as room-level.

Phase 1: Segments in session-voice

- Add `segments` state and `segments/start` endpoint.
- Update `/enter` to use `current_segment.payTo` for 402 requirements.
- Implement segment locking on first settlement attribution.
- Persist settlement attribution for later auditing.

Phase 2: Splits receiver creation

- Add a service/util to create Splits receivers on Base Sepolia.
- Wire room creation and segment start to create a receiver and set `segment.payTo`.
- Add upstream recipient inclusion for derivative segments.

Phase 3: Self-host facilitator

- Use the in-repo `services/x402-facilitator` for Base Sepolia-only settlement (ship path).
- Lock down settle endpoint (auth or private binding).
- Deploy on EigenCompute when we want enclave isolation for the relayer key.
- Optional upgrade: replace the facilitator implementation with `x402-rs` once we want a Rust-only stack.

Phase 4: Story integration

- Store rights snapshot and Room Agreement hash in DO.
- Add post-recording job to register Story IP and link derivatives.
- Add UI path for selecting source Story IP from published catalog.

## Testing Plan

Manual browser (MetaMask) coverage:

- Create ticketed room, enter via `/watch`, confirm 402 flow + settlement.
- Start new segment, confirm an already-entitled viewer re-enters without re-pay.
- Confirm a new wallet entering after segment switch pays to the new segment `payTo`.

API-level:

- Expand existing smoke tests to include segment switching and settle attribution.
- Add facilitator tests around idempotency and reject-policy cases (wrong chain, wrong token, excessive amount).

## Open Questions

- Replay monetization beyond V1:
  - Do we produce replay per segment, or do we treat the whole session as one replay product with a unified receiver?
- Rights attestation requirements:
  - Is user-provided `upstream_payout` acceptable, or do we require an IP-owner signature?
- Key rotation for facilitator relayer:
  - Derivation path index via env to allow rotation without changing app identity.
- Split receiver creation gas payer (if we ever automate it):
  - default: host-paid (keeps us non-custodial and avoids a cheap DOS vector)
  - if platform-paid: require anti-spam guardrails (quotas, deposits, or "only after first paid entry")
