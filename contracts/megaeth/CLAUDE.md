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
| `ScrobbleV1.sol` | Minimal scrobble event log. Emits `ScrobbleBatch` events for subgraph indexing. No storage. |

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
| RegistryV1 | `0x61CAed8296a2eF78eCf9DCa5eDf3C44469c6b1E2` |
| RecordsV1 | `0x351ba82bAfDA1070bba8158852624653e3654929` |
| ProfileV1 | `0x0A6563122cB3515ff678A918B5F31da9b1391EA3` |
| ScrobbleV1 | `0x8fF05D1Ba81542d7bE2B79d6912C1D65F339dE0e` |

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

### Records
```
setText(node, "avatar", "ipfs://Qm...")
setAddr(node, userAddress)
```
- Only NFT owner/approved can set records
- Records are versioned and expiry-gated

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
│   └── ProfileV1.sol          # Social profile (packed enums)
├── script/
│   └── DeployHeaven.s.sol     # Deploy script
├── test/
│   ├── ProfileV1.t.sol          # Profile sig verification + replay tests
│   └── SessionEscrowV1.t.sol    # Session escrow tests
├── foundry.toml
├── remappings.txt
└── .env.example
```
