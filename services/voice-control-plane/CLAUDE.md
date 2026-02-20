# Voice Control Plane Service

Operational notes for `services/voice-control-plane`.

## Purpose
- Cloudflare Worker control plane for voice rooms.
- Handles auth, room lifecycle, credits, and duet paid-entry gates.
- Uses D1 + Durable Objects.

## Modes in This Codebase
- Free rooms (credit-gated, renewable short-lived tokens).
- Booked sessions (legacy/backward-compatible path).
- Duet rooms (paid access via x402, Base Sepolia USDC — note: x402 settlement is on Base Sepolia, not Tempo; this is intentional).

## Core Endpoints
- Auth: `/auth/nonce`, `/auth/verify`
- Credits/rooms: `/credits`, `/rooms/*`
- Booked session: `/session/*`
- Duet: `/duet/*`
- Health/discovery: `/health`, `/rooms/active`

## Local Development
From `services/voice-control-plane`:

```bash
bun install
bun run migrate:local
bun run dev
```

Migration scripts and smoke helpers:
- Preferred DB label override: `VOICE_CONTROL_PLANE_D1_DATABASE`
- Legacy fallback: `D1_DATABASE`

## Testing
From `services/voice-control-plane`:

```bash
bun run test:smoke
bun run test:duet:unit
bun run test:e2e:local
```

Useful paid-flow variants:

```bash
DUET_TEST_PAYER_PRIVATE_KEY=0x... bun run test:duet:self
SESSION_VOICE_URL=https://... DUET_REMOTE_WATCH_URL=https://.../duet/<roomId>/watch DUET_TEST_PAYER_PRIVATE_KEY=0x... bun run test:duet:self:remote
DUET_TEST_PAYER_PRIVATE_KEY=0x... bun run test:e2e:local:duet:onchain
DUET_TEST_FACILITATOR_PRIVATE_KEY=0x... bun run dev:duet:onchain
```

## Facilitator Wiring
- `X402_FACILITATOR_MODE=mock`: no on-chain settlement.
- `X402_FACILITATOR_MODE=self`: preferred; calls our Rust facilitator.
- `PAYMENT_FACILITATOR_BASE_URL` is preferred; `X402_FACILITATOR_BASE_URL` remains supported as fallback.

## Required Secrets (Cloudflare)
- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `JWT_SECRET`
- `X402_FACILITATOR_AUTH_TOKEN` (when using `self` mode)

## Files You Will Touch Most
- `services/voice-control-plane/src/index.ts`
- `services/voice-control-plane/src/activity.ts`
- `services/voice-control-plane/src/duet-room-do.ts`
- `services/voice-control-plane/src/x402-facilitator.ts`
- `services/voice-control-plane/wrangler.toml`
