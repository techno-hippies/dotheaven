# Contracts: MegaETH (no longer active)

Active contracts are in `contracts/tempo/`.

Operational notes for `contracts/megaeth-legacy`.

## Purpose
Heaven protocol contracts that were on MegaETH, including:
- name + records
- profile
- scrobbling
- playlists/posts/engagement
- ScrobbleV4 (legacy, AA removed — source kept as reference)

## Core Contract Areas
- Naming/records: `RegistryV1.sol`, `RecordsV1.sol`, `Resolver.sol`
- Profile: `ProfileV2.sol`
- Music/activity: `ScrobbleV4.sol`, `PlaylistV1.sol`, `LyricsEngagementV1.sol`
- Social: `PostsV1.sol`, `EngagementV2.sol`, `FollowV1.sol`
- AA stack: REMOVED (was `src/aa/`). AccountBinding inlined in ScrobbleV4.sol for source compat.

## Local Workflow
From `contracts/megaeth`:

```bash
forge build
forge test
```

## Deploy (Testnet Pattern)
From `contracts/megaeth`:

```bash
source .env
forge script script/DeployHeaven.s.sol \
  --rpc-url megaeth_testnet \
  --broadcast \
  --legacy \
  --gas-price 1000000 \
  --skip-simulation \
  --gas-limit 10000000
```

## MegaETH Foundry Notes
- Prefer `forge script` over `forge create` for complex deploys.
- Use `--skip-simulation` for broadcast scripts.
- Pass explicit legacy gas settings.

## Verify (Blockscout Example)

```bash
forge verify-contract <ADDRESS> src/RegistryV1.sol:RegistryV1 \
  --chain-id 6343 \
  --verifier blockscout \
  --verifier-url https://megaeth-testnet-v2.blockscout.com/api
```

## Files You Will Touch Most
- `contracts/megaeth/src/`
- `contracts/megaeth/script/`
- `contracts/megaeth/test/`
- `contracts/megaeth/foundry.toml`

## Safety Rules
- Preserve storage layout on upgrades or migration-sensitive contracts.
- Any auth model changes must ship with explicit tests.
- Keep contract address/config updates synchronized with app + service consumers.
