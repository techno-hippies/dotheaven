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
| `payment-facilitator` | `x402-facilitator-rs/` | Rust service | none |

## Indexing Topology
- `subgraphs/` (repo root): subgraph source code (schema, mappings, manifest) for protocol data.
- `services/graph-node-tempo/`: local/self-hosted Graph Node runtime used to serve those subgraphs.
- In short: `subgraphs/` defines indexers and `graph-node-tempo/` runs subgraphs.

## Retired Worker Script Names
Deleted from Cloudflare on 2026-02-20 (dev account cleanup). Keep for historical traceability.

- `heaven-api` -> `api-core`
- `heaven-resolver` -> `metadata-resolver`
- `heaven-voice` -> `voice-agent`
- `session-voice` -> `voice-control-plane`

## Cloudflare Resource Labels
D1 resources use capability-based labels (migrated on 2026-02-20).
Legacy D1 databases (`heaven-api`, `neodate-voice`, `session-voice`) were deleted after cutover.

| Capability | Generic Env Override | Current D1 Label |
| --- | --- | --- |
| `api-core` | `API_CORE_D1_DATABASE` | `api-core` |
| `voice-agent` | `VOICE_AGENT_D1_DATABASE` | `voice-agent` |
| `voice-control-plane` | `VOICE_CONTROL_PLANE_D1_DATABASE` | `voice-control-plane` |

Compatibility fallback:
- `D1_DATABASE` is still accepted by service scripts.

## Naming Convention
- Prefer capability-based identifiers over brand identifiers in new config.
- Use patterns like `<capability>`, `<domain>-<capability>`, or `<capability>-service`.
- Keep Cloudflare resource IDs stable unless there is an explicit migration plan.

## Working Notes
- Each service owns its own runtime/build/deploy details.
- Start with local README/CLAUDE files in each service directory.
- Services-wide test entry points are documented in `services/TESTING.md`.
- Voice control-plane tiered flow details are documented in `services/voice-control-plane/TESTING.md`.

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
