# Heaven Contracts — MegaETH

## Overview

`.heaven` name registry deployed on MegaETH L2. ENS-compatible architecture with native ETH payments.

## Contracts

| Contract | Description |
|----------|-------------|
| `RegistryV1.sol` | ERC-721 name NFTs for `.heaven` subnames. Native ETH payments. |
| `RecordsV1.sol` | ENS-compatible record storage (addr, text, contenthash). Gated by NFT ownership. |
| `Resolver.sol` | CCIP-Read resolver for ENS gateway compatibility (`*.eth.limo`). |
| `ProfileV1.sol` | On-chain dating/social profile (packed enums). Supports `msg.sender` and sponsored `upsertProfileFor()` with EIP-191 sig. |
| `ScrobbleV3.sol` | Track Registry + Scrobble Events. Tracks registered once with metadata on-chain, scrobbles as cheap event refs. Deterministic `trackId = keccak256(abi.encode(kind, payload))`. Canonical payload checks. `updateTrack()` for typo fixes. |
| `PlaylistV1.sol` | Event-sourced playlists. Stores header + `tracksHash`/`trackCount`/`version` in storage. Full track lists + name/coverCid emitted in events for subgraph. `onlySponsor` gated. `setTracks()` for reorder/add/remove (full list replace). Tombstone delete. |
| `ContentRegistry.sol` | Filecoin content pointers + access control. `contentId = keccak256(trackId, owner)`. Stores encrypted file refs (pieceCid, algo, datasetOwner). `canAccess(user, contentId)` for Lit Action gating. Batch grant/revoke. `onlySponsor` gated. |

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
| ProfileV1 | `0x0A6563122cB3515ff678A918B5F31da9b1391EA3` |
| ScrobbleV3 | `0x144c450cd5B641404EEB5D5eD523399dD94049E0` |
| PlaylistV1 | `0xF0337C4A335cbB3B31c981945d3bE5B914F7B329` |
| ContentRegistry | `0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2` |

Heaven Node: `0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27`

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

### ScrobbleV3 — Track Registry + Scrobble Events
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
│   ├── ProfileV1.sol          # Social profile (packed enums)
│   ├── ScrobbleV3.sol         # Track registry + scrobble events
│   └── PlaylistV1.sol         # Event-sourced playlists
├── script/
│   ├── DeployHeaven.s.sol     # Deploy script (registry/records/profile)
│   ├── DeployScrobbleV3.s.sol # Deploy ScrobbleV3
│   └── DeployPlaylistV1.s.sol # Deploy PlaylistV1
├── test/
│   ├── RegistryV1.t.sol       # Primary name + transfer clearing tests
│   ├── ProfileV1.t.sol        # Profile sig verification + replay tests
│   ├── ScrobbleV3.t.sol       # Track registry + scrobble tests
│   ├── PlaylistV1.t.sol       # Playlist CRUD + tombstone tests
│   └── SessionEscrowV1.t.sol  # Session escrow tests
├── foundry.toml
├── remappings.txt
└── .env.example
```
