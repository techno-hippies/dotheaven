# Heaven x402 Facilitator (Rust)

This service is the preferred self-hosted x402 facilitator for Heaven. It settles **Exact EIP-3009 USDC** payments on **Base Sepolia** and is intended to be used by `services/session-voice` when we need **dynamic `payTo`** (Splits receivers per room/segment) without relying on OpenX402 whitelisting.

It is built on the upstream Rust implementation (`x402-facilitator` / `x402-rs`) and adds:

- Simple Bearer auth on all `POST` endpoints (including `POST /settle`).
- EigenCompute-friendly env loading via `start.sh`.
- CDP-ish compatibility for `POST /settle` so `services/session-voice` can keep its current request format while we migrate toward first-class `x402-rs` wire types.

## Endpoints

- `GET /` (simple string)
- `GET /health` (alias of supported; returns JSON)
- `GET /supported`
- `POST /settle` (Bearer auth required)

## Env Vars

Required:

- `FACILITATOR_AUTH_TOKEN` (Bearer token; `session-voice` sends it as `X402_FACILITATOR_AUTH_TOKEN`)
- `EVM_PRIVATE_KEY` (Base Sepolia relayer key, pays gas)
- `SIGNER_TYPE=private-key` (required by upstream `x402-facilitator`)

Recommended:

- `RPC_URL_BASE_SEPOLIA` (Base Sepolia RPC; default `https://base-sepolia-rpc.publicnode.com/`)

Optional:

- `FACILITATOR_HOST` (default `0.0.0.0`)
- `FACILITATOR_PORT` (default `3340`, or `APP_PORT`)

Compatibility:

- `FACILITATOR_PRIVATE_KEY` is accepted as an alias for `EVM_PRIVATE_KEY`.
- `FACILITATOR_RPC_URL` is accepted as an alias for `RPC_URL_BASE_SEPOLIA`.

## Local Run

```bash
cd services/x402-facilitator-rs
export FACILITATOR_AUTH_TOKEN=local
export SIGNER_TYPE=private-key
export EVM_PRIVATE_KEY=0x...
export RPC_URL_BASE_SEPOLIA=https://base-sepolia-rpc.publicnode.com/
cargo run --release
```

## Docker Build (Docker Hub)

This matches the pattern used by `services/aa-gateway` (Docker Hub + `ecloud compute app upgrade`).

From repo root:

```bash
docker build -f services/x402-facilitator-rs/Dockerfile \
  --build-context facilitator=services/x402-facilitator-rs \
  -t heaven-x402-facilitator .
docker tag heaven-x402-facilitator t3333333k/heaven-x402-facilitator:latest
docker push t3333333k/heaven-x402-facilitator:latest
```

## Wiring Into Session Voice

Configure `services/session-voice`:

- `X402_FACILITATOR_MODE=self`
- `X402_FACILITATOR_BASE_URL=https://<your-facilitator-host>`
- `X402_FACILITATOR_AUTH_TOKEN=<same as FACILITATOR_AUTH_TOKEN>`

## Deploy to EigenCloud

This CLI flow is interactive (TTY required).

Current deployment (Base Sepolia):

- App name: `facil-x402rs`
- App id: `0x0a39771D1d7c024badB0922dfd4EC929709484bd`
- Public URL (Cloudflare proxied): `https://facil-x402rs-sepolia.dotheaven.org`

1. Build + push to Docker Hub (see above).
2. Upgrade the EigenCloud app to pull the new image (run from this directory so `Caddyfile` is present in the build context for EigenCloud TLS flow):

```bash
cd services/x402-facilitator-rs
ecloud compute app upgrade 0x0a39771D1d7c024badB0922dfd4EC929709484bd \
  --image-ref t3333333k/heaven-x402-facilitator:latest-layered \
  --env-file .ecloud.env
```

When prompted:

- Select the Docker image ref you just pushed.
- Ensure the env file includes `DOMAIN=<your-hostname>` and the TLS vars you want (see `ecloud compute app configure tls` output).

TLS notes:

- If you change `Caddyfile`, you must rebuild + push the Docker image, then upgrade the app for it to take effect.
- Start with `ACME_STAGING=true` to avoid Let's Encrypt rate limits while iterating.
- When ready for production certs: set `ACME_STAGING=false` and use `ACME_FORCE_ISSUE=true` once, then unset it.

## EigenCompute Notes

- The `Caddyfile` is included for EigenCompute TLS proxy flow (same pattern as `services/aa-gateway`).
- Prefer injecting `EVM_PRIVATE_KEY` via EigenCloud KMS/env rather than baking it into images.
- Startup needs to be fast so TLS/health checks don't kill the container. Keep initialization minimal.
