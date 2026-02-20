# Services

Backend and infrastructure units.

## Environment Model
- Current stage is dev-only.
- Keep service config single-environment unless there is an explicit production rollout.

## Service Catalog

Capability IDs are the canonical names. Folder names are legacy and can change later.

| Capability ID | Current Folder | Runtime | Cloudflare |
| --- | --- | --- | --- |
| `api-core` | `heaven-api/` | TypeScript Worker | Worker + D1 + R2 + Images |
| `metadata-resolver` | `heaven-resolver/` | TypeScript Worker | Worker + KV |
| `voice-agent` | `heaven-voice/` | TypeScript Worker | Worker + D1 |
| `voice-control-plane` | `session-voice/` | TypeScript Worker | Worker + D1 + Durable Objects + Cron |
| `graph-stack-local` | `graph-node-tempo/` | Docker stack | none |
| `chain-indexer` | `tempo-indexer/` | Ponder service | none |
| `payment-facilitator` | `x402-facilitator-rs/` | Rust service | none |

## Naming Convention
- Prefer capability-based identifiers over brand identifiers in new config.
- Use patterns like `<capability>`, `<domain>-<capability>`, or `<capability>-service`.
- Keep current folder names until a coordinated rename pass.

## Working Notes
- Each service owns its own runtime/build/deploy details.
- Start with local README/CLAUDE files in each service directory.
