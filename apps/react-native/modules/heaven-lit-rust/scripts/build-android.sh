#!/usr/bin/env bash
set -euo pipefail

MODULE_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
RUST_ROOT="${MODULE_ROOT}/rust-core"
JNI_OUT="${MODULE_ROOT}/android/src/main/jniLibs"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to build Rust Android libraries" >&2
  exit 1
fi

if ! cargo ndk --version >/dev/null 2>&1; then
  echo "cargo-ndk is required. Install it with: cargo install cargo-ndk" >&2
  exit 1
fi

mkdir -p "${JNI_OUT}"

pushd "${RUST_ROOT}" >/dev/null
cargo ndk \
  --platform 24 \
  -t armeabi-v7a \
  -t arm64-v8a \
  -t x86_64 \
  -o "${JNI_OUT}" \
  build --release
popd >/dev/null

echo "Android Rust artifacts copied to ${JNI_OUT}" >&2
