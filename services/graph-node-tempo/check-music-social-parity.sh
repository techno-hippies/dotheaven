#!/usr/bin/env bash
set -euo pipefail

LOCAL_URL="${LOCAL_URL:-http://localhost:8000/subgraphs/name/dotheaven/music-social-tempo}"
TUNNEL_URL="${TUNNEL_URL:-https://graph.dotheaven.org/subgraphs/name/dotheaven/music-social-tempo}"
GOLDSKY_URL="${GOLDSKY_URL:-https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn}"
QUERY='{"query":"{ _meta { block { number hash } } tracks(first:1){id} scrobbles(first:1){id} contentEntries(first:1){id} follows(first:1){id} }"}'

probe() {
  local name="$1"
  local url="$2"
  echo "=== ${name}: ${url}"
  if ! response=$(curl -sS -H 'content-type: application/json' --data "${QUERY}" "${url}" 2>&1); then
    echo "ERROR: ${response}"
    echo
    return
  fi

  if command -v jq >/dev/null 2>&1; then
    echo "${response}" | jq -c '{
      block: .data._meta.block.number,
      hash: .data._meta.block.hash,
      sampleTrack: (.data.tracks[0].id // null),
      sampleScrobble: (.data.scrobbles[0].id // null),
      sampleContentEntry: (.data.contentEntries[0].id // null),
      sampleFollow: (.data.follows[0].id // null)
    }'
  else
    echo "${response}"
  fi
  echo
}

probe "local" "${LOCAL_URL}"
probe "tunnel" "${TUNNEL_URL}"
probe "goldsky" "${GOLDSKY_URL}"
