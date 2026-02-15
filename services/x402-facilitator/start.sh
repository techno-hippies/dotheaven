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
: "${FACILITATOR_PRIVATE_KEY:?FACILITATOR_PRIVATE_KEY is required}"

export FACILITATOR_RPC_URL="${FACILITATOR_RPC_URL:-https://sepolia.base.org}"
export FACILITATOR_HOST="${FACILITATOR_HOST:-0.0.0.0}"
export FACILITATOR_PORT="${FACILITATOR_PORT:-${APP_PORT:-3340}}"

echo "=== Heaven x402 Facilitator ==="
echo "  Host:   ${FACILITATOR_HOST}"
echo "  Port:   ${FACILITATOR_PORT}"
echo "  RPC:    ${FACILITATOR_RPC_URL}"
echo ""

exec bun run "$SCRIPT_DIR/src/index.ts"

