#!/usr/bin/env bash
set -euo pipefail

DOWNLOAD_DIR="${1:-/home/t42/Downloads/agora}"
OUT_DIR="${2:-/tmp/agora-sdk-linux}"
DEFAULT_LINUX_SDK_URL="${AGORA_LINUX_SDK_URL:-https://download.agora.io/sdk/release/agora_rtc_sdk_x86_64-linux-gnu-v4.4.32.161_27323_SERVER_20260128_1128_1004648_20251021_1427-3a.zip}"
TMP_DOWNLOAD="${TMPDIR:-/tmp}/agora-linux-server-sdk.zip"
MANIFEST_FILE=".heaven-agora-sdk-manifest"
AGORA_ALLOW_SERVER_SDK="${AGORA_ALLOW_SERVER_SDK:-0}"

if [[ "${AGORA_FORCE_SETUP:-0}" != "1" ]] \
  && [[ -f "$OUT_DIR/include/IAgoraService.h" ]] \
  && [[ -f "$OUT_DIR/lib/libagora_rtc_sdk.so" ]]; then
  manifest_seen=0
  if [[ -f "$OUT_DIR/$MANIFEST_FILE" ]]; then
    manifest_seen=1
    if grep -q '^source_type=linux_java_hybrid$' "$OUT_DIR/$MANIFEST_FILE"; then
      echo "==> Reusing existing AGORA_SDK_ROOT at: $OUT_DIR"
      exit 0
    fi

    if grep -q '^source_type=linux_server_zip$' "$OUT_DIR/$MANIFEST_FILE"; then
      if [[ "$AGORA_ALLOW_SERVER_SDK" == "1" ]]; then
        echo "==> Reusing existing AGORA_SDK_ROOT (server SDK) at: $OUT_DIR"
        exit 0
      fi
      echo "==> Existing AGORA_SDK_ROOT uses Linux server SDK."
      echo "==> This bundle has reproduced initialize-time segfaults on Ubuntu 24.04."
      echo "==> Rebuilding with Linux Java SDK native libs if available."
    fi
  fi

  if [[ "$manifest_seen" == "0" ]]; then
    echo "==> Existing AGORA_SDK_ROOT at $OUT_DIR looks legacy/mixed (missing manifest)."
    echo "==> Rebuilding SDK root to avoid header/library ABI mismatch crashes."
  fi
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "error: unzip is required" >&2
  exit 1
fi

LINUX_SERVER_ZIP=""
LINUX_JAVA_SDK_ZIP=""
if [[ -d "$DOWNLOAD_DIR" ]]; then
  LINUX_SERVER_ZIP="$(find "$DOWNLOAD_DIR" -maxdepth 1 -type f \( -name 'agora_rtc_sdk*_linux*SERVER*.zip' -o -name 'agora_rtc_sdk*_linux*.zip' \) | sort | tail -n1 || true)"
  LINUX_JAVA_SDK_ZIP="$(find "$DOWNLOAD_DIR" -maxdepth 1 -type f -name 'Agora-Linux-Java-SDK*.zip' | sort | tail -n1 || true)"
fi

if [[ -z "${LINUX_SERVER_ZIP:-}" ]]; then
  if [[ -f "$TMP_DOWNLOAD" ]]; then
    echo "==> Reusing cached Linux SDK zip: $TMP_DOWNLOAD"
    LINUX_SERVER_ZIP="$TMP_DOWNLOAD"
  else
    echo "==> No local Linux server RTC SDK zip found in: $DOWNLOAD_DIR"
    echo "==> Downloading matching Linux SDK bundle:"
    echo "    $DEFAULT_LINUX_SDK_URL"
    curl -fL "$DEFAULT_LINUX_SDK_URL" -o "$TMP_DOWNLOAD"
    LINUX_SERVER_ZIP="$TMP_DOWNLOAD"
  fi
else
  echo "==> Using local Linux SDK zip: $LINUX_SERVER_ZIP"
fi

USE_JAVA_NATIVE_LIBS=0
if [[ -n "${LINUX_JAVA_SDK_ZIP:-}" ]] && [[ "${AGORA_PREFER_SERVER_SDK:-0}" != "1" ]]; then
  USE_JAVA_NATIVE_LIBS=1
  echo "==> Using Linux Java SDK native libs: $LINUX_JAVA_SDK_ZIP"
elif [[ -z "${LINUX_JAVA_SDK_ZIP:-}" ]]; then
  if [[ "$AGORA_ALLOW_SERVER_SDK" != "1" ]]; then
    echo "==> warning: Linux Java SDK zip not found in $DOWNLOAD_DIR."
    echo "==> warning: falling back to Linux server SDK (known to crash on some systems)."
    echo "==> warning: set AGORA_ALLOW_SERVER_SDK=1 to silence this warning."
  fi
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

tmp_extract="$(mktemp -d /tmp/agora-linux-sdk.XXXXXX)"
tmp_java_extract="$(mktemp -d /tmp/agora-java-sdk.XXXXXX)"
trap 'rm -rf "$tmp_extract" "$tmp_java_extract"' EXIT
unzip -qq "$LINUX_SERVER_ZIP" -d "$tmp_extract"

SDK_ROOT_IN_ZIP="$(find "$tmp_extract" -maxdepth 2 -type d -name 'agora_sdk' | head -n1 || true)"
if [[ -z "${SDK_ROOT_IN_ZIP:-}" ]]; then
  echo "error: could not locate agora_sdk/ in $LINUX_SERVER_ZIP" >&2
  exit 1
fi

if [[ ! -d "$SDK_ROOT_IN_ZIP/include" ]]; then
  echo "error: missing include/ in extracted SDK at $SDK_ROOT_IN_ZIP" >&2
  exit 1
fi

mkdir -p "$OUT_DIR/include" "$OUT_DIR/lib"
cp -a "$SDK_ROOT_IN_ZIP/include/." "$OUT_DIR/include/"

SOURCE_TYPE="linux_server_zip"
if [[ "$USE_JAVA_NATIVE_LIBS" == "1" ]]; then
  unzip -qq "$LINUX_JAVA_SDK_ZIP" 'sdk/agora-sdk.jar' -d "$tmp_java_extract"
  if [[ ! -f "$tmp_java_extract/sdk/agora-sdk.jar" ]]; then
    echo "error: sdk/agora-sdk.jar missing in $LINUX_JAVA_SDK_ZIP" >&2
    exit 1
  fi
  unzip -qq "$tmp_java_extract/sdk/agora-sdk.jar" 'native/linux/x86_64/*' -d "$tmp_java_extract"
  JAVA_NATIVE_DIR="$tmp_java_extract/native/linux/x86_64"
  if [[ ! -d "$JAVA_NATIVE_DIR" ]]; then
    echo "error: native/linux/x86_64 missing in $LINUX_JAVA_SDK_ZIP" >&2
    exit 1
  fi
  find "$JAVA_NATIVE_DIR" -maxdepth 1 -type f -name '*.so' -exec cp -a {} "$OUT_DIR/lib/" \;
  SOURCE_TYPE="linux_java_hybrid"
else
  find "$SDK_ROOT_IN_ZIP" -maxdepth 1 -type f -name '*.so' -exec cp -a {} "$OUT_DIR/lib/" \;
fi

if [[ ! -f "$OUT_DIR/lib/libagora_rtc_sdk.so" ]]; then
  echo "error: libagora_rtc_sdk.so not found in extracted SDK" >&2
  exit 1
fi

echo "==> Prepared AGORA_SDK_ROOT at: $OUT_DIR"
echo "    include/: $(find "$OUT_DIR/include" -maxdepth 1 -type f | wc -l | tr -d ' ') headers"
echo "    lib/: $(find "$OUT_DIR/lib" -maxdepth 1 -type f -name '*.so' | wc -l | tr -d ' ') shared libraries"
echo
echo "Use with GPUI:"
echo "  export AGORA_SDK_ROOT=\"$OUT_DIR\""
echo "  export AGORA_SDK_LIB_NAME=agora_rtc_sdk"
echo "  export LD_LIBRARY_PATH=\"$OUT_DIR/lib:\${LD_LIBRARY_PATH:-}\""
echo "  cargo run --features agora-native"

cat > "$OUT_DIR/$MANIFEST_FILE" <<EOF
source_type=$SOURCE_TYPE
source_zip=$LINUX_SERVER_ZIP
source_java_zip=${LINUX_JAVA_SDK_ZIP:-}
generated_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
