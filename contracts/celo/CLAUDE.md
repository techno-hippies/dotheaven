# Contracts: Celo (Self Verification)

Operational notes for `contracts/celo`.

## Purpose
- On-chain Self.xyz verification source of truth on Celo.
- Stores verification status used by Heaven profile flows.

## Main Contract
- `contracts/celo/src/SelfProfileVerifier.sol`

## Local Workflow
From `contracts/celo`:

```bash
bun install
forge build
forge test
```

## Deploy (Example: Celo Sepolia)
From `contracts/celo`:

```bash
source .env
forge script script/DeploySelfProfileVerifier.s.sol \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org \
  --broadcast
```

## Verify (Example)

```bash
forge verify-contract <ADDRESS> src/SelfProfileVerifier.sol:SelfProfileVerifier \
  --chain-id 11142220 \
  --verifier etherscan \
  --verifier-url https://api-sepolia.celoscan.io/api
```

## Env Inputs
- `PRIVATE_KEY`
- `CELOSCAN_API_KEY`
- `SELF_HUB` (optional override)

## Integration Notes
- MegaETH reads verification state via mirror flows.
- If this contract is redeployed, dependent app/action config must be updated.

## Files You Will Touch Most
- `contracts/celo/src/SelfProfileVerifier.sol`
- `contracts/celo/script/DeploySelfProfileVerifier.s.sol`
- `contracts/celo/foundry.toml`
