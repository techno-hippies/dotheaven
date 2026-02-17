# Contracts: Tempo

Heaven protocol contracts on Tempo (Moderato testnet, chain 42431).

## Purpose
Port of MegaETH contracts to Tempo. No AA contracts — Tempo handles account abstraction natively (passkeys, fee sponsorship, session keys).

## Contracts
- Naming/records: `RegistryV1.sol`, `RecordsV1.sol`
- Profile: `ProfileV2.sol`
- Music/activity: `ScrobbleV4.sol`
- Playlists: `PlaylistV1.sol`, `PlaylistShareV1.sol`
- Content: `ContentRegistry.sol`
- More contracts ported incrementally

## Local Workflow
```bash
cd contracts/tempo
forge build
forge test
```

## Deploy (Tempo Moderato Testnet)
```bash
source .env
forge script script/DeployCore.s.sol \
  --rpc-url tempo_moderato \
  --broadcast
```

## Key Differences from MegaETH
- No `--legacy` or `--skip-simulation` needed (verify)
- No AA contracts (HeavenAccountFactory, HeavenPaymaster) — Tempo native
- Fee sponsorship via Tempo `feePayer` transaction field, not paymaster
- User accounts are passkey-derived EOAs, not smart contract wallets
