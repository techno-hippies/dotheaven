#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Detect environment: Docker (/app layout) vs local dev ─────────────────
if [ -d "/app/alto" ] && [ -d "/app/gateway" ]; then
  ALTO_DIR="/app/alto"
  GATEWAY_DIR="/app/gateway"
  # Load baked-in .env as defaults (KMS env vars take precedence)
  if [ -f "/app/gateway/.env" ]; then
    set -a
    source "/app/gateway/.env"
    set +a
  fi
else
  ALTO_DIR="$(cd "$SCRIPT_DIR/../alto" && pwd)"
  GATEWAY_DIR="$SCRIPT_DIR"
  # Load .env in local dev
  if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
  fi
fi

# ── Required env vars ───────────────────────────────────────────────────────
: "${RPC_URL:?RPC_URL is required}"
: "${ENTRYPOINT:?ENTRYPOINT is required}"
: "${BUNDLER_EXECUTOR_KEY:?BUNDLER_EXECUTOR_KEY is required}"
: "${BUNDLER_UTILITY_KEY:?BUNDLER_UTILITY_KEY is required}"
: "${PAYMASTER_SIGNER_KEY:?PAYMASTER_SIGNER_KEY is required}"
: "${HEAVEN_PAYMASTER:?HEAVEN_PAYMASTER is required}"
: "${HEAVEN_FACTORY:?HEAVEN_FACTORY is required}"
: "${CHAIN_ID:?CHAIN_ID is required}"

# ── Optional env vars ───────────────────────────────────────────────────────
ALTO_PORT="${ALTO_PORT:-4337}"
# Keep app port resolution aligned with EigenCloud TLS/Caddy conventions.
# Caddy forwards to APP_PORT; gateway listens on PORT.
# Resolve once and export both so either env style works.
GATEWAY_PORT="${PORT:-${APP_PORT:-3337}}"

echo "=== Heaven AA Gateway ==="
echo "  Chain:    ${CHAIN_ID}"
echo "  RPC:      ${RPC_URL}"
echo "  Alto:     127.0.0.1:${ALTO_PORT}"
echo "  Gateway:  0.0.0.0:${GATEWAY_PORT}"
echo ""

# ── Set gateway env vars ────────────────────────────────────────────────────
export BUNDLER_URL="http://127.0.0.1:${ALTO_PORT}"
export PORT="${GATEWAY_PORT}"
export APP_PORT="${GATEWAY_PORT}"

# ── Start Alto bundler in background (localhost only) ─────────────────────
node "$ALTO_DIR/src/esm/cli/alto.js" run \
  --rpc-url "${RPC_URL}" \
  --entrypoints "${ENTRYPOINT}" \
  --executor-private-keys "${BUNDLER_EXECUTOR_KEY}" \
  --utility-private-key "${BUNDLER_UTILITY_KEY}" \
  --safe-mode false \
  --port "${ALTO_PORT}" &

ALTO_PID=$!

# ── Start gateway immediately (responds to /health for Caddy) ─────────────
# Gateway starts serving right away; bundler requests will fail until Alto
# is ready, but /health returns 200 so Caddy keeps the proxy active.
cd "$GATEWAY_DIR"
bun run src/index.ts &

GATEWAY_PID=$!

# ── Trap to clean up both processes on shutdown ───────────────────────────
cleanup() {
  echo "Shutting down..."
  kill "$GATEWAY_PID" 2>/dev/null || true
  kill "$ALTO_PID" 2>/dev/null || true
  wait "$GATEWAY_PID" 2>/dev/null || true
  wait "$ALTO_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Wait for either process to exit (if one dies, clean up and exit) ──────
wait -n "$ALTO_PID" "$GATEWAY_PID" 2>/dev/null || true
echo "A process exited, shutting down..."
cleanup
exit 1
