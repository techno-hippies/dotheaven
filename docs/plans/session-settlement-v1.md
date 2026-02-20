# Session Settlement V1: Oracle-Assisted, P2P Media

## Goal

Ship reliable scheduled-session settlement on Tempo with:

1. P2P media path for host/guest calls.
2. Deterministic on-chain escrow outcomes.
3. Minimal backend dependence limited to attestation/orchestration.
4. Optional AI transcription/diarization as evidence, not as a hard gate.

## Scope Guardrails (V1)

1. Keep `SessionEscrowV1` unchanged for settlement logic.
2. Keep media transport independent from settlement (Agora call can fail without forcing incorrect payout).
3. Use deterministic presence overlap for attestation decisions.
4. Keep STT/diarization out of payout-critical path.
5. Keep dispute/challenge/finalize fully on-chain.

Out of scope for V1:

1. Fully backendless settlement.
2. ML-only settlement decisions.
3. Contract changes for mutual-signer attestation.

## Current Contract Reality

`SessionEscrowV1` is oracle-attested today:

1. `attest(...)` is `onlyOracle` (`contracts/tempo/src/SessionEscrowV1.sol`).
2. If no attestation arrives, `claimIfUnattested(...)` refunds guest after buffer.
3. `challenge(...)`, `resolveDispute(...)`, `finalizeDisputeByTimeout(...)`, and `finalize(...)` already enforce dispute/finality on-chain.

Implication:

1. Pure P2P on-chain settlement with no attester backend is not possible in V1 contract.
2. Practical V1 is "P2P media + oracle-assisted settlement".

## V1 Architecture

### 1) On-chain escrow plane

1. `SessionEscrowV1` stores slots, bookings, booking terms snapshots, outcomes, challenge state, and owed balances.
2. Parties withdraw via `withdrawOwed()` after finalization/cancellation paths.

### 2) Client/media plane

1. Host and guest join call via `SessionVoiceApi` (`/session/join`, `/session/:id/leave`).
2. Android call lifecycle is handled by `ScheduledSessionVoiceController`.
3. Media can be P2P-ish from a product perspective, but settlement does not depend on packet-level media telemetry.

### 3) Presence/attestation plane (backend)

1. `voice-control-plane` records participant join/leave data.
2. Attester computes overlap and outcome.
3. Attester submits on-chain `attest(...)` with `metricsHash`.
4. Contract challenge/finalize handles adversarial scenarios.

### 4) Optional evidence plane (advanced)

1. Audio artifacts can be sent to transcription/diarization provider (for example Voxtral batch transcription with diarization).
2. Resulting transcript/segments are auxiliary evidence for disputes and analytics.
3. Evidence hash can be committed in `metricsHash` pipeline or linked off-chain.

## Oracle Implementation (V1)

Current oracle endpoint:

1. `services/voice-control-plane/src/routes/sessions.ts` (`POST /:id/attest`) is the oracle entrypoint today.
2. It is service-token gated (`x-service-token`) and signs on-chain with `ORACLE_PRIVATE_KEY`.
3. Join/leave participation data is read from D1 (`room_participants`) for outcome calculation.

Trigger model:

1. V1 baseline: cron sweeper (safest first implementation).
2. V1.1 optimization: leave-hook scheduling after participant leave events, with debounce/retry.
3. Do not attempt immediate attest on first leave event; schedule with delay and re-check timing windows.

Leave-hook safety rules:

1. Treat `grace_not_over` and `overlap_not_met` as retryable timing states, not terminal failures.
2. Retry until valid window opens or until window latest bound is exceeded.
3. Avoid firing before session timing bounds where possible.

Dual-trigger idempotency (cron + leave-hook):

1. Both trigger paths may race on the same booking.
2. Before submit, fetch booking and short-circuit success when status is no longer `Booked`.
3. If concurrent submit causes a `NOT_BOOKED`-style revert, treat as idempotent success/no-op for monitoring.

## Attestation Policy (V1)

Primary inputs:

1. Host join timestamp.
2. Host leave timestamp.
3. Guest join timestamp.
4. Guest leave timestamp.
5. Slot parameters (`graceMins`, `minOverlapMins`, `durationMins`).

Decision policy:

1. If both joined and overlap >= `minOverlapMins`, attest `Completed`.
2. If host absent/insufficient overlap attributable to host, attest `NoShowHost`.
3. If guest absent/insufficient overlap attributable to guest, attest `NoShowGuest`.
4. Enforce contract attestation windows before submit.

Implementation reference:

1. `services/voice-control-plane/src/routes/sessions.ts` already mirrors contract windows and overlap checks.
2. `services/voice-control-plane/tests/unit/sessions-timing.test.ts` validates no-show and completed windows.

### Window Miss Handling (hard outcomes)

1. If attestation misses contract window bounds, `attest(...)` cannot be retried successfully for that outcome.
2. Backend must classify this as `window_missed` (terminal), not generic retriable failure.
3. Settlement then proceeds only through contract fallback path (`claimIfUnattested(...)` after buffer), which refunds guest.
4. Manual review can improve future policy and operations but cannot retroactively override on-chain outcomes.

### Metrics Hash Schema (V1 note)

1. Current `metricsHash` is a commitment to the existing JSON metrics payload shape.
2. This payload should be treated as schema-versioned data for reproducibility in disputes.
3. Any evidence-layer extension (for example transcript/diarization references) must bump schema version and be documented.

## Voxtral / STT Position

What we can use now:

1. Batch transcription.
2. Diarization in transcription endpoint.

What we should not use as a gate in V1:

1. Realtime transcription + diarization as payout blocker.
2. Model confidence thresholds as deterministic settlement criteria.

Recommended usage in V1.5:

1. Generate transcript + diarization evidence asynchronously after call end.
2. Store artifact URI/hash.
3. Surface to human dispute review and post-mortem tools.

## Are We Getting Ahead?

Yes, if STT/diarization is required before shipping settlement reliability.

No, if we sequence correctly:

1. First ship deterministic presence-based oracle attest.
2. Then add STT/diarization as supplemental evidence.
3. Later add contract-level mutual-signature path for true backendless settlement.

## Settlement Lifecycle Completion

1. `finalize(...)` settles booking outcomes into `owed[address]` balances in escrow contract storage.
2. Funds are not delivered to wallets until user calls `withdrawOwed()`.
3. Therefore, product completion requires both:
   1. state visibility (Booked/Attested/Disputed/Resolved/Finalized), and
   2. a claim flow (`owed` balance read + `withdrawOwed()` action).

Android implications:

1. Add read path for `owed` balance and recent finalized bookings.
2. Add explicit claim CTA and success/error states for `withdrawOwed()`.
3. Treat settlement as incomplete in UX until claim path exists.

## TODO

### Phase 0: Lock V1 policy

1. Freeze attestation rulebook in docs (this document).
2. Freeze window semantics to match contract.
3. Add explicit runbook for manual override/dispute handling.

### Phase 1: Complete product wiring

1. Implement cron-based auto-attestation sweeper (baseline trigger).
2. Add attestation idempotency guards for dual-trigger races.
3. Add booking state timeline in UI: Booked -> Attested/Disputed/Resolved -> Finalized.
4. Add `owed` balance visibility + `withdrawOwed()` claim flow.
5. Persist or remove local-only "Accepting bookings" toggle to avoid false control.
6. Implement Profile Schedule tab (currently placeholder).
7. Add structured logs/metrics around `attest`, `challenge`, `finalize`, and `window_missed`.

### Phase 2: Evidence layer (optional)

1. Add post-call audio export path.
2. Add transcription + diarization job.
3. Hash evidence payload and link to booking for auditability.
4. Keep settlement outcome source as deterministic presence policy.

### Phase 3: True backendless settlement (contract upgrade)

1. Design `SessionEscrowV2` with host+guest signed outcome attestation.
2. Use oracle only as fallback/dispute resolver.
3. Keep challenge and timeout logic compatible with V1 risk controls.
4. Plan migration path from V1 bookings to V2 for new sessions only.

## Definition of Done (V1)

1. Attestation success/failure is observable and explainable for every booking.
2. No payout depends on ML inference quality.
3. Challenge/finalize lifecycle is tested end-to-end.
4. UI exposes real status and funding path clearly.
