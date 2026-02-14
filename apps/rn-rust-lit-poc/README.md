# RN Rust Lit PoC

This is an isolated Expo app for testing a Rust-backed Lit bridge.

## What this PoC tests

- Expo local module autolinking from `./modules`
- Rust FFI bridge callable from React Native JS
- `lit-rust-sdk` calls from Rust:
  - healthcheck
  - `create_eth_wallet_auth_data`
  - `create_lit_client` connectivity test against Naga networks

## Layout

- `modules/heaven-lit-rust/`: local Expo native module (Android + iOS)
- `modules/heaven-lit-rust/rust-core/`: Rust crate (`cdylib` + `staticlib`)
- `src/lib/lit-rust.ts`: JS wrapper for the native module
- `App.tsx`: simple test UI for invoking bridge methods

## Android setup

1. Install cargo-ndk:

```bash
cargo install cargo-ndk
```

2. Build Rust Android artifacts:

```bash
npm run rust:build:android
```

3. Run the app:

```bash
npm run android
```

## iOS setup (macOS only)

The iOS podspec runs `modules/heaven-lit-rust/scripts/build-ios.sh` during pod build.

You need Rust iOS targets installed (at least one simulator + device):

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
```

Then run:

```bash
npm run ios
```

## Notes

- This PoC depends on your local Naga branch SDK path:
  `../../../../../lit-rust-sdk/lit-rust-sdk` relative to `rust-core/Cargo.toml`.
- It does not modify the existing app at `apps/react-native`.
