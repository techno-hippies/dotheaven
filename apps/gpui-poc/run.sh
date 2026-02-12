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

# Run the app
cargo run --release
