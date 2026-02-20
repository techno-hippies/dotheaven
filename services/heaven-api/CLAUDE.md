# API Core Worker

Operational notes for `services/heaven-api`.

## Purpose
Cloudflare Worker for:
- names API
- claim flow endpoints
- scrobble ingestion
- photo/meal pipelines

## Environment
- Current setup is dev-only.
- Optional override: set `D1_DATABASE` to avoid hardcoded DB names in scripts.

## Local Development
From `services/heaven-api`:

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
From `services/heaven-api`:

```bash
bun run deploy
```

If schema changes were made, run remote migrations first:

```bash
wrangler d1 execute ${D1_DATABASE:-heaven-api} --remote --file=./schema.sql
bun run db:migrate:remote
```

## Required Secrets
Set with `wrangler secret put ...`:
- `DNS_SHARED_SECRET` (for DNS-protected routes)
- `FILEBASE_ACCESS_KEY`, `FILEBASE_SECRET_KEY`, `FILEBASE_BUCKET`
- `FAL_KEY`
- `WATERMARK_SECRET`
- `BASE_SEPOLIA_RELAY_PK` (legacy — was for EAS relay writes on Base Sepolia)
- meal pipeline secrets if meal APIs are enabled

## Main Route Surfaces
- `/api/names/*`
- `/api/claim/*`
- `/api/scrobble/*`
- `/api/photos/*`
- `/api/meal/*`

## Files You Will Touch Most
- `services/heaven-api/src/index.ts`
- `services/heaven-api/src/routes/`
- `services/heaven-api/schema.sql`
- `services/heaven-api/migrations/`
- `services/heaven-api/wrangler.toml`

## Safety Rules
- Treat schema migrations as immutable once deployed.
- Keep auth behavior explicit per-route; do not rely on global assumptions.
- Keep expensive third-party calls off critical path unless required.
