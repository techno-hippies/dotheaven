# ERC-4337 Account Abstraction Migration Plan

## Problem

All gasless transactions flow through a single **sponsor PKP** (`0x089fc...`). This creates a global nonce bottleneck: any two concurrent Lit Actions (scrobble + playlist, two users scrobbling, etc.) race for the same nonce and one fails with `NONCE_EXPIRED`. This is probabilistic today (single user, sequential actions) but becomes guaranteed as users scale.

12 Lit Actions broadcast through this wallet. Zero have retry logic. The problem is architectural — no amount of retries or PKP sharding eliminates it at scale.

## Solution

Migrate to ERC-4337 Account Abstraction. Each user gets their own smart contract account (with its own nonce sequence). A Paymaster contract sponsors gas. A self-hosted bundler handles submission.

**EntryPoint v0.7** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) and **v0.6** (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`) are both already deployed on MegaETH. We standardize on **v0.7**.

## Key Design Decisions

### Identity: PKP EOA stays as the user's identity

The user's PKP EOA address remains their on-chain identity everywhere. The SimpleAccount is an **execution wrapper only** — it's `msg.sender` to contracts, but contracts store state keyed by the explicit `user` parameter (PKP EOA), not `msg.sender`.

This means:
- No frontend address migration
- Subgraphs keep working (same `user` addresses in events)
- XMTP, profiles, names — all stay on the PKP EOA
- The smart account is invisible to the user

### Permission Model: Factory-deterministic binding

**Cannot just remove `onlySponsor`.** Security audit found every function is exploitable:
- PlaylistV1 `setTracks()`/`updateMeta()`/`deletePlaylist()` have **zero ownership checks** — anyone could modify/delete any playlist
- EngagementV2 `commentFor()` — anyone could post comments attributed to any user (immutable impersonation)
- VerificationMirror `mirror()` — anyone could mark anyone as verified + desync their nonce (DoS + identity fraud)

**Solution:** Replace `onlySponsor` with **factory-deterministic binding**. Contracts verify that `msg.sender` is the deterministic CREATE2 address that the factory _would_ deploy for the given `user`:

```solidity
IHeavenAccountFactory public immutable FACTORY;
uint256 constant SALT = 0;

/// @dev Verifies msg.sender is the SimpleAccount that FACTORY would deploy for `user`.
///      Not spoofable — CREATE2 addresses are deterministic from (factory, salt, user).
///      An attacker cannot deploy a contract at the same address because only the
///      factory's CREATE2 can produce it.
modifier onlyAccountOf(address user) {
    require(msg.sender == FACTORY.getAddress(user, SALT), "not user's account");
    _;
}
```

**Why NOT `IAccount(msg.sender).owner() == user`?** That pattern is **spoofable** — any contract can implement `owner()` returning any address. An attacker could deploy their own contract with `owner()` returning the victim's address, then call the app contract directly (paying their own gas, bypassing the paymaster). The factory-binding approach is not spoofable because only the factory's CREATE2 can produce an account at a given deterministic address.

This gives us:
- **No extra signatures** — the UserOp signature already proves the user authorized the call
- **Deterministic and cheap** — `FACTORY.getAddress()` computes CREATE2 address from `(factory, salt, initCodeHash(owner))`. The exact gas depends on the factory implementation, but the derivation is deterministic and does not require the account to be deployed.
- **Not spoofable** — CREATE2 address uniqueness is a protocol guarantee
- **No whitelist management** — works for any user without pre-registration
- **Factory address is security-critical** — if the factory is compromised, the entire permission model breaks. Factory must be immutable (no upgradability, no admin functions beyond deployment). SALT is a constant (`0`) — documented and never varied.
- **Environment-specific** — factory address is embedded as `immutable` in every app contract. If the factory address differs per environment (testnet vs mainnet), all app contracts must be redeployed.

### Paymaster policy must bind sender ↔ user

The paymaster signer service is the **only entrypoint** to the bundler (see Gateway Pattern below). It must decode `SimpleAccount.execute(target, value, data)`, extract the inner call's `user` argument, and verify **`sender == FACTORY.getAddress(user, SALT)`** (same deterministic check the contracts use — direction matters: we derive the expected account from the claimed user, then check the actual sender matches). This prevents sponsoring griefing calls where an attacker tries to act on behalf of another user.

**Paymaster must also enforce strict calldata decoding:**
- Decode the outer `execute(target, value, data)` — reject any other function selector on the SimpleAccount (see `executeBatch` decision in Phase 3)
- Verify outer `value == 0` (no ETH transfers through sponsored accounts)
- Verify `target` is in the contract allowlist
- Decode the inner `data` to extract the function selector + `user` parameter
- Verify the function selector is in the per-contract allowlist
- Verify **`sender == FACTORY.getAddress(user, SALT)`** (derive expected account from claimed user)
- Verify inner call doesn't encode ETH-moving paths (if any app function is `payable`)

### Gateway Pattern (Two-Step Handshake)

The Lit Action does NOT submit UserOps directly to the bundler. The paymaster signer Worker is the **sole gateway** to the bundler. The flow requires **two round-trips** because the ERC-4337 UserOp hash (which the user signs) covers `paymasterAndData`:

```
Step 1:  Lit Action  →  POST /quotePaymaster (unsigned UserOp)
                     ←  paymasterAndData

         Lit Action attaches paymasterAndData, PKP signs userOpHash

Step 2:  Lit Action  →  POST /sendUserOp (fully signed UserOp)
         Worker      →  Bundler → EntryPoint
```

**Why two steps?** In ERC-4337, the user signature covers `paymasterAndData` (it's part of the `userOpHash`). If the Worker added `paymasterAndData` after signing, the signature would be invalid. The Lit Action must sign _after_ receiving `paymasterAndData`.

This means:
- Bundler RPC is never exposed — accessible only from the co-located gateway (see Phase 2 networking options)
- All policy enforcement happens at a single chokepoint (step 1)
- Step 2 does cheap re-validation (verify the UserOp wasn't tampered between steps)
- No way to bypass rate limits or calldata allowlists
- Lit Actions only need the gateway URL, not the bundler URL

### Event Invariant

**All events must emit `user` (PKP EOA), never `msg.sender` (smart account).** This is already true for existing contracts (they pass explicit `user` parameters to events). The invariant must be maintained in all contract updates. Subgraphs, frontends, and off-chain indexers never see smart account addresses.

---

## Architecture Overview

```
CURRENT (broken at scale):
  User → Lit Action → Sponsor PKP signs tx → MegaETH
                       ↑ global nonce bottleneck

NEW (4337 — two-step gateway handshake):
  User → Lit Action → builds UNSIGNED UserOp (no sig, no paymasterAndData)
                                            ↓
                         ┌──────────────────────────────────────────────┐
                         │  Step 1: POST /quotePaymaster               │
                         │  Gateway service ← sole entrypoint           │
                         │  1. decodes execute(target, value, data)     │
                         │  2. extracts inner user param                │
                         │  3. verifies sender == FACTORY.getAddress(   │
                         │     user, SALT)                              │
                         │  4. checks target/selector allowlist         │
                         │  5. verifies value == 0 (outer + inner)     │
                         │  6. rate-limits per user                     │
                         │  7. signs paymaster approval                 │
                         │  8. returns paymasterAndData                 │
                         └──────────────────────────────────────────────┘
                                            ↓
                         Lit Action attaches paymasterAndData,
                         computes userOpHash (covers paymasterAndData!),
                         PKP signs → sets signature field
                                            ↓
                         ┌──────────────────────────────────────────────┐
                         │  Step 2: POST /sendUserOp                   │
                         │  Worker re-validates (cheap checks)         │
                         │  forwards fully-signed UserOp to bundler    │
                         └──────────────────────────────────────────────┘
                                            ↓
                                       Bundler (self-hosted Alto)  ← private network only
                                            ↓
                                       EntryPoint.handleOps()
                                            ↓
                                    ┌───────┴───────┐
                                    │               │
                              Paymaster          User's
                              sponsors gas    SimpleAccount
                                              executes call
                                                    ↓
                                            App Contract
                                            verifies msg.sender == FACTORY.getAddress(user, SALT)
                                            stores state keyed by user (PKP EOA)
                                            emits events with user (PKP EOA), never msg.sender
```

Each user's SimpleAccount has its own nonce. No cross-user contention. The bundler's EOA submits bundles — but batches many UserOps per tx, and can scale with multiple executor keys.

---

## Phase 1: Smart Contracts

### 1A. Deploy SimpleAccountFactory

Use the reference `SimpleAccount` from eth-infinitism/account-abstraction v0.7. The factory creates per-user accounts via CREATE2 (deterministic addresses, counterfactual deployment on first use).

- User's PKP EOA address becomes the `owner` of their SimpleAccount
- `SimpleAccount._validateSignature()` recovers the signer from `userOp.signature` and checks it matches `owner`
- `FACTORY.getAddress(owner, salt)` returns the deterministic CREATE2 address — this is what app contracts use for authorization (NOT `owner()` which is spoofable)
- First UserOp includes `initCode` (factory address + `createAccount(owner, salt)`) — deploys the account on-chain
- The factory must be **immutable** — no admin functions, no upgradability, no `selfdestruct`. Its address is embedded as `immutable` in every app contract.
- **SALT is a constant** (`0`). Never varied per user. Document this and enforce it everywhere.
- **Account implementation must be fixed** — the factory deploys a single known implementation. No upgradeable proxy accounts (the implementation bytecode is part of the CREATE2 address derivation).
- **If factory address differs per environment** (testnet vs mainnet), all app contracts must be redeployed (since `FACTORY` is `immutable`).

**CREATE2 determinism inputs** (all are security-critical invariants):
The deterministic address `FACTORY.getAddress(owner, salt)` depends on:
- **Factory address** — the deployer contract
- **Salt** — `keccak256(abi.encodePacked(owner, salt))` in eth-infinitism's `SimpleAccountFactory`
- **Init code hash** — `keccak256(creationCode ++ constructorArgs)`, which includes:
  - The `SimpleAccount` implementation bytecode
  - The `EntryPoint` address passed to the constructor (hardcoded in factory)

If **any** of these change (new EntryPoint, modified implementation, different factory), all CREATE2 addresses change and the app contracts' `onlyAccountOf` checks break. The factory cannot have admin knobs that change the implementation or EntryPoint.

**New files:**
```
contracts/megaeth/src/aa/
├── HeavenAccountFactory.sol    # Thin wrapper around SimpleAccountFactory
│                                 targeting EntryPoint v0.7
│                                 MUST expose getAddress(owner, salt) view
│                                 IMMUTABLE — no admin, no upgrade, no selfdestruct
└── HeavenPaymaster.sol         # VerifyingPaymaster: off-chain signer
                                  approves UserOps, contract validates sig
```

**Deploy script:**
```
contracts/megaeth/script/DeployAA.s.sol
```

**Dependencies:**
- Install eth-infinitism/account-abstraction v0.7 into `lib/`
- Add remapping: `account-abstraction/=lib/account-abstraction/contracts/`

### 1B. Deploy HeavenPaymaster (VerifyingPaymaster)

Based on Coinbase's VerifyingPaymaster (MIT, targets v0.7):
- Constructor takes EntryPoint address + signer address
- Off-chain signer (our gateway) signs each UserOp approval
- On-chain: `_validatePaymasterUserOp()` verifies the signature
- Sponsor deposits ETH into EntryPoint via `paymaster.deposit()`

**Paymaster signature must bind to the exact op.** The signed hash includes:
- `userOpHash` (computed by EntryPoint — covers `sender`, `nonce`, `callData`, `paymasterAndData`, chainId, EntryPoint address)
- `validUntil` / `validAfter` (time window)
- Paymaster address (implicitly via `paymasterAndData` layout)

This guarantees `paymasterAndData` cannot be replayed onto a different UserOp or a different chain.

### 1C. Update App Contracts (Permission Model)

Replace `onlySponsor` with smart-account binding. These contracts are not upgradeable, so they must be redeployed. This is testnet — clean deploy is the right approach.

#### Per-Contract Changes

**ScrobbleV3** — Functions with `user` parameter:
| Function | Current | New |
|----------|---------|-----|
| `registerAndScrobbleBatch(user, ...)` | `onlySponsor` | `onlyAccountOf(user)` |
| `scrobbleBatch(user, ...)` | `onlySponsor` | `onlyAccountOf(user)` |

Functions without `user` parameter (global track operations):
| Function | Current | New | Rationale |
|----------|---------|-----|-----------|
| `registerTracksBatch(...)` | `onlySponsor` | Keep `onlySponsor` or new `onlyOperator` | Track registration is a global operation — no per-user binding possible. Keep gated to trusted callers. The combined `registerAndScrobbleBatch` handles the normal user flow. |
| `updateTrack(trackId, ...)` | `onlySponsor` | Keep `onlySponsor` or `onlyOperator` | Admin-only metadata correction |
| `setTrackCover(trackId, ...)` | `onlySponsor` | Keep `onlySponsor` or `onlyOperator` | Write-once cover art, should be trusted caller |
| `setTrackCoverBatch(...)` | `onlySponsor` | Keep `onlySponsor` or `onlyOperator` | Same |

For the global functions, the sponsor PKP can remain as the authorized `operator` — these are admin/maintenance operations. **Critical: user flows must not depend on global ops for every scrobble.** The combined `registerAndScrobbleBatch()` handles the normal path (register + scrobble in one user-signed tx). Global-only functions (`registerTracksBatch`, `updateTrack`, `setTrackCover*`) are for admin corrections and cover art uploads where the operator key is appropriate. If cover art uploads need to scale per-user, consider adding a user-gated `setTrackCover` variant later.

**Operator lane bottleneck warning:** Any `onlyOperator` function that ends up in the hot path per-scrobble recreates a serialization choke — even though it's no longer a nonce collision, a single operator key is still a throughput ceiling. Audit the scrobble Lit Action to ensure the user-signed `registerAndScrobbleBatch()` path is fully self-contained. Cover art upload (`setTrackCoverBatch`) is currently operator-gated and called per-scrobble; if this becomes a bottleneck, add a user-gated cover variant or move cover CIDs into the `registerAndScrobbleBatch` call itself.

**PlaylistV1** — Critical: `setTracks`, `updateMeta`, `deletePlaylist` currently have NO ownership check:
| Function | Current | New |
|----------|---------|-----|
| `consumeNonce(user, nonce)` | `onlySponsor` | `onlyAccountOf(user)` |
| `createPlaylistFor(owner, ...)` | `onlySponsor` | `onlyAccountOf(owner)` |
| `setTracks(playlistId, ...)` | `onlySponsor` (no owner check!) | `onlyPlaylistOwnerAccount(playlistId)` — new modifier that checks `msg.sender == FACTORY.getAddress(playlists[playlistId].owner, SALT)` |
| `updateMeta(playlistId, ...)` | `onlySponsor` (no owner check!) | `onlyPlaylistOwnerAccount(playlistId)` |
| `deletePlaylist(playlistId)` | `onlySponsor` (no owner check!) | `onlyPlaylistOwnerAccount(playlistId)` |

This also fixes a pre-existing security gap where only the sponsor gate prevented arbitrary playlist modification.

**PostsV1:**
| Function | Current | New |
|----------|---------|-----|
| `postFor(creator, ipId, ...)` | `onlySponsor` | `onlyAccountOf(creator)` |

**EngagementV2:**
| Function | Current | New |
|----------|---------|-----|
| `likeFor(liker, postId)` | `onlySponsor` | `onlyAccountOf(liker)` |
| `unlikeFor(unliker, postId)` | `onlySponsor` | `onlyAccountOf(unliker)` |
| `likeBatchFor(liker, postIds)` | `onlySponsor` | `onlyAccountOf(liker)` |
| `commentFor(author, postId, text)` | `onlySponsor` | `onlyAccountOf(author)` |
| `translateFor(translator, ...)` | `onlySponsor` | `onlyAccountOf(translator)` |
| `logRevealFor(viewer, ...)` | `onlySponsor` | `onlyAccountOf(viewer)` |
| `flagFor(flagger, ...)` | `onlySponsor` | `onlyAccountOf(flagger)` |
| `setRevealPriceFor(postId, price)` | `onlySponsor` | Derive creator internally: `address creator = postsContract.creatorOf(postId); require(msg.sender == FACTORY.getAddress(creator, SALT))`. No extra param needed — creator is already stored on PostsV1. |

**ContentRegistry:**
| Function | Current | New |
|----------|---------|-----|
| `registerContentFor(contentOwner, ...)` | `onlySponsor` | `onlyAccountOf(contentOwner)` |
| `grantAccessFor(contentOwner, ...)` | `onlySponsor` + `c.owner == contentOwner` | `onlyAccountOf(contentOwner)` (keeps existing owner check) |
| `grantAccessBatchFor(contentOwner, ...)` | `onlySponsor` + `c.owner == contentOwner` | `onlyAccountOf(contentOwner)` |
| `revokeAccessFor(contentOwner, ...)` | `onlySponsor` + `c.owner == contentOwner` | `onlyAccountOf(contentOwner)` |
| `revokeAccessBatchFor(contentOwner, ...)` | `onlySponsor` + `c.owner == contentOwner` | `onlyAccountOf(contentOwner)` |
| `deactivateFor(contentOwner, ...)` | `onlySponsor` + `c.owner == contentOwner` | `onlyAccountOf(contentOwner)` |

**VerificationMirror:**
| Function | Current | New |
|----------|---------|-----|
| `mirror(user, ...)` | `onlySponsor` | Special case — keep `onlySponsor` or `onlyOperator`. This is a bridge from Celo, called by the self-verify Lit Action. The user doesn't directly trigger this — it's a system action that mirrors off-chain verification. An operator role is appropriate here. |

**RecordsV1** — Already has on-chain signature verification:
| Function | Current | New |
|----------|---------|-----|
| `setTextFor(node, key, value, sig)` | `msg.sender == sponsor \|\| msg.sender == owner()` + sig verification | **Remove sender checks entirely.** On-chain EIP-191 signature verification already authorizes the caller — no need to reintroduce factory coupling. Anyone can relay a validly-signed record update. |
| `setRecordsFor(node, keys, values, sig)` | Same | Same |

**ProfileV1** — Already permissionless (signature-verified). No changes needed.

**RegistryV1** — `registerFor()` is public payable. No changes needed.

#### Shared Interface

Add a minimal factory interface that all updated contracts import:

```solidity
// contracts/megaeth/src/aa/IHeavenAccountFactory.sol
interface IHeavenAccountFactory {
    /// @dev Returns the deterministic CREATE2 address for the given owner + salt.
    ///      Works whether or not the account has been deployed yet.
    function getAddress(address owner, uint256 salt) external view returns (address);
}
```

Each app contract stores the factory as an immutable:

```solidity
IHeavenAccountFactory public immutable FACTORY;
uint256 constant SALT = 0;

constructor(address factory_, ...) {
    FACTORY = IHeavenAccountFactory(factory_);
    ...
}

modifier onlyAccountOf(address user) {
    require(msg.sender == FACTORY.getAddress(user, SALT), "not user's account");
    _;
}
```

**Optional safety edge:** Add `require(msg.sender.code.length != 0)` to fail fast on plain EOA calls. Not security-critical (an EOA can never match a CREATE2 address that has code), but produces a cleaner revert message.

#### Backward Compatibility

Keep `onlySponsor` (or rename to `onlyOperator`) for admin/system functions. Add a new `operator` role alongside the account-binding modifier. This lets system Lit Actions (verification mirror, track metadata fixes) still use a trusted key while user-facing functions use factory-bound smart-account authorization.

---

## Phase 2: Self-Hosted Bundler

### 2A. Alto (Pimlico) — TypeScript Bundler

**Why Alto over Rundler:**
- TypeScript aligns with the existing stack (Bun, Cloudflare Workers)
- Better documented for self-hosting
- Explicitly supports `--safe-mode false` for chains without `debug_traceCall`
- MegaETH does NOT support `debug_traceCall` — confirmed via RPC test

**Setup:**
```
services/bundler/
├── docker-compose.yml     # Alto
├── .env.example           # Bundler signer key, RPC URL, EntryPoint
└── README.md
```

**Configuration:**
```bash
alto \
  --entrypoint 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  --rpc-url https://carrot.megaeth.com/rpc \
  --safe-mode false \
  --executor-private-keys $BUNDLER_SIGNER_KEY \
  --port 4337
```

**Security:** The bundler RPC must NOT be public. **Only the gateway service should have access.** No Lit Actions, no external clients.

**Networking options** (a Cloudflare Worker cannot reach `127.0.0.1` on your Docker host):
- **Option A (preferred):** Run the gateway + signer as a **container in the same Docker Compose / VPC** as Alto. Both listen on an internal Docker network; nothing is published externally. The gateway container exposes an HTTPS endpoint for Lit Actions (via Cloudflare Tunnel or a public reverse proxy with mTLS).
- **Option B:** Run Alto on a private host and expose it through a **Cloudflare Tunnel** (or mTLS reverse proxy). The Cloudflare Worker calls the tunnel hostname. Alto itself binds to `127.0.0.1`.
- **Option C (dev only):** Run both locally. Alto on `127.0.0.1:4337`, gateway on `127.0.0.1:3000`. Lit Actions call localhost gateway directly.

In all cases, the bundler port is never reachable from the public internet.

### 2B. Bundler Signer Wallet

The bundler needs its own funded EOA to submit `handleOps()` bundles. Many UserOps batch per bundle, so contention is dramatically lower than the current model. Alto supports multiple executor keys if throughput demands it later.

Fund with ~1 ETH on MegaETH testnet (millions of bundles at current gas prices).

---

## Phase 3: Paymaster Signer Service

### 3A. Gateway + Paymaster Signer

The **sole entrypoint** to the bundler. Two endpoints implement the handshake. Lit Actions never talk to the bundler directly.

**Runtime options** (depends on networking choice in Phase 2):
- **Option A:** A Node/Bun container co-located with Alto in the same Docker Compose. Exposed to the internet via Cloudflare Tunnel or mTLS reverse proxy. Rate limiting via Redis/SQLite (co-located).
- **Option B:** A Cloudflare Worker that calls Alto through a Cloudflare Tunnel. Rate limiting via Durable Objects / KV.

```
services/paymaster-signer/
├── src/index.ts           # Gateway entry — signer + policy + forwarder
├── Dockerfile             # (Option A) container co-located with bundler
├── wrangler.toml          # (Option B) Cloudflare Worker
└── .env.example           # BUNDLER_URL (private), PAYMASTER_SIGNER_KEY, FACTORY_ADDRESS
```

**Step 1: `POST /quotePaymaster` — auth + policy check + paymaster signature**

Lit Action builds an **unsigned** UserOp (no `signature`, no `paymasterAndData`) and sends it.

**Gateway Authentication** (required — otherwise `/quotePaymaster` becomes a public sponsorship oracle):

The request must include proof it's coming from a legitimate Lit Action invocation, not an arbitrary caller. Options:
- **PKP-signed challenge**: Lit Action signs a short-lived challenge `keccak256(abi.encode(sender, nonce, callDataHash, expiry))` with the user's PKP. Gateway verifies the signature recovers to the `user` derived from `sender`. TTL: ~60 seconds.
- **Lit session signature / attestation**: If Lit Protocol exposes an attestation of the executing action's IPFS CID, the gateway can verify the request came from a known action CID.

Rate limiting should be primarily **per-user (PKP EOA)** + global quotas. IP-based rate limiting is unreliable here since requests originate from Lit nodes, not end-user IPs.

**Policy validation:**
- **Validate `initCode`**: If non-empty (first-time account deployment), require it is exactly `FACTORY_ADDRESS ++ abi.encodeCall(createAccount, (user, SALT))` with the expected implementation. Reject any other factory address, constructor args, or implementation. This prevents sponsoring unexpected deployment side-effects.
- **Decode outer call**: `callData` must be `SimpleAccount.execute(target, value, data)`. Reject any other selector (see `executeBatch` decision below).
- **Verify outer `value == 0`**: No ETH transfers through sponsored accounts.
- **Target allowlist**: `target` must be a known app contract address.
- **Decode inner call**: Extract function selector + all parameters from `data`.
- **Selector allowlist**: Per-contract allowlist of permitted function selectors.
- **Verify inner call has no payable ETH**: If any app contract function is `payable`, reject unless value is 0.
- **Sender ↔ user binding**: Extract the `user` parameter from the inner calldata. Verify `sender == FACTORY.getAddress(user, SALT)`. Same deterministic check the contracts use.
- **Rate limit**: Per-user rate limit not exceeded (Durable Objects / KV).
- **Gas sanity**: Gas limits within expected bounds.

If all checks pass:
1. Worker signs the UserOp fields with the paymaster's off-chain key (producing `validUntil`, `validAfter`, `signature`).
2. Returns `paymasterAndData` to the Lit Action.

**Between steps (in Lit Action):**
1. Lit Action attaches `paymasterAndData` to the UserOp.
2. Computes `userOpHash` (which now covers `paymasterAndData`).
3. PKP signs → sets `userOp.signature`.

**Step 2: `POST /sendUserOp` — re-validate + forward to bundler**

Lit Action sends the **fully signed** UserOp (with both `paymasterAndData` and `signature`).

Worker re-validates (cheap, deterministic checks to detect tampering between step 1 and step 2):

1. **Verify `paymasterAndData` is ours**: Either:
   - Verify the paymaster signature off-chain (recover signer, check it's the gateway's key), OR
   - Store a short-lived quote keyed by `(sender, nonce, callDataHash, validUntil)` in step 1 and match it exactly in step 2.
2. **Re-check immutable fields**: `callData`, `sender`, `nonce` must match what was quoted.
3. **Re-derive sender↔user binding**: Decode inner call, extract `user`, verify `sender == FACTORY.getAddress(user, SALT)`. (Redundant if #2 passes, but defense-in-depth.)
4. **Re-check target + selector allowlists**: Same checks as step 1. (Catches any race with allowlist updates.)
5. **Forward** to bundler via `eth_sendUserOperation` JSON-RPC.
6. **Return** `userOpHash` (or bundler error) to the Lit Action.

**`executeBatch` decision:**
The eth-infinitism `SimpleAccount` supports both `execute()` and `executeBatch()`. For simplicity:
- **Allow only `execute()`** initially. Each UserOp wraps one app contract call.
- If batch support is needed later (e.g. multi-step playlist ops in one UserOp), allow `executeBatch()` but require **every inner call** passes the full allowlist + sender↔user binding + `value==0` checks.

**Why a Worker gateway and not inline in the Lit Action?**
- **Security**: Bundler RPC is never exposed to Lit nodes (or anyone else). All access goes through the Worker.
- **Policy enforcement at a single chokepoint**: No way to bypass rate limits, calldata allowlists, or sender↔user binding
- Rate limiting requires persistent state (Durable Objects / KV)
- Policy changes don't require redeploying Lit Actions (no CID rotation)
- Separation of concerns: Lit Actions handle user auth + tx construction, Worker handles sponsorship policy + bundler submission

---

## Phase 4: Lit Action Migration

### 4A. New Shared Pattern: UserOp Builder

Currently every Lit Action copy-pastes the same `signAndBroadcast()` pattern. Replace with a shared UserOp construction pattern.

```javascript
// OLD: sponsor PKP signs raw tx
const nonce = await provider.getTransactionCount(SPONSOR_PKP, "pending");
const tx = { nonce, to: CONTRACT, data: calldata, ... };
const sig = await Lit.Actions.signAndCombineEcdsa({
  publicKey: SPONSOR_PKP_PUBLIC_KEY,  // shared bottleneck
  toSign: txHash,
});
await provider.sendTransaction(serialize(tx, sig));

// NEW: two-step gateway handshake
const smartAccount = computeAddress(FACTORY, userPkpAddress, 0); // deterministic
const nonce = await entryPoint.getNonce(smartAccount, 0);         // per-user!
const callData = encodeExecute(CONTRACT, 0, innerCalldata);       // SimpleAccount.execute()
const userOp = buildUserOp(smartAccount, nonce, callData, ...);
// userOp has NO signature and NO paymasterAndData at this point

// Step 1: Get paymaster approval from Worker
const quoteResp = await fetch(`${GATEWAY_URL}/quotePaymaster`, {
  method: 'POST',
  body: JSON.stringify(userOp),
}).then(r => r.json());
// Worker validates policy (target/selector allowlist, sender↔user binding, rate limit)
// Returns paymasterAndData (paymaster address + validUntil + validAfter + sig)
userOp.paymasterAndData = quoteResp.paymasterAndData;

// Sign with user's PKP — AFTER paymasterAndData is attached
// (userOpHash covers paymasterAndData per ERC-4337 spec)
const userOpHash = computeUserOpHash(userOp, ENTRYPOINT, CHAIN_ID);
const sig = await Lit.Actions.signAndCombineEcdsa({
  publicKey: userPkpPublicKey,   // per-user, no contention
  toSign: Array.from(ethers.utils.arrayify(userOpHash)),
});
userOp.signature = formatSig(sig);

// Step 2: Submit fully signed UserOp to Worker (forwards to bundler)
const result = await fetch(`${GATEWAY_URL}/sendUserOp`, {
  method: 'POST',
  body: JSON.stringify(userOp),
}).then(r => r.json());
// Worker re-validates, forwards to bundler, returns userOpHash or error
```

**Key invariant:** The user PKP signs **after** `paymasterAndData` is attached, because the ERC-4337 `userOpHash` covers `paymasterAndData`. Signing before would produce an invalid signature.

### 4B. Migration Order (by risk/complexity)

Migrate one action at a time, test, then move to the next.

**Batch 1 — Single-tx, simple** (prove the pattern):
1. `heaven-claim-name-v1.js` — 1 tx, simple `registerFor()` call
2. `heaven-set-profile-v1.js` — 1 tx, already permissionless contract (ProfileV1)
3. `heaven-set-records-v1.js` — 1 tx, already has on-chain sig verification

**Batch 2 — Single-tx, more complex**:
4. `self-verify-mirror-v1.js` — 1 tx, Celo→MegaETH bridge (uses `onlyOperator`, not account binding)
5. `photo-reveal-v1.js` — 1 tx, also calls external heaven-images service

**Batch 3 — Multi-tx on MegaETH** (need to handle multiple UserOps per action):
6. `scrobble-submit-v3.js` → `scrobble-submit-v4.js` — 1-2 UserOps (register+scrobble, then cover)
7. `playlist-v1.js` → `playlist-v2.js` — 2-3 UserOps (register tracks, consume nonce + playlist op, cover)

**Batch 4 — Dual-chain** (Story Protocol + MegaETH):
8. `post-create-v1.js` — Story tx stays sponsor-signed (different chain), MegaETH tx migrates to 4337
9. `post-register-v1.js` — same pattern
10. `post-text-v1.js` — same pattern
11. `story-register-sponsor-v1.js` — Story-only, stays sponsor-signed initially

**No migration needed** (upload-only, no blockchain tx):
- `avatar-upload-v1.js`, `song-publish-v1.js`, `lyrics-translate-v1.js`

### 4C. Multi-TX Actions

Actions that currently broadcast multiple txs become multiple UserOps. Keep sequential nonces (nonce key 0) unless operations are provably independent. Parallel nonce keys add complexity and bundler edge cases — use only when needed.

For `scrobble-submit-v4.js`:
- UserOp 1: `registerAndScrobbleBatch()` — nonce key 0, sequential
- UserOp 2: `setTrackCoverBatch()` — can use nonce key 1 (independent operation) OR wait for UserOp 1 receipt and use key 0 nonce+1

Start with sequential, optimize to parallel later if latency matters.

### 4D. Story Protocol Actions

Story Protocol is on chain 1315, separate from MegaETH. Sponsor PKP pattern stays for Story txs initially — low volume, separate nonce sequence, no contention with MegaETH operations.

---

## Phase 5: Frontend Changes

### 5A. Minimal — Smart Account is Invisible

Since the PKP EOA remains the user's identity, frontend changes are minimal:
- Compute SimpleAccount address on auth (deterministic from factory + PKP address)
- Store it for internal use (Lit Actions need it for UserOp construction)
- **Do not display it to users** — they see their PKP EOA address as before
- No subgraph changes (events still use PKP EOA in `user` params)
- No XMTP changes
- No profile/name changes

### 5B. AuthContext Addition

```typescript
// In AuthContext.tsx, after PKP auth:
const smartAccountAddress = computeSmartAccountAddress(FACTORY, pkpAddress, 0);
// Store alongside pkpAddress for Lit Action params
```

The Lit Actions receive `smartAccountAddress` as a param so they can build UserOps with the correct `sender`.

---

## Phase 6: Testing & Rollout

### 6A. Proof of Concept

1. Deploy HeavenAccountFactory + HeavenPaymaster on MegaETH testnet
2. Fund paymaster (deposit 1 ETH into EntryPoint)
3. Run Alto bundler locally with `--safe-mode false`
4. Deploy updated ScrobbleV3 (with `onlyAccountOf` modifier)
5. Write a test script that:
   - Creates a SimpleAccount for a test PKP (via `initCode` on first UserOp)
   - Builds an unsigned UserOp calling `ScrobbleV3.registerAndScrobbleBatch(user=pkpEOA, ...)`
   - Step 1: `POST /quotePaymaster` → gets `paymasterAndData`
   - Attaches `paymasterAndData`, computes `userOpHash`, signs with test PKP
   - Step 2: `POST /sendUserOp` → Worker forwards to bundler
6. Verify: tx executes, scrobble event emitted with correct `user` (PKP EOA), contract accepted the call because `msg.sender == FACTORY.getAddress(user, SALT)`

**POC Sanity Checklist:**
- [ ] First op with `initCode` succeeds (account counterfactual deployment)
- [ ] `initCode` with wrong factory address → gateway rejects in `/quotePaymaster`
- [ ] `initCode` with wrong salt or constructor args → gateway rejects
- [ ] Gateway `/quotePaymaster` requires valid auth (PKP-signed challenge or Lit attestation)
- [ ] Unauthenticated `/quotePaymaster` request → gateway rejects
- [ ] Gateway `/quotePaymaster` returns `paymasterAndData` for valid unsigned UserOp
- [ ] PKP signs **after** `paymasterAndData` attached; EntryPoint validation passes
- [ ] `paymasterAndData` replayed onto a different UserOp → EntryPoint rejects (sig mismatch)
- [ ] Direct contract call from an attacker EOA fails (`msg.sender != FACTORY.getAddress(user, SALT)`)
- [ ] Attacker deploying spoof contract with `owner()` returning victim → still fails (factory-binding, not `owner()`)
- [ ] UserOp with tampered `callData` between step 1 and step 2 → gateway rejects in `/sendUserOp`
- [ ] `executeBatch` selector → gateway rejects (until explicitly allowed)
- [ ] `execute` with `value > 0` → gateway rejects
- [ ] Rate limit: rapid-fire UserOps from same user → gateway rejects after threshold

### 6B. Load Test

Simulate 50 concurrent scrobbles from different test PKPs. Verify:
- Zero `NONCE_EXPIRED` errors (each user has their own nonce)
- All UserOps processed
- Paymaster balance decreases proportionally
- Bundler batches efficiently
- Contract correctly validates each caller via factory-deterministic address check

### 6C. Gradual Rollout

1. Deploy AA contracts (factory + paymaster)
2. Redeploy app contracts with `onlyAccountOf` permission model
3. Update subgraph configs for new contract addresses
4. Migrate Lit Actions batch by batch (4B)
5. Update frontend AuthContext to compute smart account address
6. Monitor paymaster balance, bundler health, UserOp success rate

---

## Infrastructure Summary

### New Contracts (MegaETH)
| Contract | Based On | Purpose |
|----------|----------|---------|
| IHeavenAccountFactory | — | Minimal interface: `getAddress(owner, salt) → address` |
| HeavenAccountFactory | eth-infinitism SimpleAccountFactory v0.7 | CREATE2 user account deployment (immutable, no admin) |
| HeavenPaymaster | Coinbase VerifyingPaymaster | Gas sponsorship with policy enforcement |

### Redeployed Contracts (with `onlyAccountOf` permission model)
| Contract | Change |
|----------|--------|
| ScrobbleV3 | `onlySponsor` → `onlyAccountOf(user)` on user-facing functions; keep `onlyOperator` on global track functions |
| PlaylistV1 | `onlySponsor` → `onlyAccountOf(owner)` + `onlyPlaylistOwnerAccount(playlistId)` for mutation ops. Fixes pre-existing ownership gap. |
| PostsV1 | `onlySponsor` → `onlyAccountOf(creator)` |
| EngagementV2 | `onlySponsor` → `onlyAccountOf(user)` per function |
| ContentRegistry | `onlySponsor` → `onlyAccountOf(contentOwner)` |
| VerificationMirror | Keep `onlyOperator` (system bridge, not user-triggered) |
| RecordsV1 | Remove sender checks entirely; on-chain EIP-191 sig verification is sufficient |

### New Services
| Service | Runtime | Purpose |
|---------|---------|---------|
| Alto bundler | Docker (private network, never public) | Receives UserOps from gateway only, bundles, submits to EntryPoint |
| Paymaster signer + gateway | Docker container (co-located with bundler) or CF Worker (via Tunnel) | Sole entrypoint. Auth + policy + calldata decoding + sender↔user binding + paymaster signing + bundler forwarding |

### Updated Lit Actions (10 MegaETH-broadcasting actions)
Switch from sponsor PKP tx signing to UserOp construction + two-step gateway handshake (Worker submission, not direct bundler access).

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| MegaETH EntryPoint non-standard | Medium | Verified code exists at canonical v0.7 address |
| No `debug_traceCall` on MegaETH | Low | Run Alto with `--safe-mode false`, bundler only accessible from Worker |
| Bundler downtime = no gasless writes | High | Monitor + auto-restart. Consider fallback operator key for critical system ops. |
| Paymaster drained by abuse | Medium | Off-chain policy: allowlists, rate limits, sender↔user binding, strict calldata decoding |
| Gas estimation wrong on MegaEVM | Medium | Generous gas limits, test extensively |
| Factory address compromise | **Critical** | Factory is immutable (no admin, no upgrade). Address is embedded as `immutable` in every app contract. If factory is wrong, entire permission model breaks. Triple-check factory address before deploying app contracts. |
| Direct bundler access bypass | High | Bundler is **never public**. Only the Worker can reach it. No Lit Action, no external client. |
| `SimpleAccount.execute()` misuse | Medium | Gateway decodes all calldata strictly. Only `execute()` allowed initially (not `executeBatch`). Whitelisted targets + selectors. Reject `value > 0` at both outer and inner levels. |
| Operator lane becomes new bottleneck | Medium | Audit that per-scrobble hot path is fully user-signed. Operator ops must be low-frequency admin only. |
| `/quotePaymaster` as public oracle | High | Gateway auth required (PKP-signed challenge with TTL). Rate-limit per-user, not per-IP. |
| `initCode` sponsoring malicious deployment | Medium | Gateway validates `initCode` is exactly our factory + expected `createAccount(user, SALT)`. |
| Story Protocol txs still use sponsor PKP | Low | Low volume, separate chain, migrate later if needed |

---

## Scaling & Operations

### Scaling Knobs

- **Multiple bundler executor keys**: Alto supports `--executor-private-keys key1,key2,...`. Shards bundle submission across multiple EOAs to avoid bundler-level nonce contention at very high throughput.
- **Paymaster deposit monitoring**: Alert when EntryPoint deposit drops below threshold. Auto-top-up from treasury.
- **Bundle TX inclusion latency**: Monitor time from UserOp submission to on-chain inclusion. If latency spikes, investigate MegaETH mempool behavior or bundler queue depth.
- **UserOp failure tracking**: Track failure reasons (signature invalid, paymaster rejected, out of gas, contract revert). Dashboard for operational visibility.
- **Gateway queue depth**: If step 1 requests back up, scale gateway horizontally (stateless policy checks).
- **Fallback operator mode**: For critical system-only ops (verification mirror, track metadata fixes), maintain an operator key that can submit raw transactions. Never use for user-facing writes — this is a break-glass path only.

---

## File Tree (new/modified)

```
contracts/megaeth/
├── lib/
│   └── account-abstraction/            # NEW: eth-infinitism v0.7
├── src/
│   ├── aa/
│   │   ├── IHeavenAccountFactory.sol   # NEW: minimal getAddress() interface
│   │   ├── HeavenAccountFactory.sol    # NEW: SimpleAccount factory (immutable)
│   │   └── HeavenPaymaster.sol         # NEW: VerifyingPaymaster
│   ├── ScrobbleV3.sol                  # MODIFIED: onlyAccountOf + onlyOperator
│   ├── PlaylistV1.sol                  # MODIFIED: onlyAccountOf + onlyPlaylistOwnerAccount
│   ├── PostsV1.sol                     # MODIFIED: onlyAccountOf(creator)
│   ├── EngagementV2.sol                # MODIFIED: onlyAccountOf per function
│   ├── ContentRegistry.sol             # MODIFIED: onlyAccountOf(contentOwner)
│   ├── VerificationMirror.sol          # MODIFIED: onlySponsor → onlyOperator
│   └── RecordsV1.sol                   # MODIFIED: remove sponsor sender check
├── script/
│   └── DeployAA.s.sol                  # NEW: deploy factory + paymaster
├── test/
│   ├── AA.t.sol                        # NEW: 4337 integration tests
│   └── AccountBinding.t.sol            # NEW: onlyAccountOf modifier tests
└── remappings.txt                      # MODIFIED: add account-abstraction

services/
├── docker-compose.yml                  # NEW: Alto + gateway (co-located, private network)
├── bundler/
│   ├── .env.example                    # NEW: Bundler signer key, RPC URL, EntryPoint
│   └── README.md                       # NEW
└── paymaster-signer/
    ├── src/index.ts                    # NEW: gateway + auth + signer + forwarder
    ├── Dockerfile                      # NEW: (Option A) co-located container
    ├── wrangler.toml                   # NEW: (Option B) CF Worker
    └── .env.example                    # NEW: BUNDLER_URL, PAYMASTER_SIGNER_KEY, FACTORY_ADDRESS

lit-actions/
├── actions/
│   ├── scrobble-submit-v4.js           # NEW: 4337 version
│   ├── playlist-v2.js                  # NEW: 4337 version
│   ├── heaven-claim-name-v2.js         # NEW: 4337 version
│   ├── heaven-set-profile-v2.js        # NEW: 4337 version
│   ├── heaven-set-records-v2.js        # NEW: 4337 version
│   ├── self-verify-mirror-v2.js        # NEW: 4337 version (operator key)
│   ├── photo-reveal-v2.js             # NEW: 4337 version
│   ├── post-create-v2.js              # NEW: 4337 MegaETH + sponsor Story
│   ├── post-register-v2.js            # NEW: 4337 MegaETH + sponsor Story
│   └── post-text-v2.js                # NEW: 4337 MegaETH + sponsor Story
└── cids/dev.json                       # MODIFIED: new CIDs

apps/frontend/src/
├── lib/
│   ├── aa/
│   │   └── smart-account.ts            # NEW: deterministic address computation
│   └── lit/action-cids.ts              # MODIFIED: new CIDs
└── providers/AuthContext.tsx            # MODIFIED: compute smart account address on auth
```
