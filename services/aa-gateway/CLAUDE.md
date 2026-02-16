# AA Gateway

Operational notes for `services/aa-gateway`.

## Purpose
- Accept ERC-4337 UserOperations for Heaven flows.
- Quote paymaster data (`/quotePaymaster`).
- Forward signed UserOperations to Alto (`/sendUserOp`).

## Scope
- This service is policy enforcement + paymaster signing.
- Alto (`services/alto`) is the bundler execution layer.

## Key Endpoints
- `GET /health`
- `POST /quotePaymaster`
- `POST /sendUserOp`

## Local Development
From `services/aa-gateway`:

```bash
bun install
bun test
bun run dev
```

Or use the helper launcher from repo root:

```bash
bash services/aa-gateway/start.sh
```

## Runtime Inputs
- Read env config from `services/aa-gateway/src/config.ts`.
- Keep target allowlist and gas-policy limits aligned with deployed contracts.
- Do not widen allowlists without explicit review.

## Deployment Notes
- Docker image is built from `services/aa-gateway/Dockerfile`.
- TLS/reverse proxy behavior is defined in `services/aa-gateway/Caddyfile`.
- After infra redeploys, verify `DOMAIN` and endpoint reachability before enabling clients.

## Files You Will Touch Most
- `services/aa-gateway/src/index.ts`
- `services/aa-gateway/src/config.ts`
- `services/aa-gateway/src/validation.ts`
- `services/aa-gateway/src/paymaster.ts`
- `services/aa-gateway/start.sh`
