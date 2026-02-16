#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script must be run on macOS (Darwin)."
  exit 1
fi

APP_ID="heaven-desktop"
APP_NAME="Heaven"
BUNDLE_ID="com.dotheaven.desktop"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ICNS_PATH="${APP_DIR}/assets/app_icon/icon.icns"
if [ ! -f "${ICNS_PATH}" ]; then
  echo "Missing ${ICNS_PATH}; generating..."
  "${APP_DIR}/scripts/generate-macos-icns.sh"
fi

VERSION="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "${APP_DIR}/Cargo.toml" | head -n 1)"
if [ -z "${VERSION}" ]; then
  VERSION="0.1.0"
fi

echo "Building ${APP_ID} ${VERSION}..."
cargo build --release --manifest-path "${APP_DIR}/Cargo.toml"

BIN_PATH="${APP_DIR}/target/release/${APP_ID}"
if [ ! -f "${BIN_PATH}" ]; then
  echo "Missing binary: ${BIN_PATH}"
  exit 1
fi

DIST_DIR="${APP_DIR}/dist"
BUNDLE_PATH="${DIST_DIR}/${APP_NAME}.app"
CONTENTS="${BUNDLE_PATH}/Contents"
MACOS_DIR="${CONTENTS}/MacOS"
RES_DIR="${CONTENTS}/Resources"

rm -rf "${BUNDLE_PATH}"
mkdir -p "${MACOS_DIR}"
mkdir -p "${RES_DIR}"

cp -f "${BIN_PATH}" "${MACOS_DIR}/${APP_ID}"
cp -f "${ICNS_PATH}" "${RES_DIR}/AppIcon.icns"

cat > "${CONTENTS}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_ID}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.music</string>
</dict>
</plist>
EOF

if command -v codesign >/dev/null 2>&1; then
  # Ad-hoc sign for local runs (helps avoid some Gatekeeper friction).
  codesign --force --deep --sign - "${BUNDLE_PATH}" >/dev/null 2>&1 || true
fi

echo "Created:"
echo "  ${BUNDLE_PATH}"
