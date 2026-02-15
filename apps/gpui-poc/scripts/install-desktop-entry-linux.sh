#!/usr/bin/env bash
set -euo pipefail

APP_ID="heaven-gpui-poc"

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer is Linux-only."
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXEC_PATH="${APP_DIR}/run.sh"
if [ -x "${APP_DIR}/target/release/${APP_ID}" ]; then
  EXEC_PATH="${APP_DIR}/target/release/${APP_ID}"
fi

LOGO_SRC=""
if [ -f "${APP_DIR}/assets/app_icon/icon.png" ]; then
  LOGO_SRC="${APP_DIR}/assets/app_icon/icon.png"
elif [ -f "${APP_DIR}/logo.png" ]; then
  LOGO_SRC="${APP_DIR}/logo.png"
elif [ -f "${APP_DIR}/assets/images/logo.png" ]; then
  LOGO_SRC="${APP_DIR}/assets/images/logo.png"
else
  echo "logo.png not found at:"
  echo "  - ${APP_DIR}/assets/app_icon/icon.png"
  echo "  - ${APP_DIR}/logo.png"
  echo "  - ${APP_DIR}/assets/images/logo.png"
  exit 1
fi

XDG_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}"
DESKTOP_DIR="${XDG_DATA_HOME}/applications"
ICON_DIR="${XDG_DATA_HOME}/icons/hicolor/256x256/apps"

mkdir -p "${DESKTOP_DIR}"
mkdir -p "${ICON_DIR}"

# Install the icon by name so `Icon=${APP_ID}` resolves via the icon theme.
if command -v convert >/dev/null 2>&1; then
  # Match the directory size (avoids some icon-cache quirks).
  convert "${LOGO_SRC}" -resize 256x256 "${ICON_DIR}/${APP_ID}.png"
else
  cp -f "${LOGO_SRC}" "${ICON_DIR}/${APP_ID}.png"
fi

DESKTOP_PATH="${DESKTOP_DIR}/${APP_ID}.desktop"
cat > "${DESKTOP_PATH}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Heaven (GPUI PoC)
Comment=Heaven GPUI proof of concept
Exec=${EXEC_PATH}
Path=${APP_DIR}
Icon=${APP_ID}
Terminal=false
Categories=AudioVideo;Music;
StartupWMClass=${APP_ID}
EOF

chmod 0644 "${DESKTOP_PATH}"

echo "Installed:"
echo "  Desktop entry: ${DESKTOP_PATH}"
echo "  Icon: ${ICON_DIR}/${APP_ID}.png"
echo ""
echo "If the icon does not update immediately, try logging out/in or restarting your shell."
