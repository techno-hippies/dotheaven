# Agent Instructions (Android / Kotlin)

## Gradle Preflight (Mandatory)
- Before any Android Gradle command, set `JAVA_HOME` inline in the same command.
- Do not run `./gradlew ...` without `JAVA_HOME=...` prefix.
- Default JDK path for this repo: `/home/t42/.local/share/jdks/jdk-17.0.18+8`

Use these patterns:

```bash
# From apps/android
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew <task>

# From repo root
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./apps/android/gradlew -p ./apps/android <task>
```

Examples:

```bash
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew :app:compileDebugKotlin
JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew installDebug
```
