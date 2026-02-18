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

To point profile scrobble reads at a custom subgraph endpoint (self-hosted Graph Node or Goldsky):

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_SCROBBLE_SUBGRAPH_URL=http://<your-host>:8000/subgraphs/name/dotheaven/activity-feed-tempo \
  installDebug
```

To point profile/community profile reads at a custom profiles subgraph endpoint (for Cloudflare tunnel or self-hosted Graph Node):

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew \
  -PTEMPO_PROFILES_SUBGRAPH_URL=http://<your-host>:8000/subgraphs/name/dotheaven/profiles-tempo \
  installDebug
```

For USB debugging against a local indexer on your dev machine, you can also use:

```bash
adb reverse tcp:42069 tcp:42069
adb reverse tcp:8000 tcp:8000
```

## Notes
- This project is Kotlin-only for mobile right now (no React Native app in repo).
- Contributor guardrails for agents live in `apps/android/AGENTS.md`.
