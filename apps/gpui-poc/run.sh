#!/bin/bash
# Heaven GPUI launcher with environment validation

set -e

# Check if .env exists
if [ -f .env ]; then
    echo "Loading environment from .env..."
    source .env
else
    echo "Warning: .env file not found. Copy .env.example to .env and configure."
    echo ""
fi

# Validate required environment variables
MISSING=""

if [ -z "$HEAVEN_LIT_RPC_URL" ] && [ -z "$LIT_RPC_URL" ]; then
    MISSING="${MISSING}\n  - HEAVEN_LIT_RPC_URL (or LIT_RPC_URL)"
fi

if [ -z "$HEAVEN_LIT_NETWORK" ] && [ -z "$LIT_NETWORK" ]; then
    echo "Warning: HEAVEN_LIT_NETWORK not set, defaulting to 'naga-dev'"
fi

if [ -n "$MISSING" ]; then
    echo "ERROR: Missing required environment variables:"
    echo -e "$MISSING"
    echo ""
    echo "Please set them in .env or export them manually:"
    echo "  export HEAVEN_LIT_RPC_URL=\"https://yellowstone-rpc.litprotocol.com\""
    echo "  export HEAVEN_LIT_NETWORK=\"naga-dev\""
    echo ""
    exit 1
fi

# Optional but recommended
if [ -z "$HEAVEN_AA_GATEWAY_URL" ] && [ -z "$AA_GATEWAY_URL" ]; then
    echo "Warning: HEAVEN_AA_GATEWAY_URL not set, scrobbling will use default: http://127.0.0.1:3337"
fi

if [ -z "$HEAVEN_AA_RPC_URL" ] && [ -z "$AA_RPC_URL" ]; then
    echo "Warning: HEAVEN_AA_RPC_URL not set, scrobbling will use default: https://carrot.megaeth.com/rpc"
fi

LOAD_UPLOAD_URL="${HEAVEN_LOAD_TURBO_UPLOAD_URL:-https://loaded-turbo-api.load.network}"
LOAD_UPLOAD_TOKEN="${HEAVEN_LOAD_TURBO_TOKEN:-ethereum}"
HEAVEN_XMTP_ENV="${HEAVEN_XMTP_ENV:-${XMTP_ENV:-dev}}"
export HEAVEN_XMTP_ENV
export XMTP_ENV="${XMTP_ENV:-$HEAVEN_XMTP_ENV}"
if [ -n "${HEAVEN_XMTP_NONCE:-}" ]; then
    export XMTP_NONCE="${XMTP_NONCE:-$HEAVEN_XMTP_NONCE}"
fi

if [ -z "$HEAVEN_SPONSOR_PRIVATE_KEY" ] && [ -z "$PRIVATE_KEY" ] && [ ! -f "../../lit-actions/.env" ]; then
    echo "Warning: no sponsor private key found. content.encryptUploadRegister will fail at register step."
fi

if command -v curl >/dev/null 2>&1; then
    if ! curl -fsS "${LOAD_UPLOAD_URL}/health" >/dev/null 2>&1; then
        echo "Warning: ${LOAD_UPLOAD_URL}/health unavailable. Encrypt+upload will fail."
    fi
fi

echo "  LOAD_MODE: offchain"
echo "  LOAD_UPLOAD_URL: ${LOAD_UPLOAD_URL}"
echo "  LOAD_UPLOAD_TOKEN: ${LOAD_UPLOAD_TOKEN}"

echo "Environment validated. Starting Heaven GPUI..."
echo "  LIT_NETWORK: ${HEAVEN_LIT_NETWORK:-${LIT_NETWORK:-naga-dev}}"
echo "  LIT_RPC_URL: ${HEAVEN_LIT_RPC_URL:-$LIT_RPC_URL}"
echo "  AA_GATEWAY: ${HEAVEN_AA_GATEWAY_URL:-${AA_GATEWAY_URL:-http://127.0.0.1:3337}}"
echo "  AA_RPC: ${HEAVEN_AA_RPC_URL:-${AA_RPC_URL:-https://carrot.megaeth.com/rpc}}"
echo "  XMTP_ENV: ${HEAVEN_XMTP_ENV}"
echo "  XMTP_NONCE: ${HEAVEN_XMTP_NONCE:-${XMTP_NONCE:-auto}}"
echo "  LOAD_MODE: offchain"
echo "  LOAD_UPLOAD_URL: ${LOAD_UPLOAD_URL}"
echo "  LOAD_UPLOAD_TOKEN: ${LOAD_UPLOAD_TOKEN}"
echo ""

# Run the app.
# If AGORA_SDK_ROOT is configured, enable native Agora automatically so
# duet native bridge works without passing extra cargo flags manually.
if [ -n "${AGORA_SDK_ROOT:-}" ]; then
    DUET_NATIVE_BRIDGE_OPT_IN="${HEAVEN_ENABLE_DUET_NATIVE_BRIDGE:-${HEAVEN_ENABLE_SCARLETT_DESKTOP_AGORA:-0}}"
    if [ "$(uname -s)" = "Linux" ] && [ "${DUET_NATIVE_BRIDGE_OPT_IN}" != "1" ]; then
        echo "AGORA_SDK_ROOT is set, but native Agora is disabled by default on Linux."
        echo "Set HEAVEN_ENABLE_DUET_NATIVE_BRIDGE=1 to opt in to the deprecated Linux native bridge."
        echo ""
        cargo run --release
        exit 0
    fi

    if [ ! -d "${AGORA_SDK_ROOT}/include" ] || [ ! -d "${AGORA_SDK_ROOT}/lib" ]; then
        echo "ERROR: AGORA_SDK_ROOT is set but missing include/ or lib/: ${AGORA_SDK_ROOT}"
        echo "Set AGORA_SDK_ROOT to the Agora native SDK root."
        exit 1
    fi

    export AGORA_SDK_ROOT
    export AGORA_SDK_LIB_NAME="${AGORA_SDK_LIB_NAME:-agora_rtc_sdk}"
    export LD_LIBRARY_PATH="${AGORA_SDK_ROOT}/lib:${LD_LIBRARY_PATH:-}"
    echo "Native Agora enabled via AGORA_SDK_ROOT."
    echo "  AGORA_SDK_ROOT: ${AGORA_SDK_ROOT}"
    echo "  AGORA_SDK_LIB_NAME: ${AGORA_SDK_LIB_NAME}"
    echo "  LD_LIBRARY_PATH prepended with: ${AGORA_SDK_ROOT}/lib"
    echo ""
    cargo run --release --features agora-native
else
    echo "AGORA_SDK_ROOT not set; running without native Agora."
    echo ""
    cargo run --release
fi
