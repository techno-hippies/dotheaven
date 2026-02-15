# Heaven x402 Facilitator

This service is a self-hosted x402 facilitator that settles **Exact EIP-3009 USDC** payments on **Base Sepolia**.

It is intended to be used by `services/session-voice` when we need **dynamic `payTo`** (Splits receivers per room/segment) without relying on OpenX402 whitelisting.

## Endpoints

- `GET /health`
- `GET /supported`
- `POST /settle` (Bearer auth required)

## Env Vars

Required:

- `FACILITATOR_AUTH_TOKEN`
- `FACILITATOR_PRIVATE_KEY` (EVM key used to pay gas and broadcast settlement txs)

Recommended:

- `FACILITATOR_RPC_URL` (Base Sepolia RPC)

Optional:

- `FACILITATOR_HOST` (default `0.0.0.0`)
- `FACILITATOR_PORT` (default `3340`)

EigenCompute TLS proxy (platform-dependent):

- `DOMAIN`, `APP_PORT`
- `services/x402-facilitator/Caddyfile` is included for EigenCompute's TLS proxy flow (similar to `services/aa-gateway`).

## Local Run

```bash
cd services/x402-facilitator
bun install
FACILITATOR_AUTH_TOKEN=local \
FACILITATOR_PRIVATE_KEY=0x... \
FACILITATOR_RPC_URL=https://sepolia.base.org \
bun run src/index.ts
```

## Wiring Into Session Voice

Configure `services/session-voice` to use this facilitator:

- `X402_FACILITATOR_MODE=self`
- `X402_FACILITATOR_BASE_URL=https://<your-facilitator-host>`
- `X402_FACILITATOR_AUTH_TOKEN=<same as FACILITATOR_AUTH_TOKEN>`

This preserves the current session-voice contract:

- DO constructs `PAYMENT-REQUIRED` with `payTo` and `amount`
- Browser signs EIP-712 (EIP-3009) authorization
- DO calls facilitator `/settle` to relay the on-chain transfer

