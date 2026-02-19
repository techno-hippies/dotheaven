# Android App (Kotlin)

## Build & Install

JAVA_HOME must be set for gradlew for all tasks (build, install, compile, test).
Do not run `./gradlew` without a `JAVA_HOME=...` prefix.

Use this path in this environment:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8
```

Build/install example:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew installDebug
```

Compile check example:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew :app:compileDebugKotlin
```

Run from `apps/android/` or use `-p` flag:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./apps/android/gradlew -p ./apps/android installDebug
```

## Key Directories

- `app/src/main/java/com/pirate/app/` — Main app code (legacy package namespace)
- `app/src/main/java/com/pirate/app/onboarding/` — Onboarding flow (8 steps)
- `app/src/main/java/com/pirate/app/tempo/` — Tempo chain auth (passkeys, session keys)
- `app/src/main/java/com/pirate/app/profile/` — Profile screen
- `app/src/main/java/com/pirate/app/scarlett/` — AI chat (Scarlett)
- `app/src/main/java/com/pirate/app/music/` — Music / content access
