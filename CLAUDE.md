# Heaven Dev Notes

This file is intentionally short. Use it as the top-level operator guide.

## Non-Negotiables
- Do not start or manage long-running dev servers unless explicitly asked.
- Use `bun` for JS/TS package management and scripts.
- For Android Gradle tasks, always prefix with:
  - `JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8`

## Current Product Surfaces
- Web: `apps/web`
- Desktop (Rust + GPUI): `apps/desktop`
- Android (Kotlin + Compose): `apps/android`
- iOS Swift app is planned, not in this repo yet.

## Fast Commands
- Web typecheck/build:
  - `bun check`
  - `bun build`
- Desktop compile check:
  - `CARGO_TARGET_DIR=/tmp/desktop-check-codex cargo check --manifest-path apps/desktop/Cargo.toml`
- Android compile/build:
  - `cd apps/android && JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew :app:compileDebugKotlin`
  - `cd apps/android && JAVA_HOME=/home/t42/.local/share/jdks/jdk-17.0.18+8 ./gradlew assembleDebug`

## Repo Map
- Product apps: `apps/README.md`
- Shared packages: `packages/README.md`
- Smart contracts: `contracts/README.md`
- Backend/infra services: `services/README.md`
- Indexers: `subgraphs/README.md`
- Lit actions: `lit-actions/README.md`

## Team Conventions
- Keep docs close to code and keep them current.
- Prefer small, explicit modules over large files.
- Preserve behavior unless the task explicitly requires behavior changes.
