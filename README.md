# Heaven

Sovereign social + music network with onchain identity, scrobbling, publishing, chat, and live voice rooms.

## Current Product Architecture (February 2026)

We removed the old Tauri desktop path and moved desktop to a native Rust + GPUI client.

We are also moving mobile from React Native to native apps:
- Android is now Kotlin + Jetpack Compose (`apps/android`).
- iOS will be a native Swift app (planned).

## Apps

| Platform | Stack | Directory | Status |
|---|---|---|---|
| Web | SolidJS + Vite + Tailwind | `apps/web` | Active |
| Desktop (Linux/macOS/Windows) | Rust + GPUI | `apps/desktop` | Active |
| Android | Kotlin + Jetpack Compose | `apps/android` | Active |
| iOS | Swift (planned) | TBD | Planned |
| Legacy mobile path | React Native + Expo | `apps/react-native` | Legacy / migration source only |

## Repository Layout

```text
dotheaven/
├── apps/
│   ├── web/              # SolidJS web app
│   ├── desktop/         # Native desktop app (Rust + GPUI)
│   ├── android/       # Native Android app (Kotlin + Compose)
│   └── react-native/     # Legacy mobile code while migration finishes
├── packages/             # Shared TS libs (core/i18n/platform/ui)
├── contracts/            # Smart contracts (MegaETH/Celo/Base)
├── services/             # Workers/APIs/voice/gateway/relayers
├── subgraphs/            # Indexers
└── lit-actions/          # Lit protocol actions
```

## Mega Early Alpha Release Plan

This repo is ready for an internal dev alpha if you keep scope tight and ship binaries/APKs with a short known-issues list.

### 1) Freeze a release commit

```bash
git checkout -b release/alpha-0.1.0
git add -A
git commit -m "chore: alpha 0.1.0 release snapshot"
git tag alpha-0.1.0
```

### 2) Build desktop alpha artifacts

From `apps/desktop`:

Linux:
```bash
./scripts/build-clean.sh --release
# binary: target/release/heaven-desktop
```

macOS:
```bash
./scripts/bundle-macos.sh
# app bundle: dist/Heaven.app
```

Windows (run on a Windows builder):
```bash
cargo build --release --manifest-path Cargo.toml
# binary: target/release/heaven-desktop.exe
```

Suggested packaging:
- Linux: `heaven-desktop-linux-x64.tar.gz`
- macOS: `Heaven-macos-alpha.app.zip`
- Windows: `heaven-desktop-windows-x64.zip`

### 3) Build Android alpha APK

From `apps/android`:

```bash
./gradlew assembleDebug
```

APK output:
- `apps/android/app/build/outputs/apk/debug/app-debug.apk`

Optional unsigned release build:
```bash
./gradlew assembleRelease
```

Output:
- `apps/android/app/build/outputs/apk/release/app-release-unsigned.apk`

For a fast developer alpha, start with the debug APK and distribute only to trusted testers.

### 4) Publish and share

Use a GitHub Release (or shared drive) with:
- Desktop archives + APK
- Commit SHA + tag
- Environment assumptions (required services and env vars)
- "Known issues / rough edges"
- Feedback template (bug, repro steps, device/OS)

Recommended naming:
- Release title: `Heaven Mega Early Alpha 0.1.0`
- Tag: `alpha-0.1.0`

### 5) Keep alpha expectations explicit

Include this in release notes:
- Not production-ready
- Breaking changes expected
- Manual setup required
- Limited platform support and partial feature coverage

## Development Quick Start

Repo install:

```bash
bun install
```

Web:

```bash
bun dev
bun build
bun check
```

Desktop (GPUI):

```bash
cd apps/desktop
./run.sh
```

Android (Kotlin):

```bash
cd apps/android
./gradlew installDebug
```

## Notes

- Root web scripts are in `package.json` and target `apps/web`.
- GPUI desktop environment/config notes are in `apps/desktop/README.md`.
- Android build notes are in `apps/android/CLAUDE.md`.
