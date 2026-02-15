#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

export RUSTFLAGS="${RUSTFLAGS-} -A unexpected_cfgs -A dead_code -A unused_attributes -A unused_imports"

cargo build --manifest-path Cargo.toml --package heaven-gpui-poc "$@"
