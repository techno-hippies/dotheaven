#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load baked-in .env as defaults (EigenCompute KMS/env can override at runtime)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

: "${FACILITATOR_AUTH_TOKEN:?FACILITATOR_AUTH_TOKEN is required}"

# "Do it right" posture: x402-facilitator expects these env vars.
# We accept a legacy-friendly FACILITATOR_PRIVATE_KEY/FACILITATOR_RPC_URL too.
export SIGNER_TYPE="${SIGNER_TYPE:-private-key}"
export EVM_PRIVATE_KEY="${EVM_PRIVATE_KEY:-${FACILITATOR_PRIVATE_KEY:-}}"
: "${EVM_PRIVATE_KEY:?EVM_PRIVATE_KEY (or FACILITATOR_PRIVATE_KEY) is required}"

# Default to a public Base Sepolia RPC that resolves reliably in dev environments.
# (Some environments can't resolve `sepolia.base.org`.)
export RPC_URL_BASE_SEPOLIA="${RPC_URL_BASE_SEPOLIA:-${FACILITATOR_RPC_URL:-https://base-sepolia-rpc.publicnode.com}}"

export FACILITATOR_HOST="${FACILITATOR_HOST:-0.0.0.0}"
export FACILITATOR_PORT="${FACILITATOR_PORT:-${APP_PORT:-3340}}"

echo "=== Heaven x402 Facilitator (Rust) ==="
echo "  Host:   ${FACILITATOR_HOST}"
echo "  Port:   ${FACILITATOR_PORT}"
echo "  RPC:    ${RPC_URL_BASE_SEPOLIA}"
echo ""

BIN="$SCRIPT_DIR/heaven-x402-facilitator"
LOCAL_BIN="$SCRIPT_DIR/target/release/heaven-x402-facilitator"

if [ -x "$BIN" ]; then
  exec "$BIN"
fi

if [ -x "$LOCAL_BIN" ]; then
  exec "$LOCAL_BIN"
fi

if command -v cargo >/dev/null 2>&1; then
  echo "[start.sh] No prebuilt binary found; building with cargo (release)..."
  (cd "$SCRIPT_DIR" && cargo build --release --locked)
  exec "$LOCAL_BIN"
fi

echo "[start.sh] ERROR: no facilitator binary found and cargo is not available." >&2
echo "[start.sh] Looked for: $BIN" >&2
echo "[start.sh] Looked for: $LOCAL_BIN" >&2
exit 127
