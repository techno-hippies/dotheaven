# Duet Room V1: Smallest Workable Paid Live + Replay

## Goal

Ship one small product:

1. Two singers perform live (duet).
2. Audience pays to watch/listen.
3. Revenue goes to a 50/50 Splits contract.
4. Replay is paid and expires after 24h.

## What Is Locked In (V1 Scope Guardrails)

1. One live gate only: can viewer get an Agora viewer token?
2. One replay gate only: can viewer get replay access?
3. One payment rail only: x402 v2 + USDC on one chain (Base Sepolia only; mainnet explicitly disabled for now).
4. One entitlement rule only: successful payment grants 24h from now.
5. One payout receiver only: room `split_address` (50/50 split contract).
6. One performer transport only: JackTrip.
7. One audience transport only: Agora.
8. Ticketed means x402 payment-gated access, not NFT mint/ownership gating.

Out of scope:

1. Classes and schedules.
2. Multi-tier ticketing.
3. Audience speaking/stage requests.
4. Complex payout automation.
5. NFT-based access control.

## Architecture (One Sentence)

Cloudflare Worker + Durable Object is room authority and entitlement cache, Agora is audience transport, JackTrip is performer transport, and a bridge process converts JackTrip audio into an Agora broadcast plus recording.

## Bridge Runtime Reality

The bridge is a long-running media process that:

1. Receives performer audio from JackTrip/JACK on a machine that has it.
2. Publishes to Agora as broadcaster.
3. Captures recording (or triggers recording) for replay.

Important constraint:

1. The bridge cannot run inside Cloudflare Worker or Durable Object.
2. Worker/DO stays control plane only (HTTP, state, entitlements, token minting).
3. Bridge must run on persistent compute with audio/network runtime and stable uplink.

## Component Responsibilities

### Worker + Durable Object (control plane)

1. Create and manage duet room state.
2. Store pricing, split address, room status, entitlements, recording metadata.
3. Mint Agora viewer tokens.
4. Run x402 checks and settlement verification in handler logic.
5. Return 402 requirements using room-specific payee (`split_address`).

### Bridge process (data plane)

1. Join/capture JackTrip audio.
2. Publish audio to Agora as broadcaster.
3. Capture recording artifact.
4. Upload artifact and report completion metadata to Worker/DO.

### Bridge placement strategy

#### V1 default (recommended): host-run bridge

1. Bridge runs on musician_1 machine (same environment where JackTrip/JACK mix exists).
2. No always-on bridge infrastructure operated by us.
3. Reliability is host-dependent (CPU/network/crash risk), acceptable for V1.

#### V1.5 scale path: managed bridge pool

1. One ephemeral container per live room (Fargate/Fly/Cloud Run equivalent).
2. Worker/DO starts/stops bridge jobs and tracks health.
3. Better reliability and observability, but adds compute operations.

#### Hard topology constraint (must be explicit)

If bridge is not host-run, it still needs performer audio. Cloud bridge only works if at least one is true:

1. Bridge can join JackTrip session directly as participant.
2. We run our own JackTrip hub/mix path.
3. Performers send parallel ingest to bridge.

V1 should assume host-run bridge to avoid this ingestion complexity.

### Splits contract

1. Receives payments as x402 payee.
2. Distribution/withdrawals handled by Splits flow (manual in v1).

## Chain and Payment Notes

1. Default target: Base Sepolia USDC (testnet only for now).
2. If replay uses Load-hosted x402 links, confirm network support for your production chain.
3. If network support is not aligned, use Worker-gated replay with your own x402 settlement path and Load for storage only.

Use explicit payment fields in room metadata:

1. `network` as CAIP-2 (`eip155:84532` for Base Sepolia).
2. `asset_usdc` as token address for the selected network.
3. `live_amount` and `replay_amount` in USDC base units (6 decimals; `$0.10` -> `"100000"`).

### Facilitator integration mode

Use one adapter interface and swap backend by env:

1. `X402_FACILITATOR_MODE=mock` for local e2e/dev smoke tests (no chain settlement).
2. `X402_FACILITATOR_MODE=cdp` for real settlement via facilitator `/settle`.
3. `X402_FACILITATOR_BASE_URL` selects provider endpoint.
4. `X402_FACILITATOR_AUTH_TOKEN` is provider-specific:
   1. required for Coinbase CDP and our local facilitator
   2. not required for OpenX402

Notes:

1. Load-gated replay links (`402.load.network`) can use Load-managed paywall/settlement.
2. Worker-gated endpoints (`/duet/:id/enter`, `/duet/:id/replay`) still require our DO to call a facilitator before granting entitlement.
3. Planned (not wired by default yet): OpenFacilitator + multi-facilitator failover for better liveness/censorship-resistance.

## Durable Object Schema (Minimal + Correct)

```ts
type WalletEntitlement = {
  live_expires_at?: number   // unix seconds
  replay_expires_at?: number // unix seconds
}

type DuetRoomState = {
  room_id: string
  status: 'created' | 'live' | 'ended'

  host_wallet: string
  guest_wallet?: string
  split_address: string

  network: 'eip155:8453' | 'eip155:84532'
  asset_usdc: string
  live_amount: string
  replay_amount: string
  access_window_minutes: number // 1440 default

  jacktrip: {
    server: string
    port: number
    room_key?: string
  }

  agora: {
    channel: string
  }

  recording?: {
    load_dataitem_id: string
    replay_url?: string
    replay_x402_url?: string
    created_at: number
  }
}
```

Persist DO storage as keyed records, not one giant JSON blob:

1. `meta` -> room metadata/state.
2. `ent:<wallet>` -> `WalletEntitlement`.
3. `settle:<paymentSigHash>` -> processed marker + timestamp.

## API (V1-Tight)

Prefix: `/duet`

1. `POST /create`
   1. Auth: host wallet auth.
   2. Input: `guest_wallet` (optional prefill), `split_address`, pricing, window.
   3. Output: `room_id`, `agora.channel`, performer bootstrap metadata.
2. `POST /:id/guest/accept`
   1. Auth: guest wallet auth.
   2. Confirms/locks guest wallet on room.
3. `POST /:id/start`
   1. Host only.
   2. Sets `status=live`.
   3. Host can start even if invited guest has not accepted yet (room starts solo and guest may join later).
   4. Idempotent while live: repeated start returns existing bridge credentials (does not rotate ticket).
   5. Returns bridge bootstrap payload:
      1. `bridge_ticket` (random bearer secret)
      2. `agora_channel`
      3. `agora_broadcaster_token` (short TTL)
      4. optional `recording_upload_url` (signed target)
      5. optional `recording_mode` (`host_local` or `agora_cloud`)
4. `POST /:id/enter`
   1. Audience live entry endpoint.
   2. x402 v2 single endpoint (no separate confirm endpoint).
   3. Ticketed mode: 402 -> pay -> retry flow; on success returns Agora viewer token.
   4. Free mode: no payment required; returns Agora viewer token directly.
5. `GET /:id/public-info`
   1. Public room status for watcher pages.
   2. Includes `audience_mode` and `broadcaster_online`.
6. `POST /:id/public-enter`
   1. Public watcher entry endpoint used by `/watch`.
   2. Free mode: returns Agora viewer token directly.
   3. Ticketed mode: 402 -> pay -> retry with `PAYMENT-SIGNATURE`.
7. `POST /:id/broadcast/heartbeat`
   1. Host broadcast page heartbeat (bridge ticket auth).
   2. Updates DO broadcast liveness state used by `public-info`.
8. `POST /:id/end`
   1. Host only.
   2. Sets `status=ended`.
9. `POST /:id/recording/complete`
   1. Bridge/backend only (`Authorization: Bearer <bridge_ticket>`).
   2. Stores `load_dataitem_id` and replay metadata (`replay_url` or `replay_x402_url`).
10. `GET /:id/replay`
   1. Replay access endpoint.
   2. Behavior depends on replay mode (Load-gated or Worker-gated).

## x402 v2 Handler Behavior (Dynamic Payee, Per Room)

Implement x402 logic in route handlers, not static middleware config.

For `POST /duet/:id/enter`:

1. Load room from DO and read `split_address`, `network`, `asset_usdc`, `live_amount`, `access_window_minutes`.
2. Resolve viewer wallet identity (auth or settled payment payload).
3. If `live_expires_at > now`: return Agora viewer token.
4. If `live_amount == "0"`: grant entitlement window and return Agora viewer token (no x402 step).
5. Else if request includes `PAYMENT-SIGNATURE` header:
   1. Settle/verify payment against room-specific requirements.
   2. Compute idempotency key from raw `PAYMENT-SIGNATURE` header bytes:
      1. `paymentSigHash = sha256(payment_signature_raw_string)`
      2. If `settle:<paymentSigHash>` already exists, return prior-equivalent success.
      3. Else settle and write `settle:<paymentSigHash>`.
   3. Grant entitlement using:
      1. `base = max(current_live_expires_at, now)`
      2. `live_expires_at = base + access_window_minutes * 60`
   4. Return `200` with Agora viewer token and `live_expires_at`.
   5. Optionally include `PAYMENT-RESPONSE` header.
6. Else return `402 Payment Required` with `PAYMENT-REQUIRED` header containing requirements:
   1. `accepts[0].scheme = "exact"`
   2. `accepts[0].network = room.network`
   3. `accepts[0].asset = room.asset_usdc`
   4. `accepts[0].amount = room.live_amount`
   5. `accepts[0].payTo = room.split_address`
   6. `resource = /duet/:id/enter`

Same pattern for replay if replay is Worker-gated.

### CORS Requirements For Browser Clients

If frontend origin differs from Worker origin:

1. `Access-Control-Allow-Headers` must include:
   1. `PAYMENT-SIGNATURE`
   2. `Authorization`
   3. `Content-Type`
2. `Access-Control-Expose-Headers` must include:
   1. `PAYMENT-REQUIRED`
   2. `PAYMENT-RESPONSE`

## Replay Modes (Choose One Before Build)

### Mode A: Load-gated replay (fastest)

1. Store `replay_x402_url` created from Load flow.
2. `GET /duet/:id/replay` returns that URL.
3. Payment and expiry are enforced at replay gateway level.
4. This mode does not use Worker replay entitlement cache as primary enforcement.

### Mode B: Worker-gated replay (chain-consistent)

1. `GET /duet/:id/replay` runs x402 in Worker.
2. On success, Worker returns short-lived signed replay fetch URL or proxied stream token.
3. Load is storage only; payment gate remains in your control plane.

## Recording Source Modes

### Recording mode 1: host-local recording (default V1)

1. Bridge records locally on host machine while publishing to Agora.
2. On room end, bridge uploads artifact and calls `/recording/complete`.
3. Lowest integration effort, highest host dependency.

### Recording mode 2: Agora cloud recording

1. Bridge only publishes to Agora.
2. Recording retrieved from Agora recording pipeline after room end.
3. Fewer host-side failure modes, but introduces vendor dependency/cost.

## Live and Replay Entitlement Rule

On successful payment:

1. `expires_at = max(existing_expires_at, now) + window`
2. Apply independently per entitlement type:
   1. `live_expires_at`
   2. `replay_expires_at`

This preserves remaining time when users renew early.

### Pruning Rules

1. Entitlements:
   1. Opportunistically delete expired `ent:<wallet>` entries on room reads/writes.
2. Settlement idempotency:
   1. Delete `settle:<hash>` markers after 48h.

## Implementation Plan

### Phase 1: Control plane and live gate

1. Add `/duet` routes in `services/session-voice`.
2. Add new duet DO state type and handlers.
3. Implement `POST /:id/enter` as x402-native single endpoint.
4. Implement Agora viewer token minting path.

### Phase 2: Performer flow and bridge handshake

1. Host creates duet room.
2. Guest confirms via `/guest/accept`.
3. Start endpoint returns `bridge_ticket` + Agora broadcaster credentials.
4. Host-run bridge process starts and publishes stream.
5. GPUI invite payload uses real `room_id` and backend metadata.

### Phase 3: Replay finalize path

1. Bridge uploads recording and calls `/recording/complete`.
2. Implement selected replay mode endpoint behavior.
3. Add replay UX in frontend.

### Phase 4: Managed bridge (optional after V1)

1. Add job runner for per-room bridge containers.
2. Add bridge health endpoint and room-level health state.
3. Move from host-run to managed pool only after V1 live/replay metrics are stable.

## Repo Implementation Map

1. Worker:
   1. `services/session-voice/src/index.ts`
   2. `services/session-voice/src/routes/duet.ts` (new)
   3. `services/session-voice/src/room-do.ts` (extend) or `duet-room-do.ts` (new)
   4. `services/session-voice/wrangler.toml`
2. GPUI:
   1. `apps/gpui-poc/src/chat.rs`
   2. `apps/gpui-poc/src/voice/session.rs`
3. Frontend:
   1. `apps/frontend/src/lib/voice/rooms.ts`
   2. `apps/frontend/src/pages/RoomPage.tsx`

## Acceptance Criteria

1. Host creates duet room with split address and pricing.
2. Guest accepts and can join performer path.
3. Live viewer entry uses one endpoint (`POST /enter`) and supports 402->pay->retry via x402 v2 headers.
4. Entitled viewer can re-enter without re-paying until expiry.
5. Replay access is enforced by the selected replay mode with 24h expiry.
6. All payees for live and replay are the room split contract address.

## Current Implementation Status (2026-02-14)

### Implemented now

1. Worker/DO duet control plane is live:
   1. room create/start/end
   2. guest accept
   3. bridge token refresh (`POST /duet/:id/bridge/token`)
   4. live/replay entitlement state and idempotency markers
   5. x402 v2 header semantics in duet handlers (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`)
2. GPUI duet create flow is now explicit:
   1. create room does not auto-start
   2. host enters room detail in `Setup` state
   3. host clicks `Start Room` to move to ready/live setup
3. GPUI host room state machine and UI are simplified:
   1. `Setup` -> `Ready` (connect audio) -> `Ready` (go live) -> `Live` -> `Ended`
   2. max two visible actions per state
   3. `Share Link` copies the viewer `/watch` URL
   4. noisy native-bridge-disabled messaging removed from primary host view
4. Linux/browser bridge path is functional and is the current V1 path:
   1. `Use JackTrip Audio Source` helper creates/reuses virtual sink and monitor source
   2. host opens `/duet/:id/broadcast?bridgeTicket=...`
   3. audience joins `/duet/:id/watch`
   4. free-room audio flow is working end-to-end
5. Broadcast page UX was redesigned and deployed:
   1. source: `services/session-voice/src/routes/duet.ts` (`GET /duet/:id/broadcast`)
   2. clearer action hierarchy, larger status/readability, microphone diagnostics panel
   3. deployed at `https://session-voice.deletion-backup782.workers.dev`
6. Linux audio routing reliability pass:
   1. helper now creates a remapped virtual microphone source (`jacktrip_duet_input`) from `jacktrip_duet.monitor`
   2. helper no longer changes global default source unless explicitly opted in (`HEAVEN_DUET_SET_DEFAULT_SOURCE=1`)
   3. broadcast page mic picker now prefers JackTrip/remapped sources over generic `Default`
   4. host room now surfaces `Restore System Mic` when default input is still pointed at duet virtual source
   5. host room includes `Copy Diagnostics` to export room/audio state for debugging
7. Viewer status messaging tune-up:
   1. `/watch` now switches to “Live audio connected” after remote audio subscription
   2. no longer stuck on “waiting for host audio” when subscribed audio is already flowing
8. Ticketed `/watch` parity (mock + real):
   1. In `X402_FACILITATOR_MODE=mock`, `/watch` completes 402 -> mock pay -> retry automatically (no chain settlement).
   2. In non-mock facilitator modes, `/watch` now does real Base Sepolia x402 checkout:
      1. MetaMask connect + Base Sepolia switch
      2. wallet sign-in (`/auth/nonce` + `/auth/verify` → JWT)
      3. EIP-712 `TransferWithAuthorization` signing (`eth_signTypedData_v4`) → `PAYMENT-SIGNATURE`
      4. retries `POST /duet/:id/enter` (authenticated) and joins Agora
   3. Viewer token renewal is implemented (renew every ~45s; does not re-pay while entitlement is valid).
   4. `POST /duet/:id/public-enter` remains for free rooms + mock-mode flows; real-mode entitlements are wallet-bound via `/enter`.
   5. Real mode is wallet-tied across devices; mock mode is effectively device/localStorage-tied.
9. Broadcast heartbeat path is now live:
   1. `/duet/:id/broadcast` sends periodic authenticated heartbeats while publishing
   2. new endpoint `POST /duet/:id/broadcast/heartbeat` updates DO broadcast state
   3. `public-info` now reports `broadcaster_online` and heartbeat metadata
   4. GPUI host stage now uses broadcaster heartbeat polling (not just “broadcast page opened”)

10. Base Sepolia-only safety rails (no mainnet):
   1. `/duet/create` rejects any `network` other than `eip155:84532`.
   2. DO `/init` rejects any `network` other than `eip155:84532`.
   3. `asset_usdc` is pinned to Base Sepolia USDC (`0x036cbd53842c5426634e7929541ec2318f3dcf7e`).

11. Automated no-UI tests exist:
   1. `services/session-voice/src/duet-room-do.test.ts` covers DO x402 semantics (mock).
   2. `services/session-voice/src/smoke-test-duet.ts` covers HTTP control-plane + mock 402->pay->retry.
   3. `services/session-voice/src/smoke-test-duet-cdp.ts` covers real Base Sepolia USDC settlement via a `/settle` facilitator (OpenX402, CDP, or local).

### Known gaps

1. Deployed Cloudflare worker is still configured for mock settlement by default:
   1. `services/session-voice/wrangler.toml` sets `X402_FACILITATOR_MODE=mock`.
   2. Real settlement requires configuring a public facilitator (`X402_FACILITATOR_MODE=cdp`, `X402_FACILITATOR_BASE_URL`, and optionally `X402_FACILITATOR_AUTH_TOKEN` depending on the provider).
   3. OpenFacilitator + multi-facilitator failover is planned but not enabled by default yet.
2. Broadcast health is heartbeat-based (publisher liveness), not true end-to-end audio-level verification.
3. Native Linux bridge remains experimental and is not the default path.
4. Recording finalize/upload path is not completed end-to-end from bridge to replay UX.

### Platform status (V1)

1. Linux:
   1. production-intended V1 path is browser bridge + Pulse/PipeWire virtual mic (`jacktrip_duet_input`)
   2. native Agora bridge is still experimental and not default
2. macOS/Windows:
   1. browser bridge path is available
   2. native bridge support depends on SDK packaging/build and is not required for V1 ship criteria

## What Is Next (Ordered)

### Milestone 1: Ticketed web viewer parity (Done)

1. `/watch` implements real Base Sepolia x402 checkout (MetaMask + JWT + EIP-3009 typed-data signature).
2. `/watch` renews Agora viewer tokens without re-payment while entitlement is valid.
3. Entitlements are wallet-bound in real mode (authenticated `/enter`), not device-bound.

### Milestone 1.5: Public facilitator (Cloudflare) wiring (Next)

1. Configure the deployed worker to use a public facilitator (likely OpenFacilitator), rather than `mock`.
2. Optional: add multi-facilitator failover for liveness/censorship-resistance.

### Milestone 2: Truthful live state

1. Done: add lightweight broadcast heartbeat/status endpoint from `/broadcast` page to DO.
2. Done: GPUI `Live` state now uses broadcaster heartbeat polling instead of link-open action.
3. Remaining: optional media-level checks (remote subscriber/audio level) if we need stricter “on air” semantics.

### Milestone 3: Replay completion path

1. Finish bridge -> `POST /duet/:id/recording/complete`.
2. Complete replay UX for chosen mode:
   1. Mode A Load-gated replay URL
   2. or Mode B Worker-gated replay token/proxy

### Milestone 4: Bridge hardening

1. Keep browser bridge as Linux default.
2. Keep native bridge behind explicit experimental toggle until stable.
3. Add crash/health surfacing in host UI advanced/debug panel only.

## Immediate Manual Test Flow

1. Free room:
   1. Create room in GPUI
   2. `Start Room`
   3. `Connect Audio Source`
   4. `Go Live`
   5. On broadcast page, start app audio share or mic
   6. Verify `/watch` hears audio
2. State transitions:
   1. verify Setup -> Ready -> Live -> Ended badges/actions
   2. verify `Share Link` copies viewer URL
3. Ticketed room:
   1. in mock facilitator mode, verify `/watch` completes 402 -> auto mock pay -> joins live
   2. in non-mock mode, verify `/watch` prompts wallet connect/sign-in and completes real x402 payment on Base Sepolia

## Automated Test Flow (No UI)

From `services/session-voice`:

1. Unit: `npm run test:duet:unit`
2. Smoke (requires a running worker at `SESSION_VOICE_URL`, default `http://localhost:3338`): `npm run test:duet`
3. Local e2e (starts worker + runs smoke): `npm run test:e2e:local`
4. Local e2e with real Base Sepolia settlement (local facilitator, on-chain): `DUET_TEST_PAYER_PRIVATE_KEY=0x... npm run test:e2e:local:duet:onchain`
5. Local e2e with real Base Sepolia settlement (OpenX402): `DUET_TEST_PAYER_PRIVATE_KEY=0x... npm run test:e2e:local:duet:openx402` (optional `DUET_TEST_SPLIT_ADDRESS=0x...`). Note: OpenX402 settlement requires their Base Sepolia signer to be funded for gas; if it’s out of gas, fund it or use `test:e2e:local:duet:onchain`.
6. Local e2e with real Base Sepolia settlement (Coinbase CDP): `X402_FACILITATOR_AUTH_TOKEN=... DUET_TEST_PAYER_PRIVATE_KEY=0x... npm run test:e2e:local:duet:cdp`
7. Remote live room + real Base Sepolia settlement (facilitator): `SESSION_VOICE_URL=... DUET_REMOTE_WATCH_URL=... DUET_TEST_PAYER_PRIVATE_KEY=0x... npm run test:duet:cdp:remote`
8. Local dev server for UI + real settlement (local facilitator): `DUET_TEST_FACILITATOR_PRIVATE_KEY=0x... npm run dev:duet:onchain`

Notes:

1. These duet tests are locked to Base Sepolia (`eip155:84532`).
2. The duet API rejects Base mainnet (`eip155:8453`) so you can’t accidentally move real money.
3. `test:e2e:local:duet:onchain` starts a local `/settle` facilitator that submits USDC `transferWithAuthorization` txs to Base Sepolia.
4. Why the facilitator private key exists: the facilitator is the one that broadcasts the on-chain settlement transaction (and pays Base Sepolia gas). When you use a public facilitator from Cloudflare, you do not need a local facilitator key.

## Open Decisions Still Needed

1. Replay mode default:
   1. Mode A Load-gated
   2. Mode B Worker-gated
2. Viewer identity strategy for re-entry:
   1. wallet auth each enter
   2. derive from payment payload/session issuance
3. Recording source default after V1:
   1. host-local recording
   2. Agora cloud recording

## V1 Defaults (Current)

1. `live_price_usdc = 0.10`
2. `replay_price_usdc = 0.10`
3. `access_window_minutes = 1440`
4. GPUI dev network: Base Sepolia (`eip155:84532`)
5. Keep `SessionEscrowV1` for scheduled 1:1 sessions/classes only, not duet live rooms.
