#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-http://localhost:8000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed or not in PATH."
  echo "Install: curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared && chmod +x ~/.local/bin/cloudflared"
  exit 1
fi

echo "Starting temporary Cloudflare tunnel -> ${TARGET_URL}"
echo "Press Ctrl+C to stop."
exec cloudflared tunnel --url "${TARGET_URL}"
