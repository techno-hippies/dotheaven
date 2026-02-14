#!/usr/bin/env bash
set -euo pipefail

MODULE_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
RUST_ROOT="${MODULE_ROOT}/rust-core"
IOS_LIB_DIR="${MODULE_ROOT}/ios/lib"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iOS Rust build must be run on macOS" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to build Rust iOS libraries" >&2
  exit 1
fi

PLATFORM_NAME="${PLATFORM_NAME:-iphonesimulator}"
ARCHS="${ARCHS:-arm64}"

TARGET=""
case "${PLATFORM_NAME}" in
  iphoneos)
    TARGET="aarch64-apple-ios"
    ;;
  iphonesimulator)
    if [[ "${ARCHS}" == *"arm64"* ]]; then
      TARGET="aarch64-apple-ios-sim"
    elif [[ "${ARCHS}" == *"x86_64"* ]]; then
      TARGET="x86_64-apple-ios"
    else
      echo "Unsupported simulator ARCHS=${ARCHS}" >&2
      exit 1
    fi
    ;;
  *)
    echo "Unsupported PLATFORM_NAME=${PLATFORM_NAME}" >&2
    exit 1
    ;;
esac

if ! rustup target list --installed | grep -q "^${TARGET}$"; then
  echo "Rust target ${TARGET} is missing. Install with: rustup target add ${TARGET}" >&2
  exit 1
fi

pushd "${RUST_ROOT}" >/dev/null
cargo build --release --target "${TARGET}"
popd >/dev/null

mkdir -p "${IOS_LIB_DIR}"
cp "${RUST_ROOT}/target/${TARGET}/release/libheaven_lit_rust.a" "${IOS_LIB_DIR}/libheaven_lit_rust.a"

echo "iOS Rust static library updated for ${TARGET}" >&2
