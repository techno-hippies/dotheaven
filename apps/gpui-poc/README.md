# Heaven GPUI PoC

This app is a **proof of concept** for a Rust-native desktop client using GPUI.

## Status

- GPUI currently covers shell/navigation/auth persistence/local library UX.
- Synapse/Filecoin upload + storage balance/deposit flows are still implemented in the Tauri + TS app.
- This is intentional for now: we are validating product UX and native shell behavior before full backend migration.

## Why Tauri First (Current Constraint)

We have two working implementations today:

- `apps/frontend` (Tauri + TS/JS app path)
- `lit-actions` (working Synapse integration tests/scripts)

The production Synapse integration is still anchored on `@filoz/synapse-sdk` (TS/JS), so Tauri remains the fastest reliable path while GPUI matures.

## Filoz/Synapse Findings (Local Code Audit)

Current app uses a narrow Synapse surface area (not full SDK):

- `Synapse.create({ signer, withCDN: true })`
- `payments.accountInfo()`
- `payments.depositWithPermitAndApproveOperator(...)`
- `payments.deposit(...)`
- `storage.getStorageInfo()`
- `storage.preflightUpload(sizeBytes)`
- `storage.createContext({ withCDN: true })`
- `context.upload(blob)`

Relevant app files:

- `apps/frontend/src/lib/storage-service.ts`
- `apps/frontend/src/lib/filecoin-upload-service.ts`
- `apps/frontend/src/lib/lit/pkp-ethers-signer.ts`

Important behavior details used by the app:

- Filecoin tx signing is legacy type-0 only.
- Permit/deposit path depends on EIP-712 typed-data signing.
- Upload path intentionally uses `createContext(...).upload(...)` (not `storage.upload(...)`) to preserve dataset reuse behavior in our flow.
- Upload queue is sequential to avoid nonce collisions.

## Migration Direction

### Short term (pragmatic)

Keep Tauri path as primary for storage/upload while GPUI is PoC.

### Mid term (bridge)

If needed, run Synapse TS in a local JS runtime sidecar (Node/Bun) and call it from GPUI Rust over local IPC.

- This removes WebView dependency.
- It is not fully Rust-only runtime.
- It is a practical bridge while native Rust equivalents are built.

### Implemented bridge PoC

A minimal Synapse sidecar is implemented at:

- `apps/gpui-poc/sidecar/synapse-sidecar.ts`

Run it with:

- `bun run sidecar:synapse`

Current bootstrap note:

- The sidecar source lives under GPUI.
- Runtime deps are currently reused from `apps/frontend/node_modules` via a local symlink bootstrap in the root script.
- Next hardening step is a dedicated sidecar lock/install path so this dependency link is removed.

Protocol: NDJSON over stdin/stdout (one JSON-RPC-like message per line).

Supported methods:

- `health`
- `storage.status`
- `storage.depositAndApprove`
- `storage.preflight`
- `storage.upload`
- `storage.reset`

Expected auth payload shape (per request needing auth):

- `pkp`: `{ publicKey, ethAddress, tokenId? }`
- `authData`: `{ authMethodType, authMethodId, accessToken, ... }`

This is intentionally limited to current production needs and does not attempt full Synapse SDK parity.

### Long term (target)

Replace Synapse TS dependency with native Rust storage/payment pipeline for the subset we actually use, then expand if required.

## Voice Transport Note

Agora WebRTC is the current practical route for shipping quickly.

JackTrip remains the long-term peer audio direction, but requires substantial additional engineering (session control, NAT/network strategy, reliability/ops, and UX fallback logic).

Treat Agora as delivery path, JackTrip as strategic upgrade.
