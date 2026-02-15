#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
MAX_LINES="${1:-450}"
ALLOWLIST_FILE="${RS_SIZE_ALLOWLIST:-$ROOT_DIR/.rs-size-allowlist}"

if ! [[ "$MAX_LINES" =~ ^[0-9]+$ ]]; then
  echo "MAX_LINES must be an integer, got: $MAX_LINES" >&2
  exit 2
fi

allowlist=()
if [[ -f "$ALLOWLIST_FILE" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue
    allowlist+=("$line")
  done < "$ALLOWLIST_FILE"
fi

is_allowlisted() {
  local rel="$1"
  local entry
  for entry in "${allowlist[@]:-}"; do
    [[ "$rel" == "$entry" ]] && return 0
  done
  return 1
}

mapfile -t rows < <(
  find "$SRC_DIR" -name '*.rs' -type f -print0 \
    | xargs -0 wc -l \
    | sed '/ total$/d' \
    | sort -nr
)

violations=()
for row in "${rows[@]}"; do
  lines="$(awk '{print $1}' <<<"$row")"
  path="$(awk '{print $2}' <<<"$row")"
  rel="${path#"$ROOT_DIR"/}"

  if (( lines > MAX_LINES )); then
    if ! is_allowlisted "$rel"; then
      violations+=("$lines $rel")
    fi
  fi
done

if ((${#violations[@]} > 0)); then
  echo "Rust file size check failed: files over ${MAX_LINES} lines not in allowlist:" >&2
  printf '  %s\n' "${violations[@]}" >&2
  echo "\nAdd explicit entries to $ALLOWLIST_FILE only when temporary debt is unavoidable." >&2
  exit 1
fi

echo "Rust file size check passed (max ${MAX_LINES} lines)."
