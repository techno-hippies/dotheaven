# Kotlin App

## Build & Install

JAVA_HOME must be set for gradlew. Always use this exact command:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew installDebug
```

Run from `apps/android/` or use `-p` flag:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 /media/t42/th42/Code/dotheaven/apps/android/gradlew -p /media/t42/th42/Code/dotheaven/apps/android installDebug
```

## Key Directories

- `app/src/main/java/com/pirate/app/` — Main app code
- `app/src/main/java/com/pirate/app/onboarding/` — Onboarding flow (8 steps)
- `app/src/main/java/com/pirate/app/lit/` — Lit Protocol / PKP auth
- `app/src/main/java/com/pirate/app/profile/` — Profile screen
- `app/src/main/java/com/pirate/app/scarlett/` — AI chat (Scarlett)
- `app/src/main/java/com/pirate/app/music/` — Music / content access
