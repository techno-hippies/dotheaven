# Session Voice Service

Bun/Hono service for P2P voice session management with Agora RTC.

## Overview

Handles voice sessions for booked appointments in SessionEscrowV1:
- JWT auth from wallet signatures
- Agora RTC token generation  
- Participation tracking for oracle attestation

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| POST | /auth | - | Get JWT from wallet signature |
| POST | /session/join | JWT | Join session, get Agora token |
| POST | /session/:id/leave | JWT | Leave session |
| GET | /session/:id/stats | JWT | Participation stats (participant only) |
| POST | /session/:id/attest | Internal | Oracle attests session outcome |

## Auth Flow

1. Client signs message `heaven-session:{timestamp}` with wallet
2. POST /auth with `{ wallet, message, signature }`
3. Service verifies signature, returns JWT (1hr expiry)
4. Client uses `Authorization: Bearer {jwt}` for subsequent requests

## Session Join Flow

1. Client calls POST /session/join with `{ booking_id }`
2. Service validates:
   - Booking exists and status = Booked
   - Caller is host or guest
   - Within join window (5 min before start → session end)
3. Returns `{ channel, agora_token, user_uid }`
4. Client joins Agora channel with token

## Channel Naming

Channels are named `heaven-{chainId}-{bookingId}` (e.g. `heaven-6343-1`).
Both host and guest get tokens for the same channel.

## Oracle Attestation Flow

1. Session ends (or no-show grace period elapses)
2. Service detects outcome from participation tracking:
   - `completed`: Both host and guest joined with sufficient overlap
   - `no-show-host`: Guest joined but host didn't
   - `no-show-guest`: Host joined but guest didn't
3. POST /session/:id/attest (internal call or cron)
4. Service computes metricsHash from participation data
5. Submits `attest(bookingId, outcome, metricsHash)` to contract
6. Challenge window begins (24h by default)

Query params:
- `?force_outcome=completed|no-show-host|no-show-guest` — manual override

## Configuration

```bash
# Required
AGORA_APP_ID=xxx
AGORA_APP_CERTIFICATE=xxx
JWT_SECRET=xxx

# Optional
PORT=3338
RPC_URL=https://carrot.megaeth.com/rpc
ESCROW_ADDRESS=0x132212B78C4a7A3F19DE1BF63f119848c765c1d2

# Oracle (for attestation)
ORACLE_PRIVATE_KEY=0x...  # Must be the oracle address set in contract

# Dev/Testing
MOCK_ESCROW=1
MOCK_HOST=0x...
MOCK_GUEST=0x...
```

## Running

```bash
# Dev (hot reload)
bun dev

# Production
bun start
```

## TODO

- [x] Oracle attestation endpoint (POST /session/:id/attest)
- [ ] Agora webhook integration for real join/leave tracking
- [ ] Persistent session store (KV/DB instead of in-memory)
- [ ] Cron job to auto-attest ended sessions
