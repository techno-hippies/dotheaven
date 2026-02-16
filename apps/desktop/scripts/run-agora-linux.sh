#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${1:-/home/t42/Downloads/agora}"
SDK_ROOT="${2:-/tmp/agora-sdk-linux}"

cd "$ROOT_DIR"

if [[ "${HEAVEN_ENABLE_SCARLETT_DESKTOP_AGORA:-0}" != "1" ]]; then
  echo "GPUI Scarlett desktop Agora is disabled by default."
  echo "Desktop voice is JackTrip-only for now."
  echo
  echo "If you intentionally want to run the deprecated native Agora path, set:"
  echo "  HEAVEN_ENABLE_SCARLETT_DESKTOP_AGORA=1"
  exit 1
fi

"$ROOT_DIR/scripts/setup-agora-linux-sdk.sh" "$DOWNLOAD_DIR" "$SDK_ROOT"

export AGORA_SDK_ROOT="$SDK_ROOT"
export AGORA_SDK_LIB_NAME=agora_rtc_sdk
export LD_LIBRARY_PATH="$SDK_ROOT/lib:${LD_LIBRARY_PATH:-}"

echo
echo "Starting GPUI with native Agora (Linux)..."
echo "  AGORA_SDK_ROOT=$AGORA_SDK_ROOT"
echo "  AGORA_SDK_LIB_NAME=$AGORA_SDK_LIB_NAME"
echo "  LD_LIBRARY_PATH prepended with: $SDK_ROOT/lib"
echo

exec cargo run --features agora-native
