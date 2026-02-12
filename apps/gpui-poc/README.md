# Heaven GPUI PoC

This app is a **proof of concept** for a Rust-native desktop client using GPUI.

## Status

- GPUI currently covers shell/navigation/auth persistence/local library UX.
- Encrypted upload flow now uses native Rust direct upload to Load's Turbo-compatible offchain endpoint.

## Setup

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for scrobbling and Lit Actions
export HEAVEN_LIT_RPC_URL="https://yellowstone-rpc.litprotocol.com"
export HEAVEN_LIT_NETWORK="naga-dev"  # or naga-test
export HEAVEN_XMTP_ENV="dev"          # dev | production (defaults to dev)
# Optional: force XMTP inbox nonce when troubleshooting legacy inbox mismatches
# export HEAVEN_XMTP_NONCE="0"         # auto if unset

# Required for gasless scrobbling via AA gateway
export HEAVEN_AA_GATEWAY_URL="http://127.0.0.1:3337"
export HEAVEN_AA_RPC_URL="https://carrot.megaeth.com/rpc"
export HEAVEN_AA_GATEWAY_KEY=""  # optional

# Storage upload (direct offchain)
export HEAVEN_LOAD_TURBO_UPLOAD_URL="https://loaded-turbo-api.load.network"
export HEAVEN_LOAD_TURBO_TOKEN="ethereum"
export HEAVEN_LOAD_GATEWAY_URL="https://gateway.s3-node-1.load.network"

# Optional: enable user-pays Turbo funding from PKP wallet (Base Sepolia)
export HEAVEN_LOAD_USER_PAYS_ENABLED="true"
export HEAVEN_TURBO_FUNDING_PROXY_URL="http://127.0.0.1:8788"
export HEAVEN_TURBO_FUNDING_TOKEN="base-eth"
export HEAVEN_BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export HEAVEN_LOAD_MIN_UPLOAD_CREDIT="0.00000001"
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

## Native Load Storage

GPUI uses native Rust code for encrypted upload + registration orchestration.

- Upload target: `POST {HEAVEN_LOAD_TURBO_UPLOAD_URL}/v1/tx/{HEAVEN_LOAD_TURBO_TOKEN}`.
- Data format: signed ANS-104 DataItem (signed by user PKP through Lit).
- Retrieval: `GET {HEAVEN_LOAD_GATEWAY_URL}/resolve/{dataitem_id}`.
- Optional user-pays mode: set `HEAVEN_LOAD_USER_PAYS_ENABLED=true` to require Turbo balance checks before upload and use "Add Funds" to send a PKP-signed Base Sepolia payment + `submitFundTransaction` via funding proxy.

## Voice Transport Note

Agora WebRTC is the current practical route for shipping quickly.

JackTrip remains the long-term peer audio direction, but requires substantial additional engineering (session control, NAT/network strategy, reliability/ops, and UX fallback logic).

Treat Agora as delivery path, JackTrip as strategic upgrade.

## Native Agora (GPUI)

The GPUI app now includes a native Agora voice integration path for Scarlett AI calls (no WebView bridge), behind a compile-time feature:

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
