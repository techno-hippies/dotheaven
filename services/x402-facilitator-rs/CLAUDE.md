# x402 Facilitator (Rust)

Operational notes for `services/x402-facilitator-rs`.

## Purpose
- Self-hosted x402 settlement service used by `services/session-voice`.
- Supports dynamic `payTo` for duet-room segmentation flows.

## Endpoints
- `GET /`
- `GET /health`
- `GET /supported`
- `POST /settle` (Bearer auth required)

## Required Environment
- `FACILITATOR_AUTH_TOKEN`
- `SIGNER_TYPE=private-key`
- `EVM_PRIVATE_KEY`

Recommended:
- `RPC_URL_BASE_SEPOLIA`

Compatibility aliases accepted by startup tooling:
- `FACILITATOR_PRIVATE_KEY` -> `EVM_PRIVATE_KEY`
- `FACILITATOR_RPC_URL` -> `RPC_URL_BASE_SEPOLIA`

## Local Run
From `services/x402-facilitator-rs`:

```bash
export FACILITATOR_AUTH_TOKEN=local
export SIGNER_TYPE=private-key
export EVM_PRIVATE_KEY=0x...
export RPC_URL_BASE_SEPOLIA=https://base-sepolia-rpc.publicnode.com/
cargo run --release
```

## Container + Deploy Notes
- Docker build: `services/x402-facilitator-rs/Dockerfile`
- TLS proxy config: `services/x402-facilitator-rs/Caddyfile`
- Startup wrapper: `services/x402-facilitator-rs/start.sh`

After deploys, confirm:
- `/health` is reachable.
- `session-voice` uses matching `X402_FACILITATOR_AUTH_TOKEN`.

## Files You Will Touch Most
- `services/x402-facilitator-rs/src/main.rs`
- `services/x402-facilitator-rs/src/env.rs`
- `services/x402-facilitator-rs/src/cdp_settle.rs`
- `services/x402-facilitator-rs/start.sh`
