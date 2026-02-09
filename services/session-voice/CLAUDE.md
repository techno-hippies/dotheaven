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
