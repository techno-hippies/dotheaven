# Heaven GPUI PoC

This app is a **proof of concept** for a Rust-native desktop client using GPUI.

## Status

- GPUI currently covers shell/navigation/auth persistence/local library UX.
- Encrypted upload flow in GPUI sidecar now targets Load storage paths (backend proxy or direct agent mode).
- Sidecar method names still keep `storage.*` compatibility for existing Rust callers.

## Setup

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for scrobbling and Lit Actions
export HEAVEN_LIT_RPC_URL="https://yellowstone-rpc.litprotocol.com"
export HEAVEN_LIT_NETWORK="naga-dev"  # or naga-test

# Required for gasless scrobbling via AA gateway
export HEAVEN_AA_GATEWAY_URL="http://127.0.0.1:3337"
export HEAVEN_AA_RPC_URL="https://carrot.megaeth.com/rpc"
export HEAVEN_AA_GATEWAY_KEY=""  # optional

# Storage upload mode (auto | backend | agent)
# auto: backend first, then fallback to direct agent if key is set
export HEAVEN_LOAD_UPLOAD_MODE="auto"

# Backend mode (recommended): heaven-api route /api/load/*
export HEAVEN_API_URL="http://localhost:8787"

# Direct agent mode fallback (optional):
# export HEAVEN_LOAD_S3_AGENT_API_KEY="load_acc_..."
# export HEAVEN_LOAD_S3_AGENT_URL="https://load-s3-agent.load.network"
# export HEAVEN_LOAD_GATEWAY_URL="https://gateway.s3-node-1.load.network"
```

**Important**: Without these environment variables set, scrobbling will fail with "Missing Lit RPC URL" error. The scrobble hook will fire correctly, but submission will fail due to missing configuration.

### Running

#### Option 1: Using the launcher script (recommended)

```bash
./run.sh
```

The launcher will:
- Load variables from `.env` if it exists
- Validate required environment variables
- Show helpful error messages if anything is missing
- Start the app with correct configuration

#### Option 2: Manual

```bash
# Make sure environment variables are set first
source .env  # or export them manually

# Run the app
cargo run --release
```

## Storage Sidecar Bridge

GPUI uses a Bun sidecar for encrypted upload + registration orchestration:

- `apps/gpui-poc/sidecar/synapse-sidecar.ts`

Run it directly for health checks:

- `printf '{"id":1,"method":"health","params":{}}\n' | bun apps/gpui-poc/sidecar/synapse-sidecar.ts`

Modes:

- `backend`: uploads via `HEAVEN_API_URL/api/load/upload` (server holds key).
- `agent`: uploads directly to `load-s3-agent` (requires `HEAVEN_LOAD_S3_AGENT_API_KEY`).
- `auto` (default): `backend` first, fallback to `agent` when key is configured.

Protocol: NDJSON over stdin/stdout (one JSON-RPC-like message per line).

Supported sidecar methods:

- `health`
- `storage.status`
- `storage.depositAndApprove` (compat no-op in Load mode)
- `storage.preflight`
- `storage.upload`
- `content.encryptUploadRegister`
- `storage.reset`

Expected auth payload shape (per request needing auth):

- `pkp`: `{ publicKey, ethAddress, tokenId? }`
- `authData`: `{ authMethodType, authMethodId, accessToken, ... }`

This is intentionally limited to current product needs and does not attempt full SDK parity.

### Long term (target)

Replace Synapse TS dependency with native Rust storage/payment pipeline for the subset we actually use, then expand if required.

## Voice Transport Note

Agora WebRTC is the current practical route for shipping quickly.

JackTrip remains the long-term peer audio direction, but requires substantial additional engineering (session control, NAT/network strategy, reliability/ops, and UX fallback logic).

Treat Agora as delivery path, JackTrip as strategic upgrade.

## Native Agora (GPUI)

The GPUI app now includes a native Agora voice integration path for Scarlett AI calls (no WebView sidecar), behind a compile-time feature:

```bash
export AGORA_SDK_ROOT=/path/to/agora/native/sdk
# optional (defaults by OS):
# export AGORA_SDK_LIB_NAME=agora_rtc_sdk
export HEAVEN_AGORA_APP_ID=...
export HEAVEN_VOICE_WORKER_URL=https://neodate-voice.deletion-backup782.workers.dev
export HEAVEN_CHAT_WORKER_URL=https://neodate-voice.deletion-backup782.workers.dev
export HEAVEN_AGORA_CN_ONLY=true   # optional mainland-China-only routing

cargo run --features agora-native
```

Notes:
- `AGORA_SDK_ROOT` must contain `include/` and `lib/`.
- Without `agora-native`, Scarlett text chat works, but voice call start returns a clear "agora-native not enabled" error.
