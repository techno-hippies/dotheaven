# Services Testing Matrix

Canonical test entry points for `services/*`.

## Cross-Service Smoke (deployed dev workers)

From repo root:

```bash
bun run services:smoke
```

Script:
- `services/smoke-dev.ts`

## api-core

From `services/api-core`:

```bash
bun run test:unit
bun run test:smoke
```

Layout:
- Unit/integration-style tests: `services/api-core/tests/*.test.ts`
- Smoke flows: `services/api-core/tests/smoke/*.smoke.ts`

## metadata-resolver

From `services/metadata-resolver`:

```bash
bun run test:unit
bun run test:smoke
```

Layout:
- Smoke: `services/metadata-resolver/tests/smoke/health.smoke.ts`

## voice-agent

From `services/voice-agent`:

```bash
bun run test:unit
bun run test:smoke
```

Layout:
- Smoke: `services/voice-agent/tests/smoke/auth-nonce.smoke.ts`

## voice-control-plane

From `services/voice-control-plane`:

```bash
bun run test:unit
bun run test:integration:rooms
bun run test:e2e:local
```

Layout:
- Unit: `services/voice-control-plane/tests/unit/*.test.ts`
- Smoke/integration: `services/voice-control-plane/tests/smoke/*.ts`
- E2E harness: `services/voice-control-plane/tests/e2e/e2e-local.ts`

## x402-facilitator-rs

From `services/x402-facilitator-rs`:

```bash
cargo test
```

Note:
- The local crate currently defines no direct tests; upstream vendored crate contains its own test modules.
