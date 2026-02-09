# Heaven Contracts — MegaETH

## Overview

`.heaven` name registry deployed on MegaETH L2. ENS-compatible architecture with native ETH payments.

## Contracts

| Contract | Description |
|----------|-------------|
| `RegistryV1.sol` | ERC-721 name NFTs for `.heaven` subnames. Native ETH payments. |
| `RecordsV1.sol` | ENS-compatible record storage (addr, text, contenthash). Gated by NFT ownership. |
| `Resolver.sol` | CCIP-Read resolver for ENS gateway compatibility (`*.eth.limo`). |
| `ProfileV2.sol` | On-chain dating/social profile (packed enums, unified language model). Supports `msg.sender` and sponsored `upsertProfileFor()` with EIP-191 sig. |
| `ScrobbleV3.sol` | **Legacy** — Track Registry + Scrobble Events (sponsor-gated). Superseded by ScrobbleV4 (AA-gated) for frontend scrobbles. Still used by Playlist Lit Action for track registration. |
| `PlaylistV1.sol` | Event-sourced playlists. Stores header + `tracksHash`/`trackCount`/`version` in storage. Full track lists + name/coverCid emitted in events for subgraph. `onlySponsor` gated. `setTracks()` for reorder/add/remove (full list replace). Tombstone delete. |
| `ContentRegistry.sol` | Filecoin content pointers + access control. `contentId = keccak256(trackId, owner)`. Stores encrypted file refs (pieceCid, algo, datasetOwner). `canAccess(user, contentId)` for Lit Action gating. Batch grant/revoke. `onlySponsor` gated. |
| `EngagementV1.sol` | ⚠️ Deprecated. Uses Story `ipId` as key. See EngagementV2 for new posts. |
| `EngagementV2.sol` | Likes, comments, translations, flags, reveals, nullifier bans. Uses `postIdBytes32` as universal key. Permissionless `payReveal()` with 24h viewing windows. Immutable charity wallet. Privacy-preserving reveal logging (nullifierHash offchain). |
| `PostsV1.sol` | Post existence + metadata pointer on MegaETH. Cross-chain mirror of Story Protocol IP Asset registrations. `postFor()` emits `PostCreated` events for subgraph indexing. Stores `creatorOf[ipId]` for idempotency. `onlySponsor` gated. |
| `ScrobbleV4.sol` | AA-enabled Track Registry + Scrobble Events. Same logic as V3 but uses ERC-4337 Account Abstraction: user-facing functions (`scrobbleBatch`, `registerAndScrobbleBatch`) gated by `onlyAccountOf(user)` (factory-deterministic binding), admin functions (`registerTracksBatch`, `updateTrack`, covers) gated by `onlyOperator`. Inherits `AccountBinding`. **Includes `uint32 durationSec` field**. |
| `aa/HeavenAccountFactory.sol` | Wraps eth-infinitism `SimpleAccountFactory` v0.7 via composition. Deploys `SimpleAccount` proxies via CREATE2. Exposes `getAddress(owner, salt)` for deterministic address derivation. |
| `aa/HeavenPaymaster.sol` | Thin wrapper around eth-infinitism `VerifyingPaymaster` v0.7. Off-chain gateway signer validates policy and signs UserOp approvals. |
| `aa/AccountBinding.sol` | Shared abstract contract with `onlyAccountOf(user)` modifier. Verifies `msg.sender == FACTORY.getAddress(user, SALT)` — not spoofable. Inherited by ScrobbleV4 (and future AA-enabled contracts). |
| `SessionEscrowV1.sol` | ETH-native escrow for scheduled 1:1 voice sessions. Hosts publish slots → guests book (payable) → oracle attests outcome → challenge window → finalize payout. Pull-payment fallback via `owed` mapping for failed transfers. |
| `FollowV1.sol` | Social follow graph. `followFor()`/`unfollowFor()` sponsor-gated. On-chain `follows` mapping + `followerCount`/`followingCount` counters. `followBatchFor()` for multi-follow. Idempotent (no-ops if already following/unfollowing). |
| `LyricsEngagementV1.sol` | Song lyrics translation persistence. Stores translation CIDs per (ipId, language). Sponsor-gated. |
| `VerificationMirror.sol` | Mirrors Self.xyz verification state from Celo Sepolia. Stores verifiedAt + nationality. Sponsor-gated. |

## Chain Info

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| MegaETH Testnet | 6343 | `https://carrot.megaeth.com/rpc` | `https://megaeth-testnet-v2.blockscout.com` |
| MegaETH Frontier | 4326 | `https://mainnet.megaeth.com/rpc` | `https://megaeth.blockscout.com` |

## Pricing (Testnet)

All names are **FREE** (`pricePerYear = 0`). Tiered pricing for short names (2-4 chars) will be added for mainnet.

## Deployed (Testnet)

| Contract | Address |
|----------|---------|
| RegistryV1 | `0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2` |
| RecordsV1 | `0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3` |
| ProfileV2 | `0xa31545D33f6d656E62De67fd020A26608d4601E5` |
| ScrobbleV3 | `0x144c450cd5B641404EEB5D5eD523399dD94049E0` |
| PlaylistV1 | `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329` |
| ContentRegistry | `0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2` |
| EngagementV1 | `0x2A3beA895AE5bb4415c436155cbA15a97ACc2C77` |
| EngagementV2 | `0xAF769d204e51b64D282083Eb0493F6f37cd93138` |
| PostsV1 | `0xFe674F421c2bBB6D664c7F5bc0D5A0204EE0bFA6` |
| HeavenAccountFactory | `0xB66BF4066F40b36Da0da34916799a069CBc79408` |
| HeavenPaymaster | `0xEb3C4c145AE16d7cC044657D1632ef08d6B2D5d9` |
| ScrobbleV4 | `0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1` |
| SessionEscrowV1 | `0x132212B78C4a7A3F19DE1BF63f119848c765c1d2` |
| LyricsEngagementV1 | `0x6C832a6Cb9F360f81D697Bed66250Dc361386EB4` |
| FollowV1 | `0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb` |

Internal (deployed by factory constructor):
| SimpleAccountFactory | `0x48833641e079936664df306e64a160256520a33F` |
| SimpleAccount (impl) | `0xA17Fd81A1fFEC9f5694343dd4BFe29847B0eb9E7` |

Heaven Node: `0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27`
EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

## MegaETH Foundry Quirks

MegaETH uses MegaEVM, not standard EVM. Foundry's local gas estimation uses its own EVM and **will get gas wrong**, causing `intrinsic gas too low` errors on broadcast.

### forge script
**Always** pass `--skip-simulation` and a hardcoded `--gas-limit`:
```bash
forge script script/DeployHeaven.s.sol \
  --rpc-url megaeth_testnet \
  --broadcast \
  --legacy \
  --gas-price 1000000 \
  --skip-simulation \
  --gas-limit 10000000
```
Without `--skip-simulation`, forge simulates locally, gets wrong gas estimates, and every broadcast tx fails.

### cast send
Use `--legacy` with explicit `--gas-price` and `--gas-limit`:
```bash
cast send --legacy --gas-price 1000000 --gas-limit 2000000 \
  --rpc-url https://carrot.megaeth.com/rpc \
  --private-key $PRIVATE_KEY \
  <ADDRESS> "foo(uint256)" 42
```

### Key points
- MegaETH gas price is ~0.001 gwei (`1000000` wei). Always pass `--gas-price 1000000`.
- Use `--legacy` (type 0 txs). EIP-1559 fields may cause issues.
- Foundry's `--legacy` flag is sometimes ignored by `forge create` — prefer `forge script` with `--skip-simulation` or raw `cast send`.
- For setup calls after deploy, generous `--gas-limit` is needed (MegaEVM gas costs differ from EVM). A call that simulates at 50K locally may need 600K on MegaEVM. Large contract deploys (e.g. ProfileV1) used 66M gas — use `--gas-limit 200000000` for safety.
- Simple `cast send` with `--legacy` works reliably for individual txs.

## Commands

```bash
# Deploy to MegaETH Testnet
source .env
forge script script/DeployHeaven.s.sol --rpc-url megaeth_testnet --broadcast --legacy --gas-price 1000000 --skip-simulation --gas-limit 10000000

# Verify on Blockscout
forge verify-contract <ADDRESS> src/RegistryV1.sol:RegistryV1 --chain-id 6343 --verifier blockscout --verifier-url https://megaeth-testnet-v2.blockscout.com/api
```

## Architecture

### Name Registration
```
registerFor(parentNode, "alice", userAddress, 365 days)
```
- `parentNode` = `namehash("heaven.hnsbridge.eth")`
- `tokenId` = `uint256(keccak256(parentNode, keccak256("alice")))`
- NFT minted to `userAddress`

### Primary Name (Reverse Mapping)
```solidity
mapping(address => uint256) public primaryTokenId;
primaryName(addr) → (label, parentNode)   // validated: ownership + expiry
primaryNode(addr) → bytes32 node          // for record lookups
setPrimaryName(tokenId)                   // manual set (must own + not expired)
clearPrimaryName()                        // manual clear
```
- Auto-set on registration via `_autoSetPrimary()` — replaces expired/transferred primaries
- Cleared on transfer in `_update()`, cleared on burn in `_clearToken()`
- Views return empty if token expired or no longer owned

### Records
```
setText(node, "avatar", "ipfs://Qm...")
setAddr(node, userAddress)
```
- Only NFT owner/approved can set records
- Records are versioned and expiry-gated

### ScrobbleV3 — Track Registry + Scrobble Events (Legacy, sponsor-gated)
```
trackId = keccak256(abi.encode(uint8(kind), bytes32(payload)))
```
- **kind 1 (MBID)**: `payload = bytes32(bytes16(mbid))` — left-aligned, low 16 bytes zero
- **kind 2 (ipId)**: `payload = bytes32(uint256(uint160(ipId)))` — right-aligned, high 12 bytes zero
- **kind 3 (meta)**: `payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))`
- Contract computes trackId internally from `(kind, payload)` — no caller-supplied trackIds
- Canonical payload checks enforce correct alignment
- `registerAndScrobbleBatch()` registers new tracks + scrobbles all in one tx
- `updateTrack()` for typo/casing fixes (preserves trackId/payload)
- Display strings (title/artist/album) stored on-chain in original casing
- Normalized strings used only for kind 3 payload derivation
- **Note**: Frontend scrobbles now use ScrobbleV4 (AA). V3 is still used by the Playlist Lit Action for track registration.

### ScrobbleV4 — AA-enabled Track Registry + Scrobble Events (Primary)
Same track registry and scrobble logic as V3, but permission model replaced with ERC-4337 Account Abstraction:
- **User-facing** (`scrobbleBatch`, `registerAndScrobbleBatch`): `onlyAccountOf(user)` — `msg.sender` must be user's factory-derived SimpleAccount
- **Admin** (`registerTracksBatch`, `updateTrack`, `setTrackCover`, `setTrackCoverBatch`): `onlyOperator` — `mapping(address => bool)` (multiple operators, not single sponsor)
- **Factory binding**: `FACTORY` is immutable, `ACCOUNT_SALT = 0`. Modifier checks `msg.sender == FACTORY.getAddress(user, 0)` — not spoofable.
- **Events**: All events emit `user` (PKP EOA), never `msg.sender` (the smart account)

### ERC-4337 Account Abstraction Architecture
```
User PKP signs UserOp → Gateway validates + signs paymasterAndData → Bundler (Alto) submits to EntryPoint → SimpleAccount.execute() → ScrobbleV4
```
- **HeavenAccountFactory**: wraps `SimpleAccountFactory` v0.7. CREATE2-deterministic: `getAddress(owner, 0)` = user's account address.
- **HeavenPaymaster**: `VerifyingPaymaster` v0.7. Gateway signer signs UserOp approvals off-chain. Burns paymaster's EntryPoint deposit for gas.
- **AccountBinding**: shared `onlyAccountOf(user)` modifier. Inherited by AA-enabled app contracts.
- **Two-step handshake**: (1) `/quotePaymaster` returns `paymasterAndData`, (2) user signs `userOpHash` (which covers `paymasterAndData`), (3) `/sendUserOp` forwards to bundler.
- **SimpleAccount is UUPS-upgradeable** (ERC1967Proxy). Gateway must reject `target == sender` to prevent `execute(self, upgradeToAndCall(...))`.

### PlaylistV1 — Event-sourced Playlists
```
playlistId = keccak256(abi.encode(owner, createdAt, nonce))
tracksHash = keccak256(abi.encode(TRACKS_SEED, playlistId, trackIds))
```
- **Event-sourced**: name/coverCid/trackIds emitted in events only, not stored in contract state
- **Integrity checkpoint**: `tracksHash` + `trackCount` + `version` stored for verification
- **Operations**: `createPlaylistFor()`, `setTracks()` (full list replace), `updateMeta()`, `deletePlaylist()` (tombstone)
- **Visibility**: uint8 enum (0=public, 1=unlisted, 2=private) — metadata for subgraph/frontend filtering
- **Bounds**: MAX_TRACKS=500, MAX_NAME=64 bytes, MAX_CID=128 bytes
- **No track existence checks** — Lit Action ensures tracks are registered in ScrobbleV3 before calling playlist contract
- **Replay protection**: `consumeNonce(user, expectedNonce)` — monotonic `userNonces[user]` consumed by Lit Action before each operation
- **Version counter** increments on every mutation (tracks set, meta update, delete)
- Subgraph reconstructs full playlist state from `PlaylistTracksSet` events filtered by current `version`

### Sponsor PKP Flow (via Lit Action)
1. **Claim name**: Sponsor PKP calls `registerFor()` — pays gas, user gets NFT
2. User's own PKP calls `RecordsV1.setText()` to set avatar CID (cheap tx)
3. **Set profile**: Sponsor PKP calls `upsertProfileFor(user, profileInput, signature)` — pays gas, profile written under user's address. User signs EIP-191 message `heaven:profile:{user}:{profileHash}:{nonce}` to authorize. Nonce-based replay protection.

## Files

```
contracts/megaeth/
├── src/
│   ├── RegistryV1.sol         # Name NFT registry (native ETH)
│   ├── RecordsV1.sol          # ENS record storage
│   ├── Resolver.sol           # CCIP-Read resolver
│   ├── ProfileV1.sol          # Legacy profile (deprecated)
│   ├── ProfileV2.sol          # Social profile (packed enums, unified language model)
│   ├── ScrobbleV3.sol         # Track registry + scrobble events (sponsor-gated)
│   ├── ScrobbleV4.sol         # Track registry + scrobble events (AA-gated)
│   ├── PlaylistV1.sol         # Event-sourced playlists
│   ├── ContentRegistry.sol    # Filecoin content pointers + access control
│   ├── EngagementV1.sol       # Engagement (deprecated, see V2)
│   ├── EngagementV2.sol       # Likes, comments, translations, flags, reveals
│   ├── PostsV1.sol            # Social posts
│   ├── FollowV1.sol           # Social follow graph (sponsor-gated)
│   ├── LyricsEngagementV1.sol # Song lyrics translation persistence
│   ├── SessionEscrowV1.sol    # Voice session escrow
│   ├── VerificationMirror.sol # Self.xyz verification mirror from Celo
│   ├── aa/
│   │   ├── IHeavenAccountFactory.sol  # Minimal factory interface
│   │   ├── HeavenAccountFactory.sol   # SimpleAccountFactory v0.7 wrapper
│   │   ├── HeavenPaymaster.sol        # VerifyingPaymaster v0.7 wrapper
│   │   └── AccountBinding.sol         # Shared onlyAccountOf modifier
│   └── efp/
│       ├── EFPListRecords.sol         # EFP list records
│       ├── interfaces/
│       │   └── IEFPListRecords.sol    # EFP list records interface
│       └── lib/
│           └── ENSReverseClaimer.sol  # ENS reverse claimer
├── script/
│   ├── DeployHeaven.s.sol              # Deploy script (registry/records/profile)
│   ├── DeployRecordsV1.s.sol           # Deploy RecordsV1
│   ├── DeployProfileV2.s.sol           # Deploy ProfileV2
│   ├── DeployScrobbleV3.s.sol          # Deploy ScrobbleV3
│   ├── DeployScrobbleV4.s.sol          # Deploy ScrobbleV4
│   ├── DeployPlaylistV1.s.sol          # Deploy PlaylistV1
│   ├── DeployContentRegistry.s.sol     # Deploy ContentRegistry
│   ├── DeployEngagementV1.s.sol        # Deploy EngagementV1
│   ├── DeployEngagementV2.s.sol        # Deploy EngagementV2
│   ├── DeployPostsV1.s.sol             # Deploy PostsV1
│   ├── DeployFollowV1.s.sol            # Deploy FollowV1
│   ├── DeployLyricsEngagementV1.s.sol  # Deploy LyricsEngagementV1
│   ├── DeploySessionEscrow.s.sol       # Deploy SessionEscrowV1
│   ├── DeployVerificationMirror.s.sol  # Deploy VerificationMirror
│   ├── DeployEFPListRecords.s.sol      # Deploy EFP list records
│   ├── DeployAA.s.sol                  # Deploy AA stack (factory/paymaster/ScrobbleV4)
│   └── SeedProfiles.s.sol             # Seed test profiles
├── test/
│   ├── RegistryV1.t.sol       # Primary name + transfer clearing tests
│   ├── ProfileV1.t.sol        # Legacy profile tests
│   ├── ProfileV2.t.sol        # Profile sig verification + replay + gas tests
│   ├── ScrobbleV3.t.sol       # Track registry + scrobble tests
│   ├── ScrobbleV4.t.sol       # AA-gated scrobble + factory binding tests
│   ├── PlaylistV1.t.sol       # Playlist CRUD + tombstone tests
│   ├── FollowV1.t.sol         # Follow/unfollow + batch + counts tests
│   └── SessionEscrowV1.t.sol  # Session escrow tests
├── foundry.toml
├── remappings.txt
└── .env.example
```
