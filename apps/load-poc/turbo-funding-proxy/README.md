# Turbo Funding Proxy (PoC)

Minimal backend helper for experimenting with Turbo credit payment calls while keeping credentials server-side.

This is intentionally version-tolerant: it inspects available Turbo SDK client methods at runtime and attempts known method names for:

- payment config
- top-up
- balance

## Setup

```bash
cd apps/load-poc/turbo-funding-proxy
cp .env.example .env
bun install
```

Put an Arweave JWK at `TURBO_WALLET_JWK_PATH` (from `.env`).

## Run

```bash
bun run dev
```

## Endpoints

- `GET /health`
- `GET /turbo/methods` (inspect SDK methods present in current installed version)
- `GET /turbo/wallets` (current Turbo deposit wallets per token rail)
- `POST /turbo/config`
- `POST /turbo/topup`
- `POST /turbo/submit-fund` (submit an already-broadcast tx hash for crediting)
- `POST /turbo/balance`

Example:

```bash
curl -s http://localhost:8788/turbo/methods | jq
curl -s http://localhost:8788/turbo/wallets | jq
curl -s -X POST http://localhost:8788/turbo/config | jq
curl -s -X POST http://localhost:8788/turbo/submit-fund \
  -H 'content-type: application/json' \
  -d '{"token":"base-eth","txId":"0x...","userAddress":"0x..."}' | jq
```

## Funding Flow for PKP Users

Use your PKP EVM address as the user wallet identity in your app, and use this backend to perform/coordinate Turbo top-up operations. The exact top-up parameter shape can vary by Turbo SDK version, so inspect `/turbo/methods` and then call `/turbo/topup` with the needed payload.

This keeps you aligned with:

- user-facing EVM wallet UX
- no master key exposure in clients
- backend policy control on which payment methods to allow
