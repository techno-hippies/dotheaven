# Architecture: Tempo Migration — Ditching PKPs + ERC-4337

Date: 2026-02-16
Status: Active

## TL;DR

Replace Lit PKP wallets ($0.15/mint, $0.03/tx) and our ERC-4337 AA stack (Alto bundler, HeavenAccountFactory, paymaster) with **Tempo native accounts**:

- **Passkey-based accounts** (WebAuthn/P256) — free to create, protocol-native
- **Fee sponsorship** — native `feePayer` field on Tempo Transactions, no paymaster contract
- **Session keys** — protocol-native keychain, no smart contract wallet needed
- **Batching** — native `calls` array, no bundler

This eliminates: Lit network costs, Alto bundler, `services/alto`, paymaster infra, `HeavenAccountFactory`, and all PKP minting/signing code.

---

## 1) What Tempo Gives Us (vs Current Stack)

| Capability | Current (Lit + ERC-4337) | Tempo Native |
|---|---|---|
| Account creation | Lit PKP mint ($0.15) | Passkey registration (free) |
| Signing | Lit node network ($0.03/sig) | Local WebAuthn biometric (free) |
| Fee sponsorship | Alto bundler + paymaster contract | `feePayer: true` on tx + sponsor service |
| Batching | UserOp bundling via Alto | Native `calls[]` in tx |
| Session keys | Not implemented (was TODO) | Protocol-native keychain (secp256k1 ephemeral keys) |
| Account binding | `onlyAccountOf` + HeavenAccountFactory | Direct EOA with `msg.sender` |

## 2) What We Remove

### 2.1 Lit PKP Infrastructure (all surfaces)
- **GPUI desktop**: `lit_wallet.rs`, `lit_action_registry.rs`, PKP signing in `xmtp_service.rs`, `rooms.rs`
- **Web**: `apps/web/src/lib/lit/` (session management, action CIDs, PKP auth)
- **Android**: PKP signer in `ProfileContractApi.kt`
- **Lit Actions for signing**: All `*For()` Lit Actions that exist only to relay-sign (like-v1, comment-v1, follow-v1, post-register-v1 signing portion, etc.)
- **Lit Actions for compute**: Rewrite as plain serverless functions (translation, moderation, content pipelines) — they never needed Lit
- **Lit Actions for encryption**: content-register-v1/v2, content-decrypt-v1, content-access-v1 — all replaced by client-side ECIES

### 2.2 ERC-4337 / AA Infrastructure
- **`services/alto`** — bundler service (delete entirely)
- **`HeavenAccountFactory`** contract — no longer needed
- **`scrobble/aa/`** module in GPUI — UserOp builder, gateway submission
- **`HEAVEN_AA_GATEWAY_URL`**, `HEAVEN_AA_RPC_URL` env vars
- **`onlyAccountOf` guards** in ScrobbleV4 — replace with direct `msg.sender` auth

### 2.3 Lit Network Dependencies (All of It)
- `lit-rust-sdk` dependency in GPUI
- `@lit-protocol/lit-node-client` in web/lit-actions
- `@lit-protocol/lit-client`, `@lit-protocol/auth`, `@lit-protocol/networks` in lit-actions
- `HEAVEN_LIT_RPC_URL`, `HEAVEN_LIT_NETWORK` env vars
- Naga network session key management
- All Lit Action CIDs and encrypted key material
- Content encryption/decryption via Lit threshold crypto (replaced by client-side ECIES)

## 3) What We Keep (Reframed)

### 3.1 Backend Jobs (still need server-side execution)
These move from "Lit Action + PKP signing" to "serverless function + fee-sponsored TX":

- **Song publish pipeline**: file processing, metadata, IPFS upload → server signs with sponsor key
- **Lyrics translation**: LLM call → server submits `translateLyricsFor()`
- **Content moderation**: safety check → server submits result
- **Content encryption/decryption**: Client-side ECIES with Tempo P256 keys (see §6)

### 3.2 Contract Auth Model Changes Needed

**Currently `onlySponsor`** — these need V2 contracts OR we keep a relay service (now Tempo fee-sponsored instead of AA):

- `EngagementV2.likeFor/unlikeFor/commentFor/translateFor/flagFor`
- `FollowV1.followFor/unfollowFor/followBatchFor`
- `PostsV1.postFor`
- `PlaylistV1.*For` methods
- `ContentRegistry.*For` methods
- `LyricsEngagementV1.translateLyricsFor`

**Decision**: For user-initiated actions (like, comment, follow, post), ship V2 contracts with direct `msg.sender` auth so users sign with their Tempo passkey account. For server-initiated actions (translate, moderate), keep relay with Tempo fee sponsorship.

### 3.3 Scrobble
**Currently**: `ScrobbleV4.onlyAccountOf(user)` requires AA-derived `msg.sender`.

**Target**: `ScrobbleV5` with direct `msg.sender == user` auth. User signs scrobble batches with Tempo session key (no biometric per scrobble). Fee sponsored by our service.

## 4) Tempo Account Flow (Target UX)

### 4.1 Onboarding (Web + GPUI SolidJS)
1. User clicks "Sign up" → WebAuthn passkey creation (biometric)
2. Address derived from P256 public key: `keccak256(x || y)[12:]`
3. No mint TX, no cost, instant
4. Public key registered with Tempo key manager (remote for cross-device, or localStorage for dev)

### 4.2 Signing Transactions
- **Interactive** (likes, posts, profile edits): Passkey biometric prompt per TX
- **Background** (scrobbles): One biometric to authorize session key → silent signing for 7 days
- **Sponsored**: All user TXs use `feePayer: true` → our sponsor service pays fees

### 4.3 Session Keys for Scrobble
1. Generate ephemeral secp256k1 key pair
2. User authorizes via passkey (one biometric)
3. Key registered on-chain via Tempo keychain authorization
4. Session key signs scrobble batches silently for 7 days
5. No bundler, no paymaster, no smart contract wallet

## 5) Migration Plan

### Phase 1: Contract Upgrades (MegaETH)
- [ ] Deploy `ScrobbleV5` — replace `onlyAccountOf` with direct `msg.sender` auth
- [ ] Deploy V2 engagement/social contracts — replace `onlySponsor` with `msg.sender` for user actions
- [ ] Keep operator/sponsor guards only for server-initiated writes
- [ ] Update subgraph indexers for new contract addresses

### Phase 2: Tempo Integration — Web (`apps/web`)
- [ ] Add `wagmi` + `viem/tempo` + `wagmi/tempo` dependencies
- [ ] Configure `webAuthn` connector with `KeyManager.http('https://keys.tempo.xyz')`
- [ ] Configure `withFeePayer` transport pointing to our sponsor service
- [ ] Replace Lit auth flow with Tempo passkey sign-up/sign-in
- [ ] Replace all Lit Action signing calls with direct contract writes (fee-sponsored)
- [ ] Remove `@lit-protocol/*` dependencies

### Phase 3: Tempo Integration — GPUI Desktop (SolidJS)
- [ ] Port `TempoPasskeyManager` from Android POC to web/SolidJS (WebAuthn is browser-native)
- [ ] Port `SessionKeyManager` for silent scrobble signing
- [ ] Port `TempoTransaction` builder (type 0x76, RLP encoding)
- [ ] Replace `lit_wallet.rs` calls in Rust → call SolidJS Tempo layer via bridge
- [ ] Remove `lit-rust-sdk` dependency, `lit_action_registry.rs`
- [ ] Remove `scrobble/aa/` module
- [ ] Wire scrobble hook to use session key signing → Tempo TX → fee-sponsored submit

### Phase 4: Tempo Integration — Android (`apps/android`)
- [ ] `apps/tempo-poc` already has full implementation — promote to production
- [ ] Replace `ProfileContractApi.kt` PKP signer with Tempo passkey signer
- [ ] Wire `SongPublishService.kt` to use Tempo fee-sponsored TXs
- [ ] Remove Lit SDK dependencies

### Phase 5: Cleanup
- [ ] Delete `services/alto` (bundler)
- [ ] Delete `apps/web/src/lib/lit/` (entire Lit client layer)
- [ ] Delete `lit_wallet.rs`, `lit_action_registry.rs` from GPUI
- [ ] Remove `HEAVEN_LIT_*`, `HEAVEN_AA_*` env vars
- [ ] Archive `lit-actions/` directory entirely — extract compute logic (lyrics alignment, translation, moderation) into standalone serverless functions
- [ ] Delete `apps/web/src/lib/content-crypto.ts` (Lit-based AES key encryption) — replace with ECIES module
- [ ] Delete `apps/desktop/src/load_storage/content/register_encrypt.rs` Lit encryption path — replace with ECIES
- [ ] Remove `@lit-protocol/*` and `lit-rust-sdk` from all package.json / Cargo.toml
- [ ] Update `CLAUDE.md`, `MEMORY.md`, all READMEs

### Phase 6: Fee Sponsor Service
- [ ] Deploy Tempo fee payer service (minimal: `Handler.feePayer` from Tempo SDK)
- [ ] Fund sponsor account on Tempo Moderato (testnet) then mainnet
- [ ] Implement rate limits (per-user daily caps)
- [ ] Monitor sponsorship costs

## 6) Decided Questions

### Content Encryption — DECIDED: Client-Side ECIES (No Lit)
Drop Lit entirely. Content encryption uses **ECIES with Tempo P256 passkey keys**:

1. **Upload**: Generate random AES-256-GCM key → encrypt file → ECIES-encrypt AES key to uploader's P256 public key → upload encrypted blob to Load/Arweave
2. **Share**: Client decrypts AES key with passkey → re-encrypts to recipient's P256 public key → stores recipient's encrypted key copy (on-chain event or IPFS)
3. **Download**: Fetch encrypted key copy → decrypt with passkey → decrypt file

- Free (pure client-side crypto, no network fees)
- No Lit dependencies anywhere in the stack
- Key recovery handled by passkey cloud sync (iCloud Keychain, Google Password Manager)
- Every Tempo account already has a P256 public key — no extra key infra needed

### Chain — DECIDED: Tempo
All contracts redeploy on Tempo. MegaETH contracts are legacy. No bridge needed — clean cutover.

### XMTP Signing
XMTP identity registration currently uses PKP signing. Need to wire Tempo passkey signing for XMTP identity — verify XMTP SDK supports P256/WebAuthn signatures or if we need an adapter.

### Lit Protocol — DECIDED: Full Removal
Lit is removed entirely. No signing, no encryption, no threshold decryption.
- `lit-actions/` directory becomes archive (song publish pipeline moves to plain serverless functions)
- `@lit-protocol/*` dependencies removed from all surfaces
- `lit-rust-sdk` dependency removed from GPUI
- Compute jobs (lyrics alignment, translation, moderation) become standalone serverless functions with fee-sponsored TX submission
