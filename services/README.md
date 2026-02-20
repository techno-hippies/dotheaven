# Services

Backend and infrastructure units.

## Environment Model
- Current stage is dev-only.
- Keep service config single-environment unless there is an explicit production rollout.

## Service Catalog

Capability IDs are the canonical names.

| Capability ID | Current Folder | Runtime | Cloudflare |
| --- | --- | --- | --- |
| `api-core` | `api-core/` | TypeScript Worker | Worker + D1 + R2 + Images |
| `metadata-resolver` | `metadata-resolver/` | TypeScript Worker | Worker + KV |
| `voice-agent` | `voice-agent/` | TypeScript Worker | Worker + D1 |
| `voice-control-plane` | `voice-control-plane/` | TypeScript Worker | Worker + D1 + Durable Objects + Cron |
| `graph-stack-local` | `graph-node-tempo/` | Docker stack | none |
| `chain-indexer` | `tempo-indexer/` | Ponder service | none |
| `payment-facilitator` | `x402-facilitator-rs/` | Rust service | none |

## Legacy Map
- `heaven-api` -> `api-core`
- `heaven-resolver` -> `metadata-resolver`
- `heaven-voice` -> `voice-agent`
- `session-voice` -> `voice-control-plane`

## Cloudflare Resource Labels
D1 resources remain on legacy labels for stability; use generic env knobs in scripts.

| Capability | Generic Env Override | Current D1 Label |
| --- | --- | --- |
| `api-core` | `API_CORE_D1_DATABASE` | `heaven-api` |
| `voice-agent` | `VOICE_AGENT_D1_DATABASE` | `neodate-voice` |
| `voice-control-plane` | `VOICE_CONTROL_PLANE_D1_DATABASE` | `session-voice` |

Compatibility fallback:
- `D1_DATABASE` is still accepted by service scripts.

## Naming Convention
- Prefer capability-based identifiers over brand identifiers in new config.
- Use patterns like `<capability>`, `<domain>-<capability>`, or `<capability>-service`.
- Keep Cloudflare resource IDs stable unless there is an explicit migration plan.

## Working Notes
- Each service owns its own runtime/build/deploy details.
- Start with local README/CLAUDE files in each service directory.

## Smoke Check
Run one dev smoke pass for Cloudflare Workers:

```bash
bun run services/smoke-dev.ts
```

Optional endpoint overrides:
- `API_CORE_URL`
- `METADATA_RESOLVER_URL`
- `VOICE_AGENT_URL`
- `VOICE_CONTROL_PLANE_URL`
