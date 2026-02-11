#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${1:-/home/t42/Downloads/agora}"
SDK_ROOT="${2:-/tmp/agora-sdk-linux}"

cd "$ROOT_DIR"

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
