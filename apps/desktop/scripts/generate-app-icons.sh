#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SRC="${APP_DIR}/logo.png"
OUT_DIR="${APP_DIR}/assets/app_icon"

if [ ! -f "${SRC}" ]; then
  echo "Missing ${SRC}"
  exit 1
fi

if ! command -v convert >/dev/null 2>&1; then
  echo "ImageMagick 'convert' not found. Install ImageMagick to generate icons."
  exit 1
fi

mkdir -p "${OUT_DIR}"

# Create a square 1024x1024 PNG (centered, transparent padding) as our canonical app icon.
convert "${SRC}" \
  -background none \
  -gravity center \
  -extent "$(identify -format '%[fx:max(w,h)]x%[fx:max(w,h)]' "${SRC}")" \
  -resize 1024x1024 \
  "${OUT_DIR}/icon.png"

# Windows icon (multi-size .ico).
convert "${OUT_DIR}/icon.png" \
  -define icon:auto-resize=256,128,64,48,32,16 \
  "${OUT_DIR}/icon.ico"

echo "Generated:"
echo "  ${OUT_DIR}/icon.png"
echo "  ${OUT_DIR}/icon.ico"

