#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIT_WEBVIEW_DIR="$PROJECT_ROOT/lit-webview"
RUST_MODULE_DIR="$PROJECT_ROOT/modules/heaven-lit-rust"
LIT_ENGINE="${EXPO_PUBLIC_LIT_ENGINE:-rust}"

print_help() {
  cat <<'EOF'
Usage: scripts/android-dev.sh [start|install|full|help]

Modes:
  start   Start Metro in dev-client mode (default), with adb reverse.
  install Build lit-webview assets, then install Android app via expo run:android.
  full    install + start (use when you want a fresh end-to-end boot).
  help    Show this message.
EOF
}

ensure_java() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    export PATH="${JAVA_HOME}/bin:${PATH}"
    return
  fi

  if [[ -x "/opt/android-studio/jbr/bin/java" ]]; then
    export JAVA_HOME="/opt/android-studio/jbr"
    export PATH="${JAVA_HOME}/bin:${PATH}"
    return
  fi

  if command -v java >/dev/null 2>&1; then
    local java_bin
    java_bin="$(readlink -f "$(command -v java)")"
    export JAVA_HOME="$(dirname "$(dirname "$java_bin")")"
    export PATH="${JAVA_HOME}/bin:${PATH}"
    return
  fi

  echo "[android-dev] ERROR: JAVA_HOME is not set and java was not found." >&2
  echo "[android-dev] Set JAVA_HOME (example: /opt/android-studio/jbr)." >&2
  exit 1
}

ensure_adb_reverse() {
  if command -v adb >/dev/null 2>&1; then
    adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
  else
    echo "[android-dev] adb not found; skipping adb reverse." >&2
  fi
}

build_lit_webview() {
  echo "[android-dev] Building lit-webview bundle..."
  cd "$LIT_WEBVIEW_DIR"
  if command -v bun >/dev/null 2>&1; then
    bun run build
  else
    npm run build
  fi
}

build_rust_android() {
  echo "[android-dev] Building heaven-lit-rust Android library..."
  cd "$PROJECT_ROOT"
  bash "$RUST_MODULE_DIR/scripts/build-android.sh" "$RUST_MODULE_DIR"
}

clear_stale_expo_module_android_build() {
  local repo_root
  repo_root="$(cd "$PROJECT_ROOT/../.." && pwd)"
  local found_any=false

  echo "[android-dev] Clearing stale expo-modules-core Android build outputs..."
  shopt -s nullglob
  local bun_matches=(
    "$repo_root"/node_modules/.bun/expo-modules-core@*/node_modules/expo-modules-core/android/build
  )
  shopt -u nullglob

  for dir in "${bun_matches[@]}"; do
    found_any=true
    echo "[android-dev]   removing $dir"
    rm -rf "$dir"
  done

  if [[ -d "$PROJECT_ROOT/node_modules/expo-modules-core/android/build" ]]; then
    found_any=true
    echo "[android-dev]   removing $PROJECT_ROOT/node_modules/expo-modules-core/android/build"
    rm -rf "$PROJECT_ROOT/node_modules/expo-modules-core/android/build"
  fi

  if [[ "$found_any" == false ]]; then
    echo "[android-dev]   no stale expo-modules-core build outputs found"
  fi
}

install_android_app() {
  echo "[android-dev] Installing Android dev build..."
  cd "$PROJECT_ROOT"
  if ! npx expo run:android --no-build-cache; then
    echo "[android-dev] First Android build failed. Retrying once after cache cleanup..."
    clear_stale_expo_module_android_build
    npx expo run:android --no-build-cache
  fi
}

start_metro() {
  echo "[android-dev] Starting Metro (dev client mode)..."
  ensure_adb_reverse
  cd "$PROJECT_ROOT"
  # Prefer localhost + adb reverse so a USB-connected device works even without Wi-Fi.
  exec npx expo start --dev-client --clear --port 8081 --localhost
}

main() {
  local mode="${1:-start}"
  ensure_java

  case "$mode" in
    start)
      start_metro
      ;;
    install)
      build_lit_webview
      if [[ "$LIT_ENGINE" == "rust" ]]; then
        build_rust_android
      fi
      install_android_app
      ;;
    full)
      build_lit_webview
      if [[ "$LIT_ENGINE" == "rust" ]]; then
        build_rust_android
      fi
      install_android_app
      start_metro
      ;;
    help|-h|--help)
      print_help
      ;;
    *)
      echo "[android-dev] Unknown mode: $mode" >&2
      print_help
      exit 1
      ;;
  esac
}

main "$@"
