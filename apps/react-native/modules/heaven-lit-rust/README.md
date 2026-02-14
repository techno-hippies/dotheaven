# heaven-lit-rust (local Expo module)

Native module name: `HeavenLitRust`

## Methods

- `healthcheck(): Promise<string>`
- `createEthWalletAuthData(privateKeyHex: string, nonce: string): Promise<string>`
- `testConnect(network: string, rpcUrl: string): Promise<string>`

Each method returns a JSON envelope:

```json
{ "ok": true, "result": { ... } }
```

or

```json
{ "ok": false, "error": "..." }
```

## Build scripts

- `scripts/build-android.sh`: builds `.so` files into `android/src/main/jniLibs/*`
- `scripts/build-ios.sh`: builds `ios/lib/libheaven_lit_rust.a`
