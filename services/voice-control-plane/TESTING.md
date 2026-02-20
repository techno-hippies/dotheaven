# Voice Control Plane Testing

Testing is split by intent so run order is predictable.

## File Layout

- Unit: `tests/unit/*.test.ts`
- Smoke/integration flows: `tests/smoke/*.ts`
- Local e2e harness: `tests/e2e/e2e-local.ts`

## Tier 1: Unit

Pure logic tests (no running worker required):

```bash
cd services/voice-control-plane
bun run test:unit
```

## Tier 2: Local Integration (Worker APIs)

Run against a local `wrangler dev` instance:

```bash
cd services/voice-control-plane
bun run dev
```

In another shell:

```bash
cd services/voice-control-plane
bun run test:integration:rooms
```

## Tier 3: Duet Flows

Duet-specific integration flows:

```bash
cd services/voice-control-plane
bun run test:duet
bun run test:duet:broadcast
bun run test:duet:broadcast:video
bun run test:duet:self
bun run test:duet:self:remote
```

## Tier 4: End-to-End Local Harness

Single-command local orchestration:

```bash
cd services/voice-control-plane
bun run test:e2e:local
bun run test:e2e:local:full
```

## Dev Worker Smoke (All Services)

From repo root:

```bash
bun run services:smoke
```
