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
3. One payment rail only: x402 v2 + USDC on one chain (Base Sepolia in dev/test, Base mainnet in production).
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

1. Default target: Base mainnet USDC.
2. If replay uses Load-hosted x402 links, confirm network support for your production chain.
3. If network support is not aligned, use Worker-gated replay with your own x402 settlement path and Load for storage only.

Use explicit payment fields in room metadata:

1. `network` as CAIP-2 (`eip155:8453` for Base mainnet, `eip155:84532` for Base Sepolia).
2. `asset_usdc` as token address for the selected network.
3. `live_amount` and `replay_amount` in USDC base units (6 decimals; `$0.10` -> `"100000"`).

### Facilitator integration mode

Use one adapter interface and swap backend by env:

1. `X402_FACILITATOR_MODE=mock` for local e2e/dev smoke tests (no chain settlement).
2. `X402_FACILITATOR_MODE=cdp` for real settlement via facilitator `/settle`.
3. `X402_FACILITATOR_BASE_URL` selects provider endpoint.
4. `X402_FACILITATOR_AUTH_TOKEN` is required in real mode.

Notes:

1. Load-gated replay links (`402.load.network`) can use Load-managed paywall/settlement.
2. Worker-gated endpoints (`/duet/:id/enter`, `/duet/:id/replay`) still require our DO to call a facilitator before granting entitlement.

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
5. `POST /:id/end`
   1. Host only.
   2. Sets `status=ended`.
6. `POST /:id/recording/complete`
   1. Bridge/backend only (`Authorization: Bearer <bridge_ticket>`).
   2. Stores `load_dataitem_id` and replay metadata (`replay_url` or `replay_x402_url`).
7. `GET /:id/replay`
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
4. Host-run bridge process starts, publishes stream, and posts heartbeat.
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

## Two Decisions Required Before Implementation

1. Replay mode:
   1. Mode A Load-gated replay (faster)
   2. Mode B Worker-gated replay (more chain-consistent)
2. Viewer identity for entitlement re-entry:
   1. Require viewer auth token/wallet proof on each enter
   2. Derive identity from payment payload only
3. Bridge execution mode:
   1. Host-run bridge (V1 default)
   2. Managed bridge pool (defer to post-V1 unless reliability demands it)
4. Recording source mode:
   1. Host-local recording (V1 default)
   2. Agora cloud recording (V1.5 candidate)

## V1 Defaults

1. `live_price_usdc = 0.10`
2. `replay_price_usdc = 0.10`
3. `access_window_minutes = 1440`
4. Keep `SessionEscrowV1` for scheduled 1:1 sessions/classes only, not duet live rooms.
