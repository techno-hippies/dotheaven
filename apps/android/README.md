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

## Notes
- This project is Kotlin-only for mobile right now (no React Native app in repo).
- Contributor guardrails for agents live in `apps/android/AGENTS.md`.
