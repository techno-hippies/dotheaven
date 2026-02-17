#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <tunnel-name>"
  exit 1
fi

TUNNEL_NAME="$1"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed or not in PATH."
  exit 1
fi

echo "Running named tunnel '${TUNNEL_NAME}' using ~/.cloudflared/config.yml"
exec cloudflared tunnel run "${TUNNEL_NAME}"
