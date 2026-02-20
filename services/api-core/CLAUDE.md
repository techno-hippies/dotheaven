# API Core Worker

Operational notes for `services/api-core`.

## Purpose
Cloudflare Worker for:
- names API
- claim flow endpoints
- scrobble ingestion
- music publish + Load/Arweave endpoints

## Environment
- Current setup is dev-only.
- Preferred override: set `API_CORE_D1_DATABASE`.
- Legacy fallback: `D1_DATABASE` is still supported.

## Local Development
From `services/api-core`:

```bash
bun install
bun run db:init
bun run db:migrate
bun run dev
```

Typecheck and targeted scripts:

```bash
bun run check
bun run test:photos
bun run test:pipeline
```

## Deploy
From `services/api-core`:

```bash
bun run deploy
```

If schema changes were made, run remote migrations first:

```bash
wrangler d1 execute ${API_CORE_D1_DATABASE:-${D1_DATABASE:-api-core}} --remote --file=./schema.sql
bun run db:migrate:remote
```

## Required Secrets
Set with `wrangler secret put ...`:
- `DNS_SHARED_SECRET` (for DNS-protected routes)
- `LOAD_S3_AGENT_API_KEY`
- `FAL_KEY`
- `WATERMARK_SECRET`
- `BASE_SEPOLIA_RELAY_PK` (legacy — was for EAS relay writes on Base Sepolia)

## Main Route Surfaces
- `/api/names/*`
- `/api/claim/*`
- `/api/scrobble/*`
- `/api/music/*`
- `/api/load/*`
- `/api/arweave/*`
- `/api/study-sets/*`

## Files You Will Touch Most
- `services/api-core/src/index.ts`
- `services/api-core/src/routes/`
- `services/api-core/schema.sql`
- `services/api-core/migrations/`
- `services/api-core/wrangler.toml`

## Safety Rules
- Treat schema migrations as immutable once deployed.
- Keep auth behavior explicit per-route; do not rely on global assumptions.
- Keep expensive third-party calls off critical path unless required.
