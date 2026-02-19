# Session Voice Service

Operational notes for `services/session-voice`.

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
From `services/session-voice`:

```bash
npm install
bun run migrate:local
bun run dev
```

## Testing
From `services/session-voice`:

```bash
bun run test:smoke
bun run test:duet:unit
bun run test:e2e:local
```

Useful paid-flow variants:

```bash
DUET_TEST_PAYER_PRIVATE_KEY=0x... bun run test:e2e:local:duet:openx402
DUET_TEST_PAYER_PRIVATE_KEY=0x... bun run test:e2e:local:duet:onchain
DUET_TEST_FACILITATOR_PRIVATE_KEY=0x... bun run dev:duet:onchain
```

## Facilitator Wiring
- `X402_FACILITATOR_MODE=mock`: no on-chain settlement.
- `X402_FACILITATOR_MODE=self`: preferred; calls our Rust facilitator.
- `X402_FACILITATOR_MODE=cdp`: external facilitator compatibility path.

## Required Secrets (Cloudflare)
- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `JWT_SECRET`
- `X402_FACILITATOR_AUTH_TOKEN` (when using `self` mode)

## Files You Will Touch Most
- `services/session-voice/src/index.ts`
- `services/session-voice/src/activity.ts`
- `services/session-voice/src/duet-room-do.ts`
- `services/session-voice/src/x402-facilitator.ts`
- `services/session-voice/wrangler.toml`
