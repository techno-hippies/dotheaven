# Session Voice Service

Cloudflare Worker + D1 + Durable Objects for voice session management.

## Architecture

- **CF Worker** (Hono router): Auth, credit management, room lifecycle
- **D1**: Credit ledger, room records, participant tracking, auth nonces
- **Durable Objects** (RoomDO): Live room state per room, heartbeat alarm, metering

## Two Session Types

### Free Rooms (new)
- Credit-gated: 1800s base (requires .heaven name) + 1800s Celo bonus
- Short-lived Agora tokens (90s TTL, renewed every 45s)
- Per-second credit metering via heartbeat alarm (30s)
- Server denies token renewal when credits < 90s → natural disconnect
- Up to 6 participants per room

### Booked Sessions (backward-compatible)
- On-chain validation via SessionEscrowV1
- Long-lived Agora tokens (3600s TTL, no renewal needed)
- 2 participants (host + guest)
- Oracle attestation for outcome

### Duet Rooms (paid, Base Sepolia only)
- x402 v2 + USDC (locked to `eip155:84532`; mainnet explicitly rejected).
- Audience live gate: `POST /duet/:id/enter` (JWT auth) issues Agora viewer token; returns `402` with `PAYMENT-REQUIRED` if not entitled.
- Live payouts are **segment-based**:
  - Each room has `segments[]` and a `current_segment_id`.
  - New payments use `current_segment.pay_to` as x402 `payTo`.
  - Entitlements are room-level (grandfathered): viewers do not re-pay when a new segment starts.
  - Host can start a new segment: `POST /duet/:id/segments/start` (host JWT) with body `{ "pay_to": "0x..." }`.
- Replay payouts are room-level in V1: replay requirements still use the room `split_address` unless we also split replay assets per segment.
- `/duet/:id/watch` includes browser checkout:
  - `X402_FACILITATOR_MODE=mock`: auto 402 -> mock pay -> retry (device/localStorage wallet).
  - non-mock: MetaMask connect + Base Sepolia switch, nonce auth (`/auth/nonce` + `/auth/verify`), EIP-712 `TransferWithAuthorization` signing, retry `/enter`, and token renewal without re-pay while entitled.
- Replay gate (worker-gated default): `GET /duet/:id/replay` returns a short-lived `replay_access_token` used by `GET /duet/:id/replay/source?token=...`.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/nonce | - | Get auth nonce |
| POST | /auth/verify | - | Verify signature, get JWT |
| GET | /credits | JWT | Credit balance |
| POST | /credits/verify-celo | JWT | Grant Celo bonus |
| POST | /rooms/create | JWT | Create free room |
| POST | /rooms/join | JWT | Join free room |
| POST | /rooms/heartbeat | JWT | Meter + check events |
| POST | /rooms/token/renew | JWT | Meter + renew Agora token |
| POST | /rooms/leave | JWT | Leave free room |
| POST | /session/join | JWT | Join booked session |
| POST | /session/:id/leave | JWT | Leave booked session |
| POST | /session/:id/attest | Internal | Oracle attestation |
| GET | /rooms/active | - | List open active rooms (public discovery) |
| GET | /health | - | Health check |

## Configuration

Secrets (via `wrangler secret put`):
- `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`
- `JWT_SECRET`
- `ORACLE_PRIVATE_KEY` (optional, for attestation)

## Running

```bash
wrangler d1 create session-voice  # create D1 database
# update database_id in wrangler.toml
bun run migrate:local             # apply schema
bun dev                           # start dev server
```

## Duet Testing (No UI)

From `services/session-voice`:

```bash
bun test

# mock-only e2e
npm run test:e2e:local

# real Base Sepolia settlement via OpenX402 (no auth token, but payTo must be whitelisted there)
# NOTE: OpenX402 settlement requires their Base Sepolia signer to be funded for gas; if it’s out of gas, fund it or use the local facilitator path.
# by default the harness uses OpenX402's own signer as payTo so it works out-of-the-box.
# set DUET_TEST_SPLIT_ADDRESS=0x... to test your own registered receiver.
DUET_TEST_PAYER_PRIVATE_KEY=0x... npm run test:e2e:local:duet:openx402

# real Base Sepolia settlement via local facilitator (needs a funded Base Sepolia key)
DUET_TEST_PAYER_PRIVATE_KEY=0x... npm run test:e2e:local:duet:onchain

# serve worker + local facilitator for UI testing (facilitator pays gas to settle)
DUET_TEST_FACILITATOR_PRIVATE_KEY=0x... npm run dev:duet:onchain
```

## Facilitator Modes

- `X402_FACILITATOR_MODE=mock`: local validation only (no on-chain transfer).
- `X402_FACILITATOR_MODE=cdp`: call remote facilitator `/settle` (CDP/OpenX402-compatible payload).
- `X402_FACILITATOR_MODE=self`: same as `cdp`, but intended for our own hosted facilitator service.
