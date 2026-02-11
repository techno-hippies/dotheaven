# Load Network Replacement PoC (Isolated)

This folder is a standalone benchmark harness to evaluate Load Network upload performance and operability versus the current Synapse/Filecoin flow.

It is intentionally isolated from production code paths in `apps/frontend` and `apps/gpui-poc`.

## What This Tests

- `ls3-agent` mode:
  - Uploads binary fixtures to Load S3 Agent (`POST /upload`) using a `load_acc` API key.
  - Optionally verifies streamability via gateway range request (`GET /resolve/{id}`).
- `turbo-offchain` mode:
  - Uploads signed DataItems through Turbo SDK against `https://loaded-turbo-api.load.network`.
  - Optionally verifies retrieval from the Load gateway.
- `both` mode:
  - Runs both providers with the same file-size matrix and outputs a single report.

## What This Does Not Test

- Filecoin/Synapse onchain settlement speed or nonce behavior.
- LS3 billing invoices.
- Long-term permanence guarantees.

Use this PoC to answer: "Is the upload UX materially faster and simpler enough for us to migrate?"

## Setup

```bash
cd experiments/load-network-poc
cp .env.example .env
bun install
```

Fill `.env`:

- Required for LS3 mode:
  - `LOAD_S3_AGENT_API_KEY` (from Load Cloud `load_acc` credentials)
- Optional for Turbo mode:
  - `TURBO_WALLET_JWK_PATH` (if omitted, an ephemeral wallet is generated)

## Run

```bash
# default MODE=both
bun run run
```

Recommended first pass:

- `FILE_SIZES_MB=1,5,15,50`
- `ITERATIONS=5`
- `CONCURRENCY=2`

The script writes JSON reports to `reports/load-poc-<timestamp>.json`.

## Report Output

Terminal summary includes per provider + file size:

- run count
- success/fail count
- average upload duration
- p50 / p95 upload duration
- average throughput (MiB/s)

Raw per-upload rows are preserved in the JSON report for deeper analysis.

## Migration-Relevant Notes

- `loaded-turbo-api` is a Turbo-compatible upload service endpoint, not a client SDK by itself.
- For LS3 "hot" uploads, auth is `load_acc` API key based.
- For permanent Arweave uploads via Turbo flows, users can fund Turbo Credits through external assets/rails (including ETH/SOL/fiat), which can simplify user-facing payment UX relative to FIL/USDFC-specific flows.

## Suggested Decision Gates

Adopt as replacement candidate only if:

1. P95 upload latency improves materially versus your current pipeline.
2. Failure/retry rate remains acceptable under parallel uploads.
3. Payment onboarding is simpler for your target users.
4. Gateway playback (range reads) is reliable for music seek/stream patterns.
