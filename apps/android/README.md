# Android App

Native Android client built with Kotlin + Jetpack Compose.

## Location
- App module: `apps/android/app/`

## Build Quickstart
From repo root:

```bash
cd apps/android
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew assembleDebug
```

APK output:
- `apps/android/app/build/outputs/apk/debug/app-debug.apk`

## Helpful Commands
From `apps/android`:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew :app:compileDebugKotlin
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew installDebug
```

To point profile scrobble reads at a custom Tempo indexer:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_SCROBBLE_API=http://<your-host>:42069 \
  installDebug
```

To point music-social reads (scrobbles, published songs, follows, shared content) at a custom subgraph endpoint (self-hosted Graph Node or Goldsky):

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_MUSIC_SOCIAL_SUBGRAPH_URL=http://<your-host>:8000/subgraphs/name/dotheaven/music-social-tempo \
  installDebug
```

To point profile/music playlist reads at a custom playlists subgraph endpoint:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_PLAYLISTS_SUBGRAPH_URL=http://<your-host>:8000/<your-playlists-subgraph-path> \
  installDebug
```

To point Learn queue reads at a custom `study-progress` subgraph endpoint:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_STUDY_PROGRESS_SUBGRAPH_URL=http://<your-host>:8000/subgraphs/name/dotheaven/study-progress-tempo \
  installDebug
```

To point profile/community profile reads at a custom profiles subgraph endpoint (for Cloudflare tunnel or self-hosted Graph Node):

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_PROFILES_SUBGRAPH_URL=http://<your-host>:8000/subgraphs/name/dotheaven/profiles-tempo \
  installDebug
```

To enable on-chain follow reads/writes against a Tempo FollowV1 deployment:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_FOLLOW_V1=0x<follow-v1-address> \
  installDebug
```

For USB debugging against a local indexer on your dev machine, you can also use:

```bash
adb reverse tcp:42069 tcp:42069
adb reverse tcp:8000 tcp:8000
```

## Notes
- Contributor guardrails for agents live in `apps/android/AGENTS.md`.

## Subgraph Outage Triage (530 / 1033)

If Music or Artist pages fail with `Subgraph query failed: 530`, check infrastructure first.

Quick check:

```bash
curl -sS -i -H 'content-type: application/json' \
  --data '{"query":"{__typename}"}' \
  https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn
```

Interpretation:
- `HTTP 530` + `error code: 1033`: Cloudflare tunnel connector is down.
- `HTTP 200` with GraphQL JSON: tunnel is up; investigate query/deployment/data.

Expected production Tempo endpoints used by Android:
- `https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn`
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo`
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/playlist-feed-tempo`
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/study-progress-tempo`

For tunnel service hardening and restart commands, see:
- `services/graph-node-tempo/README.md`
