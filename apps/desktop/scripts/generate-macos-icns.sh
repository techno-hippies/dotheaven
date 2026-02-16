#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script must be run on macOS (Darwin)."
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SRC="${APP_DIR}/assets/app_icon/icon.png"
OUT_ICNS="${APP_DIR}/assets/app_icon/icon.icns"
ICONSET_DIR="${APP_DIR}/assets/app_icon/heaven-desktop.iconset"

if [ ! -f "${SRC}" ]; then
  echo "Missing ${SRC}"
  echo "Run ./scripts/generate-app-icons.sh (or add assets/app_icon/icon.png) first."
  exit 1
fi

rm -rf "${ICONSET_DIR}"
mkdir -p "${ICONSET_DIR}"

declare -a SIZES=(16 32 128 256 512)
for size in "${SIZES[@]}"; do
  sips -z "${size}" "${size}" "${SRC}" --out "${ICONSET_DIR}/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "${retina}" "${retina}" "${SRC}" --out "${ICONSET_DIR}/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "${ICONSET_DIR}" -o "${OUT_ICNS}"

echo "Generated:"
echo "  ${OUT_ICNS}"

