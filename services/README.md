# Services

Backend and infrastructure services.

## Key Services
- `heaven-api/` — API worker endpoints.
- `heaven-resolver/` — resolver and metadata-related helpers.
- `graph-node-tempo/` — self-hosted Graph Node stack for Tempo Moderato.
- `session-voice/` — real-time voice room control plane.
- `tempo-indexer/` — interim Tempo Moderato scrobble indexer (Ponder, optional fallback).
- `x402-facilitator-rs/` — Rust x402 facilitator service.

## Notes
- Each service owns its own runtime/build/deploy details.
- Start with local README/CLAUDE files in each service directory.
