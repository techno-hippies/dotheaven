# ANS-104 Shared Module & Avatar Upload Plan

Date: 2026-02-17
Status: Active (v2 — post-audit, operational updates applied)

## Problem

1. Avatar photos currently upload via Filebase through `heaven-api` backend proxy — unnecessary backend dependency for a simple file upload.
2. ANS-104 dataitem construction is needed in multiple surfaces (Rust desktop, Kotlin Android, TypeScript web/backend) but only exists in Rust today.
3. Face photos should NOT go to permanent Arweave storage (right to be forgotten). Need deletable storage with the same upload path.

## Current ANS-104 State by Surface

| Surface | ANS-104 today? | Signing key | Notes |
|---|---|---|---|
| Desktop (Rust) — `scrobble/tempo.rs` | Yes — `bundles_rs` crate | Tempo session key (secp256k1 LocalWallet) | Covers + lyrics via Tempo path, working |
| Desktop (Rust) — `load_storage/` | Yes — `bundles_rs` crate | PKP key via Lit (legacy) | Old encrypted audio upload path; being deprecated per `new-architecture.md` |
| Android (Kotlin) | No | Tempo session key (secp256k1 via SessionKeyManager) | Uploads go through heaven-api proxy |
| Web (TypeScript) | No (proxied) | N/A (backend signs) | Uses heaven-api `/api/arweave/cover` |
| Backend worker | Planned | Relay EOA | Song publish pipeline (see `song-upload-backend-worker-vs-tee.md`) |

## Key Decisions

### 1. Storage tier by content type

| Content | Ref format | Anchored to Arweave? | Deletable? | Why |
|---|---|---|---|---|
| Avatar photos | `ls3://` | No | Yes (LS3 offchain only) | Right to be forgotten — face photos |
| Track covers | `ar://` | Yes | No | Permanent music metadata |
| Lyrics JSON | `ar://` | Yes | No | Permanent music metadata |
| Song audio/stems | `ls3://` (staged now), `ar://` (finalize) | Not by default in current submit flow | Yes while staged | Delayed-anchor policy and gated `/post` entitlement |
| Canvas media | Filebase/CDN | No | Yes | Fast playback, optional archival |

### 2. Upload vs anchoring — two separate operations

**Upload** (client-side, no auth needed):
- POST signed ANS-104 dataitem to `loaded-turbo-api.load.network/v1/tx/ethereum`
- No auth headers, no API key
- Free for files under 1MB (confirmed `freeUploadLimitBytes=1048576` as of 2026-02-17)
- Returns dataitem ID
- Data lives on LS3 (offchain, deletable)

**Anchoring** (backend-only, requires auth):
- Separate `/post/{id}` call on `load-s3-agent.load.network` with `LOAD_S3_AGENT_API_KEY`
- Pushes dataitem from LS3 to permanent Arweave storage
- Client CANNOT do this directly — requires privileged backend auth
- Only `heaven-api` proxy or backend worker can anchor

**Implication**:
- Avatars: client uploads directly, no anchor, store `ls3://` — done
- Covers/lyrics: client uploads directly, then backend anchors and ref becomes `ar://` — OR keep current heaven-api proxy flow for covers until direct client upload is validated
- Song audio: backend handles staging now; permanent anchor is an explicit finalize step

### Probe Result (2026-02-17)

A real signed Ethereum ANS-104 item was uploaded directly to Turbo:

- Endpoint: `POST https://loaded-turbo-api.load.network/v1/tx/ethereum`
- Returned ID: `9k7-1FercabFW4ryVtjdrm3gjdGmHVBam1iRn6W6la8`
- LS3 retrieval: `GET https://gateway.s3-node-1.load.network/resolve/9k7-1FercabFW4ryVtjdrm3gjdGmHVBam1iRn6W6la8` returned `200` with payload bytes
- Arweave retrieval at probe time: `GET https://arweave.net/9k7-1FercabFW4ryVtjdrm3gjdGmHVBam1iRn6W6la8` was not immediately available (redirect then `404`)

**Confirmed (2026-02-17)**: `loaded-turbo-api` does NOT auto-anchor to Arweave. Anchoring only happens via `load-s3-agent.load.network/post/{id}` (requires `Authorization: Bearer` API key — backend-only). This means direct Turbo upload is the correct and permanent path for avatars: data stays on LS3, is retrievable via gateway, and is never permanently anchored.

### Endpoint Summary (Settled)

| Operation | Endpoint | Auth required? | Result |
|---|---|---|---|
| Upload (LS3 offchain) | `loaded-turbo-api.load.network/v1/tx/ethereum` | No | `ls3://` ref, deletable |
| Anchor to Arweave | `load-s3-agent.load.network/post/{id}` | Yes (Bearer token) | `ar://` ref, permanent |
| Retrieve | `gateway.s3-node-1.load.network/resolve/{id}` | No | Works for both |

- **Avatars**: direct Turbo upload, no anchor, no backend. Final.
- **Covers/lyrics**: direct Turbo upload + backend anchor via agent `/post/{id}`. Or keep current heaven-api proxy.
- **Song audio**: backend stages first; anchor is delayed/finalize.

### Operational Note (2026-02-17)

1. Current production `LOAD_S3_AGENT_API_KEY` supports `POST /upload`.
2. Current production key does not have `POST /post/{id}` entitlement yet.
3. Because of that, Kotlin publish UX is intentionally staged-only for now (`start` -> `preflight`).
4. Arweave anchor + Story registration remain server-side finalize actions and are not in default submit UX.

### 3. Signing

All client-side ANS-104 dataitems are signed with the user's Tempo session key (secp256k1). This is the same key used for scrobble and other background operations — no biometric prompt needed per upload.

Note: The desktop `load_storage/` module still uses PKP/Lit signing for the legacy encrypted audio path. This is being deprecated. The Tempo path in `scrobble/tempo.rs` uses session key signing — that's the model we're replicating in Kotlin.

## ANS-104 Binary Format (Reference)

For Ethereum signature type (type 3):

```
[2 bytes]   signature type (3 as little-endian u16)
[65 bytes]  signature (ECDSA secp256k1 r+s+v, v adjusted to ≥27)
[65 bytes]  owner (uncompressed secp256k1 public key: 0x04 + X + Y)
[1 byte]    target present (0 = absent)
[1 byte]    anchor present (0 = absent)
[8 bytes]   number of tags (little-endian u64)
[8 bytes]   number of tag bytes (little-endian u64)
[N bytes]   AVS-serialized tags
[M bytes]   data payload
```

If target present = 1, 32 bytes of target follow the flag byte. Same for anchor.

Signing message = `deep_hash("dataitem", "1", sig_type_str, owner, target, anchor, tags_bytes, data)`.
Deep hash uses SHA-384. Final signature = `keccak256("\x19Ethereum Signed Message:\n" + len + signing_message)` → secp256k1 sign → 65 bytes (r + s + v).

Reference implementation: `apps/desktop/src/scrobble/tempo.rs` lines 336-376.

## Implementation: Kotlin ANS-104 Module

### Location

`apps/android/app/src/main/java/com/pirate/app/arweave/Ans104DataItem.kt`

### Scope

~200 lines, mirroring GPUI `scrobble/tempo.rs` stages:
- `Ans104DataItem` class: builds binary dataitem from tags + data payload
- `sign(privateKey)`: deep hash → eth personal sign → 65-byte signature with v ≥ 27
- `toBytes()`: serializes to wire format (signature type 3, 65-byte owner, tags, data)
- `upload()`: POST to Turbo endpoint, parse response robustly (`id`, `dataitem_id`, `dataitemId`, nested `result.*`)
- `Tag(name, value)` data class
- `deepHash()`: SHA-384 recursive hash per Arweave spec

### Dependencies

Already available in Android app:
- `org.web3j` — secp256k1 signing, keccak256
- `org.bouncycastle` — SHA-384 for deep hash
- `java.net.HttpURLConnection` — HTTP POST (already used for other uploads)

No new dependencies needed.

### Reuse points

Once the Kotlin module exists, it handles:
1. **Avatar upload** (this task) — `ls3://` ref, no anchor
2. **Track cover upload** — replaces heaven-api proxy path for covers (anchor step still via backend)
3. **Any future small-file client upload** on Android

## Avatar Upload Flow (Target)

### Upload

1. User picks/takes photo → compress to JPEG ≤100KB (existing `processAvatarImage()`)
2. Build ANS-104 dataitem:
   - Tags: `Content-Type: image/jpeg`, `App-Name: Heaven`, `Heaven-Type: avatar`
   - Data: JPEG bytes
   - Owner: session key public key (uncompressed secp256k1, 65 bytes)
3. Sign with Tempo session key
4. POST to `https://loaded-turbo-api.load.network/v1/tx/ethereum`
5. Extract dataitem ID from response
6. Store `ls3://{id}` as `photoUri` in ProfileV2 contract
7. Store `ls3://{id}` as `avatar` text record on .heaven name (if name exists)

### Display

Replace all 4 duplicated `resolveAvatarUrl()` functions with `CoverRef.resolveCoverUrl()` which already handles:
- `ls3://{id}` → `https://gateway.s3-node-1.load.network/resolve/{id}`
- `ipfs://{cid}` → `https://heaven.myfilebase.com/ipfs/{cid}`
- `ar://{id}` → `https://arweave.net/{id}`
- Raw CIDs (`Qm...`, `bafy...`) → Filebase gateway
- `http(s)://` passthrough

### Deletion (future)

If user changes avatar or deletes account:
- Old `ls3://` dataitem is offchain only — not anchored to Arweave
- Can be removed from LS3 MinIO cluster (requires Load operator action or future self-serve API)
- New avatar overwrites `photoUri` on-chain; old ref becomes unreferenced

## Files Changed

### New
- `apps/android/app/src/main/java/com/pirate/app/arweave/Ans104DataItem.kt` — ANS-104 builder + signer + uploader

### Modified
- `apps/android/app/src/main/java/com/pirate/app/profile/ProfileAvatarUploadApi.kt` — replace Filebase upload with ANS-104 → Turbo upload, return `ls3://{id}`
- `apps/android/app/src/main/java/com/pirate/app/profile/ProfileEditScreen.kt` — use `CoverRef.resolveCoverUrl()` for avatar display; ensure `photoUri` and name record `avatar` both write `ls3://` refs
- `apps/android/app/src/main/java/com/pirate/app/profile/ProfileScreen.kt` — replace `resolveAvatarUrl()` with `CoverRef.resolveCoverUrl()`
- `apps/android/app/src/main/java/com/pirate/app/chat/ChatScreen.kt` — replace `resolveAvatarUrl()` with `CoverRef.resolveCoverUrl()`
- `apps/android/app/src/main/java/com/pirate/app/ui/PirateSideMenuDrawer.kt` — replace `resolveAvatarUrl()` with `CoverRef.resolveCoverUrl()`
- `apps/android/app/src/main/java/com/pirate/app/onboarding/OnboardingScreen.kt` — update avatar upload during onboarding to use ANS-104 → `ls3://` ref instead of Filebase → `ipfs://` ref
- `apps/android/app/src/main/java/com/pirate/app/music/CoverRef.kt` — no changes needed (already supports `ls3://`)

### Not changed
- `services/heaven-api/` — no backend changes needed for avatar flow
- Desktop Rust — already has its own ANS-104 via `bundles_rs`

## Migration / Backward Compatibility

- Existing `ipfs://` avatar refs continue to resolve via Filebase gateway indefinitely
- New avatars get `ls3://` refs
- No data migration needed — forward-only
- `CoverRef.resolveCoverUrl()` already handles all ref formats

## Open Questions

1. ~~**Auto-anchor semantics**~~: **RESOLVED** — `loaded-turbo-api` does NOT auto-anchor. Anchoring requires explicit `load-s3-agent.load.network/post/{id}` with API key. Avatars via direct Turbo are safe.
2. **LS3 deletion API**: Does Load Network expose a delete endpoint for offchain dataitems, or does it require operator contact? Needed for right-to-be-forgotten compliance.
3. **LS3 data retention**: What is the default TTL for offchain dataitems that are never anchored? Need confirmation to avoid unexpected expiry.
4. **Web avatar upload**: Web currently uses same Filebase proxy. Should web also switch to direct ANS-104? Deferred.
