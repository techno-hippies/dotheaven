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

Fastest full swap (music-social + profiles + playlists + study-progress) to a local Graph Node:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PSUBGRAPH_BASE_URL=http://<your-host>:8000 \
  installDebug
```

To override only music-social:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PSUBGRAPH_MUSIC_SOCIAL_URL=http://<your-host>:8000/subgraphs/name/dotheaven/music-social-tempo \
  installDebug
```

To override only playlists:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PSUBGRAPH_PLAYLISTS_URL=http://<your-host>:8000/subgraphs/name/dotheaven/playlist-feed-tempo \
  installDebug
```

To override only study-progress:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PSUBGRAPH_STUDY_PROGRESS_URL=http://<your-host>:8000/subgraphs/name/dotheaven/study-progress-tempo \
  installDebug
```

To override only profiles:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PSUBGRAPH_PROFILES_URL=http://<your-host>:8000/subgraphs/name/dotheaven/profiles-tempo \
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
  https://graph.dotheaven.org/subgraphs/name/dotheaven/music-social-tempo
```

Interpretation:
- `HTTP 530` + `error code: 1033`: Cloudflare tunnel connector is down.
- `HTTP 200` with GraphQL JSON: tunnel is up; investigate query/deployment/data.

Expected production Tempo endpoints used by Android:
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/music-social-tempo`
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo`
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/playlist-feed-tempo`
- `https://graph.dotheaven.org/subgraphs/name/dotheaven/study-progress-tempo`

For tunnel service hardening and restart commands, see:
- `services/graph-node-tempo/README.md`
