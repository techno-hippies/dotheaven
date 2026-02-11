# Rust Upload CLI (LS3 Benchmark)

Benchmark LS3 agent upload performance from a pure Rust client and verify post-upload access via gateway resolve.

## Run

```bash
cd apps/load-poc/rust-upload-cli
cargo run --release -- \
  --api-key "$LOAD_S3_AGENT_API_KEY" \
  --sizes-mb "1,5,15,50" \
  --iterations 5 \
  --concurrency 2 \
  --verify-resolve true
```

Environment shortcuts:

- `LOAD_S3_AGENT_URL` (default `https://load-s3-agent.load.network`)
- `LOAD_S3_AGENT_UPLOAD_PATH` (default `/upload`)
- `LOAD_GATEWAY_URL` (default `https://gateway.s3-node-1.load.network`)
- `LOAD_S3_AGENT_API_KEY` (required)

## Output

- Terminal summary: avg/p50/p95 upload latency and throughput by file size.
- JSON report: `reports/load-rust-poc-<timestamp>.json`

Each successful row includes a `gateway_url`:

`https://gateway.s3-node-1.load.network/resolve/{upload_id}`

Use this for playback/range-read checks in desktop app integration.
